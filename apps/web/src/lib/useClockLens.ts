"use client";

import { useEffect, useReducer } from "react";
import type { StreamMessage } from "@clocklens/events";
import { WS_URL } from "./config";
import { initialState, reducer, type State } from "./state";

/**
 * Connects to the server's WebSocket and keeps the local copy of events and node
 * statuses up to date. Reconnects with backoff; every reconnect starts with a
 * snapshot, so nothing is lost.
 */
export function useClockLens(): State {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 500;
    let closed = false;

    const connect = () => {
      socket = new WebSocket(WS_URL);
      socket.onopen = () => {
        delay = 500;
        dispatch({ type: "connection", connected: true });
      };
      socket.onmessage = (ev) => {
        try {
          dispatch({ type: "message", message: JSON.parse(String(ev.data)) as StreamMessage });
        } catch {
          // ignore a malformed frame
        }
      };
      socket.onclose = () => {
        dispatch({ type: "connection", connected: false });
        if (closed) return;
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 5000);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return state;
}
