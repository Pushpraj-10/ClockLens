package clock

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

const vectorsDir = "../../../contracts/clock-vectors"

func loadVectors(t *testing.T, name string, into any) {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(vectorsDir, name))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, into); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
}

func TestLamportVectors(t *testing.T) {
	var spec struct {
		Cases []struct {
			Name string `json:"name"`
			Ops  []struct {
				Op    string `json:"op"`
				Value uint64 `json:"value"`
			} `json:"ops"`
			Expect []uint64 `json:"expect"`
		} `json:"cases"`
	}
	loadVectors(t, "lamport.json", &spec)
	for _, c := range spec.Cases {
		t.Run(c.Name, func(t *testing.T) {
			var clk Lamport
			for i, op := range c.Ops {
				var got uint64
				if op.Op == "tick" {
					got = clk.Tick()
				} else {
					got = clk.Receive(op.Value)
				}
				if got != c.Expect[i] {
					t.Fatalf("step %d: got %d want %d", i, got, c.Expect[i])
				}
			}
		})
	}
}

func TestVectorVectors(t *testing.T) {
	var spec struct {
		Self  string `json:"self"`
		Cases []struct {
			Name string `json:"name"`
			Ops  []struct {
				Op    string `json:"op"`
				Value Vector `json:"value"`
			} `json:"ops"`
			Expect []Vector `json:"expect"`
		} `json:"cases"`
		Compare []struct {
			X      Vector `json:"x"`
			Y      Vector `json:"y"`
			Expect Order  `json:"expect"`
		} `json:"compare"`
	}
	loadVectors(t, "vector.json", &spec)
	for _, c := range spec.Cases {
		t.Run(c.Name, func(t *testing.T) {
			procs := make([]string, 0)
			for p := range c.Expect[0] {
				procs = append(procs, p)
			}
			clk := NewVectorClock(spec.Self, procs...)
			for i, op := range c.Ops {
				var got Vector
				if op.Op == "tick" {
					got = clk.Tick()
				} else {
					got = clk.Receive(op.Value)
				}
				// Missing key = 0, so compare via Compare rather than map equality.
				if Compare(got, c.Expect[i]) != Equal {
					t.Fatalf("step %d: got %v want %v", i, got, c.Expect[i])
				}
			}
		})
	}
	for _, c := range spec.Compare {
		if got := Compare(c.X, c.Y); got != c.Expect {
			t.Errorf("Compare(%v, %v) = %s, want %s", c.X, c.Y, got, c.Expect)
		}
	}
}
