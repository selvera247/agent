export default function Money({ value, currency = "USD" }) {
  if (value === null || value === undefined) return <span>—</span>;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
  return <span>{formatted}</span>;
}
