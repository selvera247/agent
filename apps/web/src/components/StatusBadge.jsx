export default function StatusBadge({ status }) {
  return <span className={`badge ${status}`}>{status.replaceAll("_", " ")}</span>;
}
