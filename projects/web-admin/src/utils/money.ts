function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function formatCents(cents: number) {
  if (!Number.isFinite(cents)) return '-';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  const y = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(yuan);
  return `${sign}￥${y}.${pad2(fen)}`;
}

export function centsToYuanInput(cents: number) {
  if (!Number.isFinite(cents)) return '0.00';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  return `${sign}${yuan}.${pad2(fen)}`;
}

export function parseYuanToCents(input: string) {
  const raw = input.trim();
  if (!raw) return 0;
  const m = raw.match(/^(-)?(\d+)(?:\.(\d{0,2}))?$/);
  if (!m) throw new Error('Invalid money input');
  const neg = Boolean(m[1]);
  const yuan = Number(m[2]);
  const frac = m[3] || '';
  const fen = Number((frac + '00').slice(0, 2));
  const cents = yuan * 100 + fen;
  return neg ? -cents : cents;
}
