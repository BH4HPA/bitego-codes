export function centsToYuan(cents: number) {
  return (cents / 100).toFixed(2);
}

export function formatCents(cents: number) {
  const n = Number.isFinite(cents) ? cents : 0;
  return `¥${centsToYuan(n)}`;
}

export function parseYuanToCents(yuan: string) {
  const s = String(yuan || "").trim();
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
