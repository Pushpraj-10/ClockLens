/** Live connection state to the server's WebSocket. */
export function ConnectionPill({ connected }: { connected: boolean }) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full border border-current px-3 py-1 text-[13px] font-medium whitespace-nowrap ${
        connected ? "text-ok" : "text-bad"
      }`}
    >
      <span aria-hidden="true" className="size-[7px] rounded-full bg-current" />
      {connected ? "Connected" : "Disconnected — retrying…"}
    </span>
  );
}
