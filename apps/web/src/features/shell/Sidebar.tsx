"use client";

import type { NodeStatus } from "@clocklens/events";
import { ControlPanel } from "../controls/ControlPanel";

interface Props {
  nodes: string[];
  statuses: Record<string, NodeStatus>;
  connected: boolean;
  advanced: boolean;
  hasEvents: boolean;
  /** App-level control shown at the right of the brand (the theme picker). */
  brandAction?: React.ReactNode;
}

/** Left rail: brand, run actions, one card per node, connection status. */
export function Sidebar({ nodes, statuses, connected, advanced, hasEvents, brandAction }: Props) {
  return (
    <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
      <div className="flex items-center gap-2.5 px-1 py-0.5">
        <svg className="flex-none text-primary" width="32" height="32" viewBox="0 0 34 34" fill="none" aria-hidden="true">
          <circle cx="17" cy="17" r="14" stroke="currentColor" strokeWidth="2" />
          <path d="M17 8v9l6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="17" cy="17" r="2" fill="currentColor" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-tight font-semibold tracking-tight">ClockLens</p>
          <p className="truncate text-xs text-muted">Lamport &amp; vector clocks</p>
        </div>
        {brandAction}
      </div>

      <ControlPanel nodes={nodes} statuses={statuses} connected={connected} advanced={advanced} hasEvents={hasEvents} />
    </aside>
  );
}
