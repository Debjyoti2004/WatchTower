export const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const WS  = API.replace("https", "wss").replace("http", "ws") + "/ws/live";

export const STATUS = {
  up: {
    dot:    "bg-emerald-400",
    glow:   "shadow-[0_0_7px_2px_rgba(52,211,153,0.4)]",
    badge:  "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    border: "border-l-emerald-500",
    label:  "UP",
  },
  down: {
    dot:    "bg-red-500",
    glow:   "shadow-[0_0_7px_2px_rgba(239,68,68,0.4)]",
    badge:  "bg-red-500/10 text-red-400 border border-red-500/20",
    border: "border-l-red-500",
    label:  "DOWN",
  },
  degraded: {
    dot:    "bg-amber-400",
    glow:   "shadow-[0_0_7px_2px_rgba(251,191,36,0.4)]",
    badge:  "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    border: "border-l-amber-500",
    label:  "DEGRADED",
  },
  pending: {
    dot:    "bg-gray-600",
    glow:   "",
    badge:  "bg-gray-500/10 text-gray-500 border border-gray-500/20",
    border: "border-l-gray-700",
    label:  "PENDING",
  },
};
