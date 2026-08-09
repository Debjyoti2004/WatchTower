import { STATUS } from "../constants.js";

export default function StatusDot({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${s.dot} ${s.glow}`} />;
}
