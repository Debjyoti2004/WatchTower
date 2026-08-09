export default function SummaryCard({ label, value, color }) {
  return (
    <div className="bg-[#0d0d18] border border-[#1e1e30] rounded-xl px-4 py-4 hover:border-[#2a2a40] transition-colors duration-200">
      <p className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${color}`}>{value ?? "—"}</p>
      <p className="text-[#3a3a58] text-[10px] font-semibold uppercase tracking-widest mt-1.5">{label}</p>
    </div>
  );
}
