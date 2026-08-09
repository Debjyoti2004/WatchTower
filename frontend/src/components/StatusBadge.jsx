import { STATUS } from "../constants.js";

export default function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider font-mono ${s.badge}`}>
      {s.label}
    </span>
  );
}
