import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

const STATUS_COLOR = { up: "#10b981", degraded: "#f59e0b", down: "#ef4444" };

function CustomDot({ cx, cy, payload }) {
  if (!payload || cx == null || cy == null) return null;
  const color = STATUS_COLOR[payload.status] || "#44446a";
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill={color}
      stroke="#07070f"
      strokeWidth={1.5}
    />
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const color = STATUS_COLOR[d.status] || "#6060a0";
  return (
    <div
      style={{ background: "#0d0d18", border: "1px solid #1e1e30" }}
      className="rounded-lg px-3 py-2.5 text-[11px] font-mono shadow-2xl"
    >
      <p className="text-gray-300 font-semibold truncate max-w-[160px]">{d.name}</p>
      <p style={{ color }} className="font-bold text-[10px] tracking-wider mt-0.5">{d.status?.toUpperCase()}</p>
      <p className="text-[#44446a] tabular-nums mt-0.5">{d.latency}ms · {d.time}</p>
    </div>
  );
}

export default function LiveChart({ feed }) {
  if (feed.length < 4) return null;

  const data = [...feed]
    .reverse()
    .slice(0, 60)
    .map((e, i) => ({
      i,
      latency:  e.latency_ms ?? 0,
      status:   e.status,
      name:     e.service_name,
      time:     e.ts?.slice(11, 19) || "",
    }));

  const maxLatency = Math.max(...data.map(d => d.latency));
  const yDomain   = [0, Math.max(maxLatency * 1.2, 2500)];

  return (
    <div className="bg-[#0d0d18] border border-[#1e1e30] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#13131e]">
        <div>
          <p className="text-[13px] font-semibold text-gray-200 tracking-tight">Latency Trend</p>
          <p className="text-[10px] text-[#2e2e4a] mt-0.5 font-mono">
            last {data.length} checks · all services
          </p>
        </div>
        <div className="flex items-center gap-5">
          {[["#10b981", "up"], ["#f59e0b", "degraded"], ["#ef4444", "down"]].map(([color, label]) => (
            <span key={label} className="flex items-center gap-1.5 text-[10px] text-[#32324e]">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: color, boxShadow: `0 0 5px 1px ${color}60` }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="px-3 pt-5 pb-3">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gradLatency" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#10b981" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0}    />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke="#12121e"
              strokeDasharray="0"
              vertical={false}
            />

            <XAxis dataKey="i" hide />

            <YAxis
              domain={yDomain}
              tick={{ fill: "#2a2a48", fontSize: 10, fontFamily: "ui-monospace, monospace" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${v}ms`}
              width={52}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "#22223a", strokeWidth: 1, strokeDasharray: "4 4" }}
            />

            <ReferenceLine
              y={2000}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              strokeOpacity={0.25}
              label={{ value: "2s threshold", fill: "#f59e0b", fontSize: 9, fontFamily: "monospace", opacity: 0.4, position: "right" }}
            />

            <Area
              type="monotone"
              dataKey="latency"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gradLatency)"
              dot={<CustomDot />}
              activeDot={{ r: 5, fill: "#10b981", stroke: "#07070f", strokeWidth: 2 }}
              animationDuration={400}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
