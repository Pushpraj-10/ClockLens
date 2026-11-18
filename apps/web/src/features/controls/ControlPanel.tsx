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
      <section className="panel p-4">
        <h2 className="section-title">Run</h2>
        {confirm ? (
          <div role="alertdialog" aria-label="Confirm" className="flex flex-col gap-2">
            <p className="text-sm">
              {confirm === "new-run"
                ? "Clear every event and reset all clocks?"
                : "Importing replaces the events you have now. Continue?"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn btn-primary"
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
              <button className="btn" onClick={() => setConfirm(undefined)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" onClick={startNewRun} disabled={!connected} title="Start over: clear all events and reset every node">
              New run
            </button>
            {advanced && (
              <>
                <a className="btn" href={exportUrl} download="clocklens-trace.json">
                  Export
                </a>
                <button className="btn" onClick={startImport} disabled={!connected}>
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
    <section className="panel flex flex-col gap-3 p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: color }} />
        <span style={{ color }}>{id}</span>
      </h2>

      <div className="flex flex-col gap-2">
        <button
          className="btn w-full"
          disabled={disabled}
          title={`Something happens inside ${id}. No message is sent.`}
          onClick={() => act(() => sendCommand(id, { type: "local" }))}
        >
          Local event
        </button>
        {others.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Send a message from ${id}`}>
            {others.map((o) => (
              <button
                key={o}
                className="btn flex-1"
                disabled={disabled}
                title={`${id} sends a message to ${o}`}
                onClick={() => act(() => sendCommand(id, { type: "send", to: o }))}
              >
                Send to {o}
              </button>
            ))}
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div>
          <p className={`${labelCls} mb-1.5`}>Waiting messages</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 rounded-2xl border border-dashed border-line p-2.5" aria-label={`Messages held by ${id}`}>
            {pending.map((m) => (
              <li key={m.msgId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <code>{m.msgId}</code> from {m.from}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <button className="btn" disabled={disabled} onClick={() => act(() => sendCommand(id, { type: "deliver", msgId: m.msgId }))}>
                    Deliver
                  </button>
                  <button className="btn" disabled={disabled} onClick={() => act(() => sendCommand(id, { type: "drop", msgId: m.msgId }))}>
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
        <details className="group rounded-2xl border border-line bg-surface px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
            <span>
              Network
              {networkTweaked && <span className="ml-2 rounded-full bg-warn/20 px-2 py-0.5 text-xs text-warn">changed</span>}
            </span>
            <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>

          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={labelCls}>Deliver messages</span>
              <div className="inline-flex" role="group" aria-label={`Delivery mode of ${id}`}>
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
                    className="btn min-h-8 first:rounded-r-none last:rounded-l-none last:border-l-0 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-ink"
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
