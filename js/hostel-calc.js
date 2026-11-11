// Hostel income / expense / occupancy calculations.
// KEEP IN SYNC with hostel-management-system/js/app.js (incomeFor, occupiedIn, expensesFor, stats).
// The logic is identical; the only difference is that these take the hostel's data object `d`
// ({ floors, rooms:[{beds:[{occupant:{fee, since}}]}], expenses:[{date, category, amount}], history:[{from, to, fee}] })
// as an argument instead of reading the hostel app's global state.
export function normalise(d) {
  d = d || {}; d.floors = d.floors || []; d.rooms = d.rooms || []; d.expenses = d.expenses || []; d.history = d.history || [];
  d.rooms.forEach((r) => (r.beds = r.beds || []));
  return d;
}
export function incomeFor(d, month) {
  let t = 0;
  d.rooms.forEach((r) => r.beds.forEach((b) => { if (b.occupant && (b.occupant.since || '').slice(0, 7) <= month) t += Number(b.occupant.fee) || 0; }));
  d.history.forEach((h) => { if ((h.from || '').slice(0, 7) <= month && (h.to || '').slice(0, 7) >= month) t += Number(h.fee) || 0; });
  return t;
}
export function occupiedIn(d, month) {
  let n = 0;
  d.rooms.forEach((r) => r.beds.forEach((b) => { if (b.occupant && (b.occupant.since || '').slice(0, 7) <= month) n++; }));
  d.history.forEach((h) => { if ((h.from || '').slice(0, 7) <= month && (h.to || '').slice(0, 7) >= month) n++; });
  return n;
}
export const expensesFor = (d, month) => d.expenses.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + Number(e.amount), 0);
export function expensesByCategory(d, month) {
  const by = {};
  d.expenses.filter((e) => e.date.startsWith(month)).forEach((e) => { by[e.category] = (by[e.category] || 0) + Number(e.amount); });
  return by;
}
// Current occupancy (same as the hostel dashboard's headline numbers).
export function occupancy(d) {
  let beds = 0, occupied = 0, rent = 0;
  d.rooms.forEach((r) => r.beds.forEach((b) => { beds++; if (b.occupant) { occupied++; rent += Number(b.occupant.fee) || 0; } }));
  return { beds, occupied, available: beds - occupied, pct: beds ? Math.round((occupied / beds) * 100) : 0, rent, rooms: d.rooms.length };
}
// First month that has any data, or null.
export function firstMonth(d) {
  const ms = [];
  d.rooms.forEach((r) => r.beds.forEach((b) => { if (b.occupant && b.occupant.since) ms.push(b.occupant.since.slice(0, 7)); }));
  d.history.forEach((h) => { if (h.from) ms.push(h.from.slice(0, 7)); });
  d.expenses.forEach((e) => { if (e.date) ms.push(e.date.slice(0, 7)); });
  return ms.filter((m) => /^\d{4}-\d{2}$/.test(m)).sort()[0] || null;
}
