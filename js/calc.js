// Business-specific calculations (pure): herd, stocks, Batai split, rent dues, schedules, hostel feed.
import { sum, pad, monthEnd, monthsBetween, today, addDays } from './util.js';
import * as H from './hostel-calc.js';
import { HOSTEL_CAT } from './seed.js';

// ---- Livestock (Dumba) ----
export const HERD_GROUPS = { ewe: 'Ewes', ram: 'Rams', lamb: 'Lambs' };
export function herd(livestock, asOf) {
  const h = { ewe: 0, ram: 0, lamb: 0, ...(livestock.opening || {}) };
  for (const ev of livestock.events || []) {
    if (asOf && ev.date > asOf) continue;
    const n = Number(ev.count) || 0;
    if (ev.kind === 'birth' || ev.kind === 'purchase') h[ev.group] = (h[ev.group] || 0) + n;
    else if (ev.kind === 'death' || ev.kind === 'sale') h[ev.group] = (h[ev.group] || 0) - n;
    else if (ev.kind === 'grow') { h.lamb -= n; h[ev.group] = (h[ev.group] || 0) + n; } // lambs become ewes / rams
    else if (ev.kind === 'adjust') h[ev.group] = (h[ev.group] || 0) + n;
  }
  h.total = h.ewe + h.ram + h.lamb;
  return h;
}
export function herdStats(livestock, year) {
  const ev = (livestock.events || []).filter((e) => e.date.startsWith(String(year)));
  const sales = ev.filter((e) => e.kind === 'sale'), sold = sum(sales, (e) => e.count);
  return {
    born: sum(ev.filter((e) => e.kind === 'birth'), (e) => e.count), died: sum(ev.filter((e) => e.kind === 'death'), (e) => e.count),
    sold, salesValue: sum(sales, (e) => e.amount), avgPrice: sold ? sum(sales, (e) => e.amount) / sold : 0,
  };
}

// ---- Stocks: average-cost holdings ----
export function holdings(stocks) {
  const h = {};
  [...(stocks.trades || [])].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((t) => {
    const o = (h[t.symbol] = h[t.symbol] || { symbol: t.symbol, qty: 0, cost: 0, realised: 0 });
    const qty = Number(t.qty) || 0, gross = qty * (Number(t.price) || 0), fees = Number(t.fees) || 0;
    if (t.side === 'buy') { o.qty += qty; o.cost += gross + fees; }
    else { const avg = o.qty ? o.cost / o.qty : 0, c = avg * qty; o.realised += gross - fees - c; o.qty -= qty; o.cost -= c; }
  });
  return Object.values(h).map((o) => {
    const p = (stocks.prices || {})[o.symbol]; const price = p ? Number(p.price) : (o.qty ? o.cost / o.qty : 0);
    return { ...o, avg: o.qty ? o.cost / o.qty : 0, price, value: o.qty * price, unrealised: o.qty * price - o.cost };
  }).sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
}
// Cost of the shares being sold (average cost), used to post the sale.
export function sellCost(stocks, symbol, qty) { const h = holdings(stocks).find((x) => x.symbol === symbol); return h && h.qty ? Math.round(h.avg * qty) : 0; }

// ---- Batai (share) / Theka (fixed lease) ----
// produce: total sale value of the crop; shared: costs both sides agreed to share; pct: our share %.
export function bataiSplit({ kind, produce, shared, pct, lease }) {
  if (kind === 'theka') return { ours: Math.round(Number(lease) || 0), partner: 0, pool: 0 };
  const pool = (Number(produce) || 0) - (Number(shared) || 0), ours = Math.round(pool * (Number(pct) || 0) / 100);
  return { pool, ours, partner: pool - ours };
}

// ---- Instalment plans ----
export function instalmentProgress(totalPrice, paid) {
  const total = Number(totalPrice) || 0, p = Number(paid) || 0;
  return { paid: p, total, remaining: Math.max(0, total - p), pct: total ? Math.min(100, Math.round((p / total) * 100)) : 0 };
}

// ---- Rent dues (flats monthly, tower yearly) ----
// rental: { id, unit, name, party, rent, freq:'monthly'|'yearly', start, end, dueDay, increasePct, paid:{key: entryId} }
export function rentAmount(r, key) {
  const base = Number(r.rent) || 0, inc = Number(r.increasePct) || 0;
  if (!inc || !r.start) return base;
  const sy = Number(r.start.slice(0, 4)), sm = Number(r.start.slice(5, 7)), ky = Number(key.slice(0, 4)), km = key.length > 4 ? Number(key.slice(5, 7)) : sm;
  const years = Math.max(0, Math.floor(((ky - sy) * 12 + (km - sm)) / 12)); // full years since the contract started
  return Math.round(base * Math.pow(1 + inc / 100, years));
}
export function rentDues(r, from, to) {
  if (!r.start || r.status === 'vacant') return [];
  const out = [], end = r.end && r.end < to ? r.end : to, start = r.start > from ? r.start : from;
  if (r.freq === 'yearly') {
    for (let y = Number(r.start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
      const date = `${y}${r.start.slice(4)}`; if (date < start || date > end) continue;
      out.push({ key: String(y), date, amount: rentAmount(r, String(y)) });
    }
  } else {
    for (const m of monthsBetween(start.slice(0, 7), end.slice(0, 7))) {
      const day = Math.min(Number(r.dueDay) || 1, Number(monthEnd(m).slice(8))); const date = `${m}-${pad(day)}`;
      if (m < r.start.slice(0, 7)) continue;
      out.push({ key: m, date, amount: rentAmount(r, m) });
    }
  }
  return out.map((d) => ({ ...d, paid: !!(r.paid && r.paid[d.key]), entryId: r.paid && r.paid[d.key] }));
}

// ---- Schedules (recurring items and instalment plans) ----
// schedule: { id, name, unit, kind:'income'|'expense'|'instalment', category, asset, party, amount, freq:'monthly'|'quarterly'|'yearly'|'custom', start, end, items:[{date, amount}], done:{key: entryId} }
export function scheduleItems(s, from, to) {
  let items = [];
  if (s.freq === 'custom') items = (s.items || []).map((i) => ({ key: i.date, date: i.date, amount: Number(i.amount) || 0 }));
  else if (s.start) {
    const step = s.freq === 'yearly' ? 12 : s.freq === 'quarterly' ? 3 : 1; const end = s.end && s.end < to ? s.end : to;
    let [y, m] = s.start.split('-').map(Number); const day = s.start.slice(8);
    for (let i = 0; i < 1200; i++) {
      const mo = `${y}-${pad(m)}`, date = `${mo}-${pad(Math.min(Number(day), Number(monthEnd(mo).slice(8))))}`;
      if (date > end) break;
      items.push({ key: date, date, amount: Number(s.amount) || 0 });
      m += step; while (m > 12) { m -= 12; y++; }
    }
  }
  return items.filter((i) => i.date >= from && i.date <= to).map((i) => ({ ...i, paid: !!(s.done && s.done[i.key]), entryId: s.done && s.done[i.key] }));
}

// ---- Everything that is due, in one list (calendar & alerts) ----
export function allDues(db, from, to) {
  const out = [];
  for (const r of db.rentals.rentals) for (const d of rentDues(r, from, to)) out.push({ ...d, src: 'rental', id: r.id, unit: r.unit, kind: 'income', title: `${r.freq === 'yearly' ? 'Yearly rent' : 'Rent'}: ${r.name}`, party: r.party });
  for (const s of db.schedules.schedules) for (const d of scheduleItems(s, from, to)) out.push({ ...d, src: 'schedule', id: s.id, unit: s.unit, kind: s.kind, title: s.name, party: s.party });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
export function reminders(db, asOf = today()) {
  const out = [], soon = addDays(asOf, 60);
  for (const r of db.rentals.rentals) if (r.end && r.end >= asOf && r.end <= soon) out.push({ date: r.end, unit: r.unit, title: `Lease ends: ${r.name}`, tone: 'warn' });
  for (const s of db.crops.seasons) if (s.harvestDate && s.status !== 'harvested' && s.harvestDate <= soon) out.push({ date: s.harvestDate, unit: s.unit, title: `${s.partner ? 'Harvest & split' : 'Harvest'}: ${s.crop}${s.field ? ' · ' + s.field : ''}`, tone: s.harvestDate < asOf ? 'bad' : 'warn' });
  for (const o of db.exports.orders) if (o.status === 'shipped') out.push({ date: o.shipDate || o.date, unit: o.unit, title: `Payment pending: export order ${o.name}`, tone: 'warn' });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---- Hostel feed -> virtual ledger entries (never saved) ----
// hostels: [{ hostelId, unit, name, data }]
export function hostelEntries(hostels, asOf = today()) {
  const out = [], nowM = asOf.slice(0, 7);
  for (const h of hostels) {
    const d = H.normalise(h.data), first = H.firstMonth(d); if (!first) continue;
    for (const m of monthsBetween(first, nowM)) {
      const date = m === nowM ? asOf : monthEnd(m), base = { date, unit: h.unit, virtual: true, by: 'hostel-app', method: 'Hostel app' };
      const rent = H.incomeFor(d, m);
      if (rent) out.push({ ...base, id: `h:${h.hostelId}:${m}:rent`, type: 'income', amount: rent, memo: `${h.name}: rent income ${m}`, lines: [{ acc: 'hostel-cash', dr: rent, cr: 0 }, { acc: 'inc-rent', dr: 0, cr: rent }] });
      const cats = {}; Object.entries(H.expensesByCategory(d, m)).forEach(([c, v]) => { const a = HOSTEL_CAT[c] || 'exp-other'; cats[a] = (cats[a] || 0) + v; });
      Object.entries(cats).forEach(([acc, v]) => { v = Math.round(v); if (v) out.push({ ...base, id: `h:${h.hostelId}:${m}:${acc}`, type: 'expense', amount: v, memo: `${h.name}: expenses ${m}`, lines: [{ acc, dr: v, cr: 0 }, { acc: 'hostel-cash', dr: 0, cr: v }] }); });
    }
  }
  return out;
}
