import StatusDot from "./StatusDot.jsx";
import StatusBadge from "./StatusBadge.jsx";
import LatencyBar from "./LatencyBar.jsx";
import SparkLine from "./SparkLine.jsx";
import { STATUS } from "../constants.js";

const BORDER = {
  up:       "border-l-emerald-500",
  down:     "border-l-red-500",
  degraded: "border-l-amber-500",
  pending:  "border-l-gray-700",
};

export default function ServiceCard({ svc, latest, sparks, analysis, analyzing, onAnalyze, onReport, onDelete }) {
  const id  = svc.id ?? svc._id;
  const cfg = STATUS[svc.status] || STATUS.pending;
  const border = BORDER[svc.status] || BORDER.pending;

  return (
    <div className={`bg-[#0d0d18] border border-[#1e1e30] border-l-4 ${border} rounded-xl p-5 flex flex-col gap-4 hover:border-[#2a2a40] transition-colors duration-200`}>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 mb-1">
            <StatusDot status={svc.status} />
            <h3 className="text-[13px] font-semibold text-gray-100 truncate leading-none tracking-tight">{svc.name}</h3>
          </div>
          <p className="text-[11px] text-[#3a3a58] truncate font-mono pl-[18px]">{svc.url}</p>
          {svc.last_checked && (
            <p className="text-[10px] text-[#28283c] mt-0.5 pl-[18px] tabular-nums">
              {svc.last_checked.slice(11, 19)} UTC
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <StatusBadge status={svc.status} />
          <button
            onClick={() => onDelete(id)}
            className="text-[#28283c] hover:text-red-400 transition-colors duration-150 text-xs leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/10"
            title="Remove"
          >✕</button>
        </div>
      </div>

      {(latest || (sparks?.length > 2)) && (
        <div className="flex flex-col gap-2.5">
          {latest && <LatencyBar ms={latest.latency_ms} />}
          {sparks?.length > 2 && <SparkLine data={sparks} />}
        </div>
      )}

      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => onAnalyze(id)}
          disabled={analyzing}
          className="flex-1 text-[11px] font-semibold bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-purple-400 border border-purple-500/20 hover:border-purple-500/40 py-2 rounded-lg transition-all duration-150"
        >
          {analyzing ? "Analyzing…" : "AI Analyze"}
        </button>
        <button
          onClick={() => onReport(id)}
          className="flex-1 text-[11px] font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 hover:border-blue-500/40 py-2 rounded-lg transition-all duration-150"
        >
          PDF Report
        </button>
      </div>

      {analysis && (
        <div className="bg-[#0a0a14] border border-purple-500/15 rounded-lg p-3.5 text-[11px] text-[#8888a8] whitespace-pre-wrap leading-relaxed font-mono">
          {analysis}
        </div>
      )}
    </div>
  );
}
