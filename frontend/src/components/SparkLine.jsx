import { LineChart, Line, Tooltip, ResponsiveContainer } from "recharts";

export default function SparkLine({ data }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={30}>
      <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <Line
          type="monotone"
          dataKey="latency_ms"
          stroke="#10b981"
          dot={false}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <Tooltip
          contentStyle={{
            background: "#0d0d18",
            border: "1px solid #1e1e30",
            borderRadius: 6,
            fontSize: 10,
            padding: "3px 8px",
            color: "#8888a8",
          }}
          formatter={(v) => [`${v}ms`, ""]}
          labelFormatter={() => ""}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
