/** Base URL of the central server. Override with NEXT_PUBLIC_API_URL. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

/** WebSocket endpoint of the event stream. */
export const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";
