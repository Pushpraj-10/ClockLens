"use client";

import { useRef, useState } from "react";
import type { Mode, NodeStatus } from "@clocklens/events";
import { exportUrl, importTrace, newRun, sendCommand } from "../../lib/api";
import { laneColor } from "../../lib/colors";

interface Props {
  nodes: string[];
  statuses: Record<string, NodeStatus>;
  connected: boolean;
}

export function ControlPanel({ nodes, statuses, connected }: Props) {
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      setError(undefined);
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Cutting a link is symmetric: both ends drop messages from each other.
  const setCut = (a: string, b: string, cut: boolean) =>
    act(() => {
      const peers = (self: string, other: string) => {
        const set = new Set(statuses[self]?.partition ?? []);
        if (cut) set.add(other);
        else set.delete(other);
        return [...set];
      };
      return Promise.all([
        sendCommand(a, { type: "set_partition", peers: peers(a, b) }),
        sendCommand(b, { type: "set_partition", peers: peers(b, a) }),
      ]);
    });

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    await act(async () => importTrace(await file.text()));
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="controls">
      <section className="panel">
        <h2>Run</h2>
        <div className="row">
          <button onClick={() => act(newRun)} disabled={!connected} title="Clear all events and reset every node's clocks">
            New run
          </button>
          <a className="button" href={exportUrl} download="clocklens-trace.json">
            Export
          </a>
          <button onClick={() => fileInput.current?.click()} disabled={!connected}>
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => onImport(e.target.files?.[0])}
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      {nodes.length === 0 && (
        <section className="panel">
          <p className="muted">No nodes yet. Start the nodes and they will appear here.</p>
        </section>
      )}

      {nodes.map((id, i) => (
        <NodeCard
          key={id}
          id={id}
          color={laneColor(i)}
          status={statuses[id]}
          others={nodes.filter((n) => n !== id)}
          disabled={!connected || !statuses[id]}
          act={act}
          setCut={setCut}
        />
      ))}
    </div>
  );
}

interface NodeCardProps {
  id: string;
  color: string;
  status?: NodeStatus;
  others: string[];
  disabled: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  setCut: (a: string, b: string, cut: boolean) => Promise<void>;
}

function NodeCard({ id, color, status, others, disabled, act, setCut }: NodeCardProps) {
  const [target, setTarget] = useState<string>();
  const to = target && others.includes(target) ? target : others[0];
  const mode: Mode = status?.mode ?? "auto";
  const cut = new Set(status?.partition ?? []);
  const pending = status?.pending ?? [];

  return (
    <section className="panel node" style={{ borderTopColor: color }}>
      <h2 style={{ color }}>{id}</h2>

      <div className="row">
        <button disabled={disabled} onClick={() => act(() => sendCommand(id, { type: "local" }))}>
          Local event
        </button>
      </div>

      <div className="row">
        <select
          aria-label={`Send from ${id} to`}
          value={to ?? ""}
          onChange={(e) => setTarget(e.target.value)}
          disabled={disabled || others.length === 0}
        >
          {others.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <button disabled={disabled || !to} onClick={() => to && act(() => sendCommand(id, { type: "send", to }))}>
          Send message
        </button>
      </div>

      <div className="row">
        <span className="label">Incoming</span>
        <div className="segmented" role="group" aria-label={`Delivery mode of ${id}`}>
          {(["auto", "manual"] as const).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              disabled={disabled}
              onClick={() => act(() => sendCommand(id, { type: "set_mode", mode: m }))}
              title={m === "auto" ? "Deliver messages immediately" : "Hold messages until you deliver or drop them"}
            >
              {m === "auto" ? "Auto" : "Manual"}
            </button>
          ))}
        </div>
      </div>

      {others.length > 0 && (
        <div className="row wrap">
          <span className="label">Cut link to</span>
          {others.map((o) => (
            <label key={o} className="check">
              <input type="checkbox" checked={cut.has(o)} disabled={disabled} onChange={(e) => setCut(id, o, e.target.checked)} />
              {o}
            </label>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <ul className="pending" aria-label={`Messages held by ${id}`}>
          {pending.map((m) => (
            <li key={m.msgId}>
              <span>
                <code>{m.msgId}</code> from {m.from}
              </span>
              <span className="row">
                <button disabled={disabled} onClick={() => act(() => sendCommand(id, { type: "deliver", msgId: m.msgId }))}>
                  Deliver
                </button>
                <button disabled={disabled} onClick={() => act(() => sendCommand(id, { type: "drop", msgId: m.msgId }))}>
                  Drop
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
