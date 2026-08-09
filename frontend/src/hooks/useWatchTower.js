import { useState, useEffect, useRef } from "react";
import { API, WS } from "../constants.js";

export function useWatchTower() {
  const [services,   setServices]   = useState([]);
  const [summary,    setSummary]    = useState(null);
  const [feed,       setFeed]       = useState([]);
  const [sparklines, setSparklines] = useState({});
  const [analyses,   setAnalyses]   = useState({});
  const [analyzing,  setAnalyzing]  = useState({});
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
    fetchServices();
    fetchSummary();
    const poll = setInterval(() => { fetchServices(); fetchSummary(); }, 30_000);

    const connect = () => {
      const ws = new WebSocket(WS);
      wsRef.current = ws;
      ws.onopen    = () => setWsStatus("live");
      ws.onclose   = () => { setWsStatus("reconnecting"); setTimeout(connect, 3000); };
      ws.onerror   = () => setWsStatus("error");
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "ai_analysis") { setAnalyses(p => ({ ...p, [msg.service_id]: msg.analysis })); return; }
        if (msg.type === "summary")     { setSummary(msg); return; }
        setFeed(p => [msg, ...p].slice(0, 80));
        setSparklines(p => {
          const prev = p[msg.service_id] || [];
          return { ...p, [msg.service_id]: [...prev.slice(-19), { latency_ms: msg.latency_ms }] };
        });
        fetchServices();
        fetchSummary();
      };
    };
    connect();
    return () => { clearInterval(poll); wsRef.current?.close(); };
  }, []);

  useEffect(() => { services.forEach(s => fetchSparkline(s.id ?? s._id)); }, [services.length]);

  const handleAdd = async (name, url) => {
    await fetch(`${API}/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url }),
    });
    await fetchServices();
  };

  const handleAnalyze = async (id) => {
    setAnalyzing(p => ({ ...p, [id]: true }));
    try {
      const r    = await fetch(`${API}/services/${id}/analyze`, { method: "POST" });
      const data = await r.json();
      setAnalyses(p => ({ ...p, [id]: data.analysis || data.error }));
    } catch {
      setAnalyses(p => ({ ...p, [id]: "Error — check GEMINI_API_KEY in Zerops env vars" }));
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

  return {
    services, summary, feed, sparklines, analyses, analyzing, wsStatus,
    handleAdd, handleAnalyze, handleReport, handleDelete,
  };
}
