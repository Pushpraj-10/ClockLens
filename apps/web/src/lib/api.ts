import type { Command, Comparison, Misleading, Relations } from "@clocklens/events";
import { API_URL } from "./config";

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, init);
  } catch {
    throw new Error("Cannot reach the server. Is it running?");
  }
  if (res.ok) return res;
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // keep the status text
  }
  throw new Error(message);
}

const json = { "Content-Type": "application/json" };

/** Send a control command to one node. */
export async function sendCommand(nodeId: string, cmd: Command): Promise<void> {
  await request(`/api/nodes/${encodeURIComponent(nodeId)}/commands`, {
    method: "POST",
    headers: json,
    body: JSON.stringify(cmd),
  });
}

/** Clear the stored events and reset every node's clocks. */
export async function newRun(): Promise<void> {
  await request("/api/runs", { method: "POST" });
}

/** Replace the current trace with a JSON trace (as produced by export). */
export async function importTrace(text: string): Promise<void> {
  await request("/api/import", { method: "POST", headers: json, body: text });
}

/** Past, future and concurrent events of one event, computed by the server. */
export async function fetchRelations(id: string): Promise<Relations> {
  return (await request(`/api/causality/${encodeURIComponent(id)}`)).json();
}

/** Happened-before verdict and proof for a pair of events. */
export async function fetchComparison(a: string, b: string): Promise<Comparison> {
  const q = `a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
  return (await request(`/api/compare?${q}`)).json();
}

/** Concurrent pairs that Lamport clocks would wrongly order. */
export async function fetchMisleading(): Promise<Misleading[]> {
  return (await request("/api/misleading")).json();
}

/** URL that downloads the current trace as JSON. */
export const exportUrl = `${API_URL}/api/export`;
