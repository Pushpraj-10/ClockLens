package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/coder/websocket"

	"github.com/clocklens/clocklens/internal/server/causality"
	"github.com/clocklens/clocklens/internal/server/hub"
	"github.com/clocklens/clocklens/internal/server/orchestrator"
	"github.com/clocklens/clocklens/internal/server/run"
	"github.com/clocklens/clocklens/internal/server/store"
	"github.com/clocklens/clocklens/pkg/protocol"
)

// maxImportBytes caps the size of an imported trace (10 MiB).
const maxImportBytes = 10 << 20

// Server exposes REST commands/queries and the WebSocket event stream to the web UI.
type Server struct {
	hub  *hub.Hub
	orch *orchestrator.Orchestrator
	runs *run.Manager
}

// New creates the API server.
func New(h *hub.Hub, o *orchestrator.Orchestrator, r *run.Manager) *Server {
	return &Server{hub: h, orch: o, runs: r}
}

// Handler returns the HTTP handler. CORS is wide open: security is out of scope for
// this teaching tool.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

	// Nodes and runs.
	mux.HandleFunc("GET /api/nodes", s.listNodes)
	mux.HandleFunc("POST /api/nodes/{id}/commands", s.sendCommand)
	mux.HandleFunc("POST /api/runs", s.newRun)

	// Events and causality queries.
	mux.HandleFunc("GET /api/events", s.listEvents)
	mux.HandleFunc("GET /api/causality/{id}", s.relations)
	mux.HandleFunc("GET /api/compare", s.compare)
	mux.HandleFunc("GET /api/misleading", s.misleading)

	// Trace export / import.
	mux.HandleFunc("GET /api/export", s.export)
	mux.HandleFunc("POST /api/import", s.importTrace)

	// Live stream.
	mux.HandleFunc("GET /ws", s.stream)

	return cors(mux)
}

// cors allows the web UI (any origin) to call the API.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

		// Answer preflight requests directly.
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)

			return
		}

		next.ServeHTTP(w, r)
	})
}

type nodeInfo struct {
	ID     string           `json:"id"`
	Status *protocol.Status `json:"status"`
}

// listNodes returns every known node with its latest status, if it has reported one.
func (s *Server) listNodes(w http.ResponseWriter, _ *http.Request) {
	statuses := map[string]protocol.Status{}
	for _, st := range s.hub.Snapshot().Statuses {
		statuses[st.ID] = st
	}

	out := []nodeInfo{}

	for _, id := range s.orch.Nodes() {
		info := nodeInfo{ID: id}
		if st, ok := statuses[id]; ok {
			info.Status = &st
		}

		out = append(out, info)
	}

	writeJSON(w, http.StatusOK, out)
}

// sendCommand forwards a control command to one node.
func (s *Server) sendCommand(w http.ResponseWriter, r *http.Request) {
	var cmd protocol.Command
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&cmd); err != nil {
		httpError(w, http.StatusBadRequest, "bad command body: "+err.Error())

		return
	}

	switch err := s.orch.Send(r.PathValue("id"), cmd); {
	case err == nil:
		w.WriteHeader(http.StatusAccepted)
	case errors.Is(err, orchestrator.ErrUnknownNode):
		httpError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, orchestrator.ErrInvalidCommand):
		httpError(w, http.StatusBadRequest, err.Error())
	default:
		httpError(w, http.StatusInternalServerError, err.Error())
	}
}

// newRun clears the events and resets every node.
func (s *Server) newRun(w http.ResponseWriter, _ *http.Request) {
	if err := s.runs.NewRun(); err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())

		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// listEvents returns every stored event in arrival order.
func (s *Server) listEvents(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.hub.Snapshot().Events)
}

// relations returns the past, future and concurrent events of one event.
func (s *Server) relations(w http.ResponseWriter, r *http.Request) {
	rel, err := causality.Relate(s.hub.Snapshot().Events, r.PathValue("id"))
	if err != nil {
		causalityError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, rel)
}

// compare returns the happened-before verdict (with proof) for events a and b.
func (s *Server) compare(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	a, b := q.Get("a"), q.Get("b")
	if a == "" || b == "" {
		httpError(w, http.StatusBadRequest, "query parameters a and b are required")

		return
	}

	c, err := causality.Compare(s.hub.Snapshot().Events, a, b)
	if err != nil {
		causalityError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, c)
}

// misleading returns the concurrent pairs that Lamport clocks would wrongly order.
func (s *Server) misleading(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, causality.MisleadingPairs(s.hub.Snapshot().Events))
}

// causalityError maps a causality error to an HTTP status.
func causalityError(w http.ResponseWriter, err error) {
	if errors.Is(err, causality.ErrUnknownEvent) {
		httpError(w, http.StatusNotFound, err.Error())

		return
	}

	httpError(w, http.StatusInternalServerError, err.Error())
}

// export downloads the current run as a JSON trace.
func (s *Server) export(w http.ResponseWriter, _ *http.Request) {
	data, err := store.Marshal(s.hub.Snapshot().Events)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())

		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="clocklens-trace.json"`)

	_, _ = w.Write(data)
}

// importTrace replaces the current run with an uploaded JSON trace.
func (s *Server) importTrace(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxImportBytes))
	if err != nil {
		httpError(w, http.StatusBadRequest, err.Error())

		return
	}

	evs, err := store.Parse(body)
	if err != nil {
		httpError(w, http.StatusBadRequest, err.Error())

		return
	}

	if err := s.hub.Load(evs); err != nil {
		httpError(w, http.StatusBadRequest, err.Error())

		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// stream sends a snapshot, then every new event and status, over a WebSocket.
func (s *Server) stream(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true}) // any origin: dev tool
	if err != nil {
		return
	}
	defer conn.CloseNow()

	ch, cancel := s.hub.Subscribe() // subscribe before the snapshot so nothing is missed
	defer cancel()

	ctx := conn.CloseRead(r.Context())

	// First the full current state...
	if !write(ctx, conn, s.hub.Snapshot()) {
		return
	}

	// ...then every update until the client leaves.
	for {
		select {
		case <-ctx.Done():
			return

		case m, ok := <-ch:
			if !ok { // too slow; the client should reconnect and resync
				conn.Close(websocket.StatusPolicyViolation, "too slow")

				return
			}

			if !write(ctx, conn, m) {
				return
			}
		}
	}
}

// write sends m as a JSON text frame and reports whether it succeeded.
func write(ctx context.Context, conn *websocket.Conn, m hub.Message) bool {
	data, err := json.Marshal(m)
	if err != nil {
		log.Printf("api: marshal: %v", err)

		return false
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return conn.Write(ctx, websocket.MessageText, data) == nil
}

// writeJSON sends v as a JSON response with the given status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(v)
}

// httpError sends {"error": msg} with the given status.
func httpError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
