import { useState } from "react";
import { useWatchTower } from "./hooks/useWatchTower.js";
import SummaryCard from "./components/SummaryCard.jsx";
import ServiceCard from "./components/ServiceCard.jsx";
import EventFeed   from "./components/EventFeed.jsx";
import LiveChart   from "./components/LiveChart.jsx";

const WS_DOT = {
  live:         "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]",
  connecting:   "bg-amber-400 animate-pulse",
  reconnecting: "bg-amber-400 animate-pulse",
  error:        "bg-red-500",
};

const SERVICE_GROUPS = [
  { key: "down",     label: "Down",     dot: "bg-red-500",     text: "text-red-400"     },
  { key: "degraded", label: "Degraded", dot: "bg-amber-400",   text: "text-amber-400"   },
  { key: "pending",  label: "Pending",  dot: "bg-gray-600",    text: "text-gray-400"    },
  { key: "up",       label: "Up",       dot: "bg-emerald-400", text: "text-emerald-400" },
];

export default function App() {
  const [newName, setNewName] = useState("");
  const [newUrl,  setNewUrl]  = useState("");
  const [adding,  setAdding]  = useState(false);

  const {
    services, summary, feed, sparklines, analyses, analyzing, wsStatus,
    handleAdd, handleAnalyze, handleReport, handleDelete,
  } = useWatchTower();

  const onAdd = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setAdding(true);
    try { await handleAdd(newName.trim(), newUrl.trim()); setNewName(""); setNewUrl(""); }
    finally { setAdding(false); }
  };

  const groups = SERVICE_GROUPS
    .map(g => ({ ...g, items: services.filter(s => s.status === g.key) }))
    .filter(g => g.items.length > 0);

  return (
    <div className="min-h-screen bg-[#07070f] text-gray-100 font-mono text-sm">

      <header className="sticky top-0 z-50 border-b border-[#16162a] bg-[#07070f]/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <span className="text-base leading-none">🗼</span>
              <span className="text-white font-bold text-[13px] tracking-tight">WatchTower</span>
            </div>
            <div className="hidden sm:block w-px h-4 bg-[#1e1e30]" />
            <span className="hidden sm:block text-[11px] text-[#32324e]">AI infrastructure monitoring</span>
          </div>
          <div className="flex items-center gap-4">
            {summary && (
              <>
                <span className="hidden md:block text-[11px] text-[#32324e] font-mono tabular-nums">
                  {summary.up}/{summary.total} healthy
                </span>
                <div className="hidden md:block w-px h-4 bg-[#1e1e30]" />
              </>
            )}
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${WS_DOT[wsStatus]}`} />
              <span className="text-[11px] text-[#44445e] capitalize">{wsStatus}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6 space-y-6">

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <SummaryCard label="Total"       value={summary.total}                  color="text-gray-100" />
            <SummaryCard label="Up"          value={summary.up}                     color="text-emerald-400" />
            <SummaryCard label="Degraded"    value={summary.degraded}               color="text-amber-400" />
            <SummaryCard label="Down"        value={summary.down}                   color="text-red-400" />
            <SummaryCard label="Avg Latency" value={`${summary.avg_latency_ms}ms`}  color="text-blue-400" />
          </div>
        )}

        <div className="bg-[#0d0d18] border border-[#1e1e30] rounded-xl p-5">
          <p className="text-[10px] font-semibold text-[#2e2e48] uppercase tracking-widest mb-4">
            Monitor a new endpoint
          </p>
          <div className="flex gap-2.5 flex-wrap sm:flex-nowrap">
            <input
              className="w-40 bg-[#08080f] border border-[#1e1e30] rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-[#28283a] focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/10 transition-all duration-150"
              placeholder="service name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && onAdd()}
            />
            <input
              className="flex-1 min-w-0 bg-[#08080f] border border-[#1e1e30] rounded-lg px-3 py-2 text-xs text-gray-200 font-mono placeholder-[#28283a] focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/10 transition-all duration-150"
              placeholder="https://api.example.com/health"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && onAdd()}
            />
            <button
              onClick={onAdd}
              disabled={adding}
              className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-xs font-semibold transition-all duration-150 shrink-0"
            >
              {adding ? "Adding…" : "Watch"}
            </button>
          </div>
        </div>

        <LiveChart feed={feed} />

        {services.length === 0 && (
          <p className="text-[#28283c] text-xs text-center py-16 font-mono">Loading services…</p>
        )}

        {groups.map(group => (
          <div key={group.key} className="space-y-3">
            <div className="flex items-center gap-2.5 px-0.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${group.dot}`} />
              <span className={`text-[11px] font-semibold uppercase tracking-widest ${group.text}`}>
                {group.label}
              </span>
              <span className="text-[#28283c] text-[11px] font-mono">({group.items.length})</span>
              <div className="flex-1 h-px bg-[#14141f]" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.items.map(svc => {
                const id = svc.id ?? svc._id;
                return (
                  <ServiceCard
                    key={id}
                    svc={svc}
                    latest={feed.find(f => f.service_id === id)}
                    sparks={sparklines[id]}
                    analysis={analyses[id]}
                    analyzing={analyzing[id]}
                    onAnalyze={handleAnalyze}
                    onReport={handleReport}
                    onDelete={handleDelete}
                  />
                );
              })}
            </div>
          </div>
        ))}

        <EventFeed feed={feed} />

        <p className="text-center text-[#1e1e2e] text-[10px] pb-2 font-mono">
          WatchTower · React + Node.js · 7 Zerops services · 0 external infra
        </p>

      </main>
    </div>
  );
}
