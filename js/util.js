// Small shared helpers: escaping, Pakistani number formatting, dates, ids.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 1250000 -> "12,50,000" (lakh / crore grouping)
export function pkGroup(n) {
  const neg = n < 0; const s = String(Math.round(Math.abs(Number(n) || 0)));
  if (s.length <= 3) return (neg ? '-' : '') + s;
  const last3 = s.slice(-3); let rest = s.slice(0, -3); const parts = [];
  while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
  if (rest) parts.unshift(rest);
  return (neg ? '-' : '') + parts.join(',') + ',' + last3;
}
export const money = (n) => `Rs ${pkGroup(n)}`;
// 1250000 -> "12.5 lakh", 12000000 -> "1.2 crore"
export function short(n) {
  const a = Math.abs(Number(n) || 0), sign = n < 0 ? '-' : '';
  const trim = (x) => String(Number(x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2)));
  if (a >= 1e7) return `${sign}${trim(a / 1e7)} crore`;
  if (a >= 1e5) return `${sign}${trim(a / 1e5)} lakh`;
  if (a >= 1e3) return `${sign}${trim(a / 1e3)}k`;
  return sign + Math.round(a);
}
export const moneyShort = (n) => `Rs ${short(n)}`;

export const uid = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
export const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
export const thisMonth = () => today().slice(0, 7);
export const addDays = (iso, n) => { const d = new Date(iso + 'T00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 864e5);
export const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); return `${m}-${pad(new Date(y, mo, 0).getDate())}`; };
export function monthsBack(month, n) {
  const [y, m] = month.split('-').map(Number), out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }
  return out;
}
export function monthsBetween(a, b) { // inclusive list of YYYY-MM
  const out = []; let [y, m] = a.split('-').map(Number);
  while (`${y}-${pad(m)}` <= b && out.length < 600) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
export const monthLabel = (m, long) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit' }); };
export const fmtDate = (s) => (s ? new Date(s + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
export const by = (k) => (a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Period helpers: returns {from, to, label}
export function periodRange(kind, ref = today()) {
  const y = Number(ref.slice(0, 4)), m = Number(ref.slice(5, 7));
  if (kind === 'month') return { from: `${ref.slice(0, 7)}-01`, to: monthEnd(ref.slice(0, 7)), label: monthLabel(ref.slice(0, 7), true) };
  if (kind === 'quarter') { const q = Math.floor((m - 1) / 3), a = `${y}-${pad(q * 3 + 1)}`, b = `${y}-${pad(q * 3 + 3)}`; return { from: a + '-01', to: monthEnd(b), label: `Q${q + 1} ${y}` }; }
  if (kind === 'fy') { const sy = m >= 7 ? y : y - 1; return { from: `${sy}-07-01`, to: `${sy + 1}-06-30`, label: `FY ${sy}-${String(sy + 1).slice(2)}` }; }
  if (kind === 'all') return { from: '0000-01-01', to: '9999-12-31', label: 'All time' };
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
}
