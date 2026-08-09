const STATUS_COLOR = {
  up:       "text-emerald-400",
  down:     "text-red-400",
  degraded: "text-amber-400",
};

export default function EventFeed({ feed }) {
  return (
    <div className="bg-[#0d0d18] border border-[#1e1e30] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#16162a]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-[11px] font-semibold text-[#3a3a58] uppercase tracking-widest">Live Event Feed</p>
        </div>
        <span className="text-[11px] text-[#28283c] font-mono tabular-nums">{feed.length} events</span>
      </div>

      {feed.length > 0 && (
        <div className="grid grid-cols-[80px_90px_1fr_80px] text-[10px] text-[#2a2a42] font-semibold uppercase tracking-wider px-5 py-2 border-b border-[#12121e]">
          <span>Time</span>
          <span>Status</span>
          <span>Service</span>
          <span className="text-right">Latency</span>
        </div>
      )}

      <div className="divide-y divide-[#10101c] max-h-56 overflow-y-auto">
        {feed.length === 0 && (
          <p className="text-[#28283c] text-xs py-10 text-center font-mono">
            Waiting for first poll cycle (up to 30 seconds)…
          </p>
        )}
        {feed.map((e, i) => (
          <div key={i} className="grid grid-cols-[80px_90px_1fr_80px] items-center px-5 py-2.5 hover:bg-[#10101c] transition-colors text-xs font-mono">
            <span className="text-[#2e2e48] tabular-nums">{e.ts?.slice(11, 19)}</span>
            <span className={`text-[10px] font-bold tracking-wider ${STATUS_COLOR[e.status] || "text-gray-500"}`}>
              {e.status?.toUpperCase()}
            </span>
            <span className="text-[#7070a0] truncate pr-3">{e.service_name}</span>
            <div className="text-right">
              <span className="text-[#3a3a58] tabular-nums">{e.latency_ms}ms</span>
              {e.error && (
                <span className="block text-red-500 text-[9px] truncate mt-0.5">{e.error}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
