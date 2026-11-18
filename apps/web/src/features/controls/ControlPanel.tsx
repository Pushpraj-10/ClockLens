"use client";

import { useRef, useState } from "react";
import type { Mode, NodeStatus } from "@clocklens/events";
import { exportUrl, importTrace, newRun, sendCommand } from "../../lib/api";
import { laneColor } from "../../lib/colors";

interface Props {
  nodes: string[];
  statuses: Record<string, NodeStatus>;
  connected: boolean;
  /** Advanced view: delivery mode, disconnects, export/import. */
  advanced: boolean;
  /** True when there are events a destructive action would throw away. */
  hasEvents: boolean;
}

const labelCls = "text-[13px] text-muted";

type Confirm = "new-run" | "import" | undefined;

export function ControlPanel({ nodes, statuses, connected, advanced, hasEvents }: Props) {
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState<Confirm>();
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

  const startNewRun = () => (hasEvents ? setConfirm("new-run") : act(newRun));
  const startImport = () => (hasEvents ? setConfirm("import") : fileInput.current?.click());

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section className="panel p-3" aria-label="Run">
        {confirm ? (
          <div role="alertdialog" aria-label="Confirm" className="flex flex-col gap-2">
            <p className="text-sm">
              {confirm === "new-run"
                ? "Clear every event and reset all clocks?"
                : "Importing replaces the events you have now. Continue?"}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className="btn btn-sm btn-primary"
                autoFocus
                onClick={() => {
                  const what = confirm;
                  setConfirm(undefined);
                  if (what === "new-run") void act(newRun);
                  else fileInput.current?.click();
                }}
              >
                {confirm === "new-run" ? "Yes, clear it" : "Choose a file…"}
              </button>
              <button className="btn btn-sm" onClick={() => setConfirm(undefined)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              className="btn btn-sm flex-1"
              onClick={startNewRun}
              disabled={!connected}
              title="Start over: clear all events and reset every node"
            >
              New run
            </button>
            {advanced && (
              <>
                <a className="btn btn-sm flex-1" href={exportUrl} download="clocklens-trace.json" title="Download this run as JSON">
                  Export
                </a>
                <button className="btn btn-sm flex-1" onClick={startImport} disabled={!connected} title="Load a run from a JSON file">
                  Import
                </button>
              </>
            )}
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => onImport(e.target.files?.[0])}
        />
        {error && (
          <p className="mt-2 text-sm text-bad" role="alert">
            {error}
          </p>
        )}
      </section>

      {nodes.length === 0 && (
        <section className="panel">
          <p className="text-muted">No nodes yet. Start the nodes and they will appear here.</p>
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
          advanced={advanced}
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
  advanced: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  setCut: (a: string, b: string, cut: boolean) => Promise<void>;
}

function NodeCard({ id, color, status, others, disabled, advanced, act, setCut }: NodeCardProps) {
  const mode: Mode = status?.mode ?? "auto";
  const cut = new Set(status?.partition ?? []);
  const pending = status?.pending ?? [];
  const networkTweaked = mode === "manual" || cut.size > 0;

  return (
    <section className="panel flex flex-col gap-2.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: color }} />
          <span style={{ color }}>{id}</span>
        </h2>
        <span className="flex flex-wrap justify-end gap-1">
          {!status && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">offline</span>}
          {mode === "manual" && (
            <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn" title="Messages wait for you to deliver them">
              manual
            </span>
          )}
          {cut.size > 0 && (
            <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[11px] font-semibold text-bad" title={`Disconnected from ${[...cut].join(", ")}`}>
              cut off
            </span>
          )}
        </span>
      </div>

      {/* one row: a local event, then one send button per peer (same glyphs as the diagram cards) */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Actions for ${id}`}>
        <button
          className="btn btn-sm flex-1 gap-1.5"
          disabled={disabled}
          title={`Something happens inside ${id}. No message is sent.`}
          aria-label={`Local event on ${id}`}
          onClick={() => act(() => sendCommand(id, { type: "local" }))}
        >
          <svg viewBox="-6 -6 12 12" className="size-3" aria-hidden="true">
            <circle r="3" fill="currentColor" />
          </svg>
          Local
        </button>
        {others.map((o) => (
          <button
            key={o}
            className="btn btn-sm flex-1 gap-1"
            disabled={disabled}
            title={`${id} sends a message to ${o}`}
            aria-label={`Send a message from ${id} to ${o}`}
            onClick={() => act(() => sendCommand(id, { type: "send", to: o }))}
          >
            <svg viewBox="-6 -6 12 12" className="size-3" aria-hidden="true">
              <path d="M-4,4 L4,-4 M-1,-4 L4,-4 L4,1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {o}
          </button>
        ))}
      </div>

      {pending.length > 0 && (
        <div>
          <p className={`${labelCls} mb-1.5 flex items-center gap-1.5`}>
            Waiting messages
            <span className="rounded-full bg-warn/15 px-1.5 font-mono text-[11px] font-semibold text-warn tabular-nums">{pending.length}</span>
          </p>
          <ul className="m-0 flex list-none flex-col rounded-2xl border border-dashed border-warn/50 bg-warn/5 p-0" aria-label={`Messages held by ${id}`}>
            {pending.map((m) => (
              <li
                key={m.msgId}
                className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b border-dashed border-warn/30 px-2.5 py-2 last:border-b-0"
              >
                <span className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                  <span className="chip">{m.msgId}</span>
                  <span className="text-muted">from {m.from}</span>
                </span>
                <span className="ml-auto flex flex-none items-center gap-1">
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={disabled}
                    aria-label={`Deliver ${m.msgId}`}
                    onClick={() => act(() => sendCommand(id, { type: "deliver", msgId: m.msgId }))}
                  >
                    Deliver
                  </button>
                  <button
                    className="btn btn-sm"
                    disabled={disabled}
                    aria-label={`Drop ${m.msgId}`}
                    onClick={() => act(() => sendCommand(id, { type: "drop", msgId: m.msgId }))}
                  >
                    Drop
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!advanced && networkTweaked && (
        <p className="text-xs text-muted">Network conditions are on for {id}. Switch to Advanced to change them.</p>
      )}

      {advanced && (
        <details className="group rounded-2xl border border-line bg-surface px-3 py-1.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-medium">
            <span className="flex items-center gap-2">
              Network
              {networkTweaked && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">changed</span>}
            </span>
            {/* a down chevron when closed, a separate up chevron when open (not one icon rotated) */}
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-4 flex-none fill-none stroke-current stroke-[2.5] text-muted [stroke-linecap:round] [stroke-linejoin:round]"
            >
              <path className="group-open:hidden" d="M6 9l6 6 6-6" />
              <path className="hidden group-open:block" d="M6 15l6-6 6 6" />
            </svg>
          </summary>

          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={labelCls}>Deliver messages</span>
              <div className="seg" role="group" aria-label={`Delivery mode of ${id}`}>
                {(
                  [
                    ["auto", "Instantly", "Messages arrive as soon as they are sent"],
                    ["manual", "I'll deliver them", "Messages wait until you press Deliver or Drop"],
                  ] as const
                ).map(([m, label, hint]) => (
                  <button
                    key={m}
                    aria-pressed={mode === m}
                    disabled={disabled}
                    onClick={() => act(() => sendCommand(id, { type: "set_mode", mode: m }))}
                    title={hint}
                    className="btn btn-sm"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {others.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className={labelCls}>Lose messages to and from</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {others.map((o) => (
                    <label key={o} className="inline-flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={cut.has(o)}
                        disabled={disabled}
                        aria-label={`Disconnect from ${o}`}
                        onChange={(e) => setCut(id, o, e.target.checked)}
                      />
                      Disconnect from {o}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
