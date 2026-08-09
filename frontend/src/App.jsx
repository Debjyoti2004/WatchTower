import { useState, useEffect, useRef } from "react";
import { LineChart, Line, Tooltip, ResponsiveContainer } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS  = API.replace("https", "wss").replace("http", "ws") + "/ws/live";

const STATUS = {
  up:       { dot: "bg-emerald-400", badge: "bg-emerald-900 text-emerald-300 border border-emerald-700", label: "UP" },
  down:     { dot: "bg-red-500",     badge: "bg-red-900 text-red-300 border border-red-700",             label: "DOWN" },
  degraded: { dot: "bg-amber-400",   badge: "bg-amber-900 text-amber-300 border border-amber-700",       label: "DEGRADED" },
  pending:  { dot: "bg-gray-600",    badge: "bg-gray-800 text-gray-400 border border-gray-700",          label: "PENDING" },
};

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${s.badge}`}>{s.label}</span>;
}

function StatusDot({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return <span className={`inline-block w-2 h-2 rounded-full ${s.dot}`} />;
}

function LatencyBar({ ms }) {
  if (ms == null) return null;
  const pct   = Math.min((ms / 5000) * 100, 100);
  const color = ms < 500 ? "bg-emerald-500" : ms < 2000 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 font-mono w-16 text-right">{ms}ms</span>
    </div>
  );
}

function SparkLine({ data }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="latency_ms" stroke="#10b981" dot={false} strokeWidth={1.5} />
        <Tooltip
          contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 11 }}
          formatter={(v) => [`${v}ms`, "latency"]}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-center">
      <p className={`text-2xl font-bold font-mono ${color}`}>{value ?? "—"}</p>
      <p className="text-gray-600 text-xs mt-0.5">{label}</p>
    </div>
  );
}

export default function App() {
  const [services,   setServices]   = useState([]);
  const [summary,    setSummary]    = useState(null);
  const [feed,       setFeed]       = useState([]);
  const [sparklines, setSparklines] = useState({});
  const [analyses,   setAnalyses]   = useState({});
  const [analyzing,  setAnalyzing]  = useState({});
  const [newName,    setNewName]    = useState("");
  const [newUrl,     setNewUrl]     = useState("");
  const [adding,     setAdding]     = useState(false);
  const [wsStatus,   setWsStatus]   = useState("connecting");
  const wsRef = useRef(null);

  const fetchServices  = async () => { try { const r = await fetch(`${API}/services`); setServices(await r.json()); } catch {} };
  const fetchSummary   = async () => { try { const r = await fetch(`${API}/dashboard/summary`); setSummary(await r.json()); } catch {} };
  const fetchSparkline = async (id) => {
    try {
      const r    = await fetch(`${API}/services/${id}/events?limit=20`);
      const evts = await r.json();
      setSparklines(p => ({ ...p, [id]: [...evts].reverse() }));
    } catch {}
  };

  useEffect(() => {
    fetchServices(); fetchSummary();
    const poll = setInterval(() => { fetchServices(); fetchSummary(); }, 30_000);

    const connect = () => {
      const ws = new WebSocket(WS);
      wsRef.current = ws;
      ws.onopen  = () => setWsStatus("live");
      ws.onclose = () => { setWsStatus("reconnecting"); setTimeout(connect, 3000); };
      ws.onerror = () => setWsStatus("error");
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "ai_analysis") { setAnalyses(p => ({ ...p, [msg.service_id]: msg.analysis })); return; }
        if (msg.type === "summary")     { setSummary(msg); return; }
        setFeed(p => [msg, ...p].slice(0, 80));
        setSparklines(p => {
          const prev = p[msg.service_id] || [];
          return { ...p, [msg.service_id]: [...prev.slice(-19), { latency_ms: msg.latency_ms }] };
        });
        fetchServices(); fetchSummary();
      };
    };
    connect();
    return () => { clearInterval(poll); wsRef.current?.close(); };
  }, []);

  useEffect(() => { services.forEach(s => fetchSparkline(s.id ?? s._id)); }, [services.length]);

  const handleAdd = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setAdding(true);
    try {
      await fetch(`${API}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), url: newUrl.trim() }),
      });
      setNewName(""); setNewUrl(""); await fetchServices();
    } finally { setAdding(false); }
  };

  const handleAnalyze = async (id) => {
    setAnalyzing(p => ({ ...p, [id]: true }));
    try {
      const r    = await fetch(`${API}/services/${id}/analyze`, { method: "POST" });
      const data = await r.json();
      setAnalyses(p => ({ ...p, [id]: data.analysis || data.error }));
    } catch {
      setAnalyses(p => ({ ...p, [id]: "Error — check GROQ_API_KEY in Zerops env vars" }));
    } finally { setAnalyzing(p => ({ ...p, [id]: false })); }
  };

  const handleReport = async (id) => {
    try {
      const r = await fetch(`${API}/services/${id}/report`, { method: "POST" });
      const d = await r.json();
      if (d.url) window.open(d.url, "_blank");
    } catch { alert("PDF failed — check MinIO env vars"); }
  };

  const handleDelete = async (id) => {
    await fetch(`${API}/services/${id}`, { method: "DELETE" });
    fetchServices();
  };

  const wsDot = {
    live: "bg-emerald-400",
    connecting: "bg-amber-400 animate-pulse",
    reconnecting: "bg-amber-400 animate-pulse",
    error: "bg-red-500",
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono text-sm">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-base">🗼 WatchTower</span>
          <span className="text-gray-600 text-xs hidden sm:block">AI infrastructure monitoring · Zerops</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${wsDot[wsStatus]}`} />
          <span className="text-gray-500 text-xs">{wsStatus}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <SummaryCard label="total"       value={summary.total}                  color="text-white" />
            <SummaryCard label="up"          value={summary.up}                     color="text-emerald-400" />
            <SummaryCard label="degraded"    value={summary.degraded}               color="text-amber-400" />
            <SummaryCard label="down"        value={summary.down}                   color="text-red-400" />
            <SummaryCard label="avg latency" value={`${summary.avg_latency_ms}ms`}  color="text-blue-400" />
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-600 text-xs uppercase tracking-widest mb-3">+ watch a new service</p>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <input
              className="w-36 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-emerald-600"
              placeholder="service name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
            <input
              className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-emerald-600"
              placeholder="https://your-service.zerops.app/health"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={adding}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white px-4 py-1.5 rounded text-xs font-bold transition shrink-0"
            >
              {adding ? "Adding…" : "Watch"}
            </button>
          </div>
        </div>

        {services.length === 0 && (
          <p className="text-gray-600 text-center py-10">Loading services…</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map(svc => {
            const id     = svc.id ?? svc._id;
            const sparks = sparklines[id] || [];
            const latest = feed.find(f => f.service_id === id);
            return (
              <div key={id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <StatusDot status={svc.status} />
                      <p className="text-white font-bold truncate">{svc.name}</p>
                    </div>
                    <p className="text-gray-500 text-xs truncate mt-0.5 pl-4">{svc.url}</p>
                    {svc.last_checked && (
                      <p className="text-gray-700 text-xs mt-0.5 pl-4">
                        checked {svc.last_checked.slice(11, 19)} UTC
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={svc.status} />
                    <button
                      onClick={() => handleDelete(id)}
                      className="text-gray-700 hover:text-red-400 text-xs transition"
                      title="Remove"
                    >✕</button>
                  </div>
                </div>

                {latest && <LatencyBar ms={latest.latency_ms} />}
                {sparks.length > 2 && <SparkLine data={sparks} />}

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAnalyze(id)}
                    disabled={analyzing[id]}
                    className="flex-1 text-xs bg-purple-900 hover:bg-purple-800 disabled:opacity-40 text-purple-200 py-1.5 rounded transition font-bold"
                  >
                    {analyzing[id] ? "Analyzing…" : "AI Analyze"}
                  </button>
                  <button
                    onClick={() => handleReport(id)}
                    className="flex-1 text-xs bg-blue-900 hover:bg-blue-800 text-blue-200 py-1.5 rounded transition font-bold"
                  >
                    PDF Report
                  </button>
                </div>

                {analyses[id] && (
                  <div className="bg-gray-800 border border-purple-900 rounded p-3 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {analyses[id]}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-gray-600 text-xs uppercase tracking-widest">live event feed · WebSocket</p>
            <span className="text-gray-700 text-xs">{feed.length} events</span>
          </div>
          <div className="space-y-0.5 max-h-52 overflow-y-auto">
            {feed.length === 0 && (
              <p className="text-gray-700 text-xs py-3">Waiting for first poll cycle (up to 30 seconds)…</p>
            )}
            {feed.map((e, i) => (
              <div key={i} className="flex items-center gap-3 text-xs py-0.5 font-mono">
                <span className="text-gray-700 w-16 shrink-0">{e.ts?.slice(11, 19)}</span>
                <span className={
                  e.status === "up"       ? "text-emerald-400 w-20 shrink-0 font-bold" :
                  e.status === "down"     ? "text-red-400 w-20 shrink-0 font-bold" :
                  e.status === "degraded" ? "text-amber-400 w-20 shrink-0 font-bold" :
                                            "text-gray-400 w-20 shrink-0"
                }>{e.status?.toUpperCase()}</span>
                <span className="text-gray-300 flex-1 truncate">{e.service_name}</span>
                <span className="text-gray-500 w-20 text-right shrink-0">{e.latency_ms}ms</span>
                {e.error && <span className="text-red-500 text-xs truncate max-w-28">{e.error}</span>}
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-gray-800 text-xs pb-4">
          WatchTower · React + Node.js · 7 Zerops services · 0 external infra
        </p>
      </main>
    </div>
  );
}
