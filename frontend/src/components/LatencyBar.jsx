export default function LatencyBar({ ms }) {
  if (ms == null) return null;
  const pct   = Math.min((ms / 5000) * 100, 100);
  const color = ms < 500 ? "bg-emerald-500" : ms < 2000 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-[#13131e] rounded-full h-[3px] overflow-hidden">
        <div
          className={`${color} h-full rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-[#44446a] font-mono w-14 text-right tabular-nums">{ms}ms</span>
    </div>
  );
}
