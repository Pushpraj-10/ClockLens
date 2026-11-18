"use client";

import { useEffect, useState } from "react";

export interface Remote<T> {
  data?: T;
  error?: string;
}

/**
 * Loads a server answer for `key` (skipped while key is undefined) and reloads when
 * `version` changes (e.g. new events arrived). A response that arrives after the key
 * or version moved on is discarded, so a slow request can never overwrite a newer one.
 */
export function useRemote<T>(key: string | undefined, version: string, load: () => Promise<T>): Remote<T> {
  const [state, setState] = useState<Remote<T> & { for?: string }>({});

  useEffect(() => {
    if (key === undefined) {
      setState({});
      return;
    }
    let stale = false;
    load().then(
      (data) => {
        if (!stale) setState({ data, for: key });
      },
      (e: unknown) => {
        if (!stale) setState({ error: e instanceof Error ? e.message : String(e), for: key });
      },
    );
    return () => {
      stale = true;
    };
    // `load` is recreated every render; key + version fully describe the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  // While a new key is loading, do not show the previous key's answer.
  return state.for === key ? { data: state.data, error: state.error } : {};
}
