// KHAS accounting engine. Pure functions, no DOM, no storage: everything takes plain data.
// An entry: { id, date, type, unit, amount, memo, party, method, lines:[{acc, dr, cr, asset?}], link?, by, at }
import { sum } from './util.js';

export const ENTRY_TYPES = {
  income: 'Income', expense: 'Expense', transfer: 'Transfer', asset_purchase: 'Asset purchase', asset_sale: 'Asset sale',
  instalment: 'Instalment payment', receipt: 'Receipt from party', payment: 'Payment to party',
  deposit_in: 'Security deposit received', deposit_out: 'Security deposit refunded',
  loan_given: 'Loan given', loan_back: 'Loan received back', loan_taken: 'Loan taken', loan_repaid: 'Loan repaid',
  drawing: 'Owner drawing', capital: 'Owner capital added', opening: 'Opening balance', journal: 'Journal',
};

const L = (acc, dr, cr, extra) => ({ acc, dr: Math.round(dr || 0), cr: Math.round(cr || 0), ...(extra || {}) });

// Turn a simple form into balanced debit / credit lines.
// f: { amount, account, category, from, to, asset, assetAccount, cost, lines, side }
export function buildLines(type, f) {
  const amt = Math.round(Number(f.amount) || 0);
  const tag = f.asset ? { asset: f.asset } : null;
  switch (type) {
    case 'income': return [L(f.account, amt, 0), L(f.category, 0, amt)];
    case 'expense': return [L(f.category, amt, 0), L(f.account, 0, amt)];
    case 'transfer': return [L(f.to, amt, 0), L(f.from, 0, amt)];
    case 'asset_purchase': return [L(f.assetAccount, amt, 0, tag), L(f.account, 0, amt)];
    case 'instalment': return [L('property-instalments', amt, 0, tag), L(f.account, 0, amt)];
    case 'asset_sale': {
      const cost = Math.round(Number(f.cost) || 0), gain = amt - cost;
      const lines = [L(f.account, amt, 0), L(f.assetAccount, 0, cost, tag)];
      if (gain > 0) lines.push(L('inc-gain', 0, gain));
      if (gain < 0) lines.push(L('exp-loss', -gain, 0));
      return lines.filter((l) => l.dr || l.cr);
    }
    case 'receipt': return [L(f.account, amt, 0), L('receivables', 0, amt)];
    case 'payment': return [L('payables', amt, 0), L(f.account, 0, amt)];
    case 'deposit_in': return [L(f.account, amt, 0), L('deposits', 0, amt)];
    case 'deposit_out': return [L('deposits', amt, 0), L(f.account, 0, amt)];
    case 'loan_given': return [L('loans-given', amt, 0), L(f.account, 0, amt)];
    case 'loan_back': return [L(f.account, amt, 0), L('loans-given', 0, amt)];
    case 'loan_taken': return [L(f.account, amt, 0), L('loans-taken', 0, amt)];
    case 'loan_repaid': return [L('loans-taken', amt, 0), L(f.account, 0, amt)];
    case 'drawing': return [L('drawings', amt, 0), L(f.account, 0, amt)];
    case 'capital': return [L(f.account, amt, 0), L('capital', 0, amt)];
    case 'opening': // side 'dr' for things we own, 'cr' for things we owe
      return f.side === 'cr' ? [L('opening-equity', amt, 0), L(f.account, 0, amt, tag)] : [L(f.account, amt, 0, tag), L('opening-equity', 0, amt)];
    case 'journal': return (f.lines || []).map((l) => L(l.acc, l.dr, l.cr, l.asset ? { asset: l.asset } : null)).filter((l) => l.dr || l.cr);
    default: throw new Error('Unknown entry type: ' + type);
  }
}

export function validate(entry, accounts) {
  const ids = new Set(accounts.map((a) => a.id));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date || '')) return 'Enter a valid date.';
  if (!entry.lines || entry.lines.length < 2) return 'An entry needs at least two lines.';
  for (const l of entry.lines) {
    if (!ids.has(l.acc)) return 'Choose an account for every line.';
    if (l.dr < 0 || l.cr < 0) return 'Amounts cannot be negative.';
  }
  const dr = sum(entry.lines, (l) => l.dr), cr = sum(entry.lines, (l) => l.cr);
  if (dr !== cr) return `Debits (${dr}) and credits (${cr}) do not match.`;
  if (dr === 0) return 'Enter an amount.';
  return null;
}
export const isLocked = (date, lockThrough) => !!lockThrough && date <= lockThrough;

// A reversing entry: same lines with debit and credit swapped.
export const reverseOf = (e, date) => ({
  ...e, id: undefined, date, type: 'journal', memo: `Reversal of ${e.date}: ${e.memo || ENTRY_TYPES[e.type] || ''}`.trim(),
  lines: e.lines.map((l) => ({ ...l, dr: l.cr, cr: l.dr })), reverses: e.id, virtual: undefined,
});

const inRange = (e, from, to) => (!from || e.date >= from) && (!to || e.date <= to);
const typeOf = (accounts) => { const m = {}; accounts.forEach((a) => (m[a.id] = a.type)); return m; };

// account id -> debit minus credit, over a date range and optional unit
export function balances(entries, { from, to, unit } = {}) {
  const b = {};
  for (const e of entries) {
    if (!inRange(e, from, to) || (unit && e.unit !== unit)) continue;
    for (const l of e.lines) b[l.acc] = (b[l.acc] || 0) + l.dr - l.cr;
  }
  return b;
}

export function pnl(entries, accounts, { from, to, unit } = {}) {
  const b = balances(entries, { from, to, unit });
  const income = [], expense = [];
  for (const a of accounts) {
    const v = b[a.id] || 0; if (!v) continue;
    if (a.type === 'income') income.push({ acc: a.id, name: a.name, amount: -v });
    if (a.type === 'expense') expense.push({ acc: a.id, name: a.name, amount: v });
  }
  const ti = sum(income, (x) => x.amount), te = sum(expense, (x) => x.amount);
  return { income, expense, totalIncome: ti, totalExpense: te, net: ti - te };
}

// Income, expense and net for one unit (or all) – the quick numbers used everywhere.
export function totals(entries, accounts, opts = {}) {
  const t = typeOf(accounts); let income = 0, expense = 0;
  for (const e of entries) {
    if (!inRange(e, opts.from, opts.to) || (opts.unit && e.unit !== opts.unit)) continue;
    for (const l of e.lines) { if (t[l.acc] === 'income') income += l.cr - l.dr; else if (t[l.acc] === 'expense') expense += l.dr - l.cr; }
  }
  return { income, expense, net: income - expense };
}

// { unitId: {income, expense, net} }
export function totalsByUnit(entries, accounts, opts = {}) {
  const t = typeOf(accounts), out = {};
  for (const e of entries) {
    if (!inRange(e, opts.from, opts.to)) continue;
    const u = e.unit || '_none';
    for (const l of e.lines) {
      if (t[l.acc] !== 'income' && t[l.acc] !== 'expense') continue;
      const o = (out[u] = out[u] || { income: 0, expense: 0, net: 0 });
      if (t[l.acc] === 'income') o.income += l.cr - l.dr; else o.expense += l.dr - l.cr;
      o.net = o.income - o.expense;
    }
  }
  return out;
}

// months: ['2026-01', ...] -> [{month, income, expense, net}]
export function monthly(entries, accounts, months, unit) {
  const t = typeOf(accounts), idx = {}; const out = months.map((m, i) => { idx[m] = i; return { month: m, income: 0, expense: 0, net: 0 }; });
  for (const e of entries) {
    const o = out[idx[e.date.slice(0, 7)]]; if (!o || (unit && e.unit !== unit)) continue;
    for (const l of e.lines) { if (t[l.acc] === 'income') o.income += l.cr - l.dr; else if (t[l.acc] === 'expense') o.expense += l.dr - l.cr; }
  }
  out.forEach((o) => (o.net = o.income - o.expense));
  return out;
}

export function balanceSheet(entries, accounts, asOf) {
  const b = balances(entries, { to: asOf });
  const assets = [], liabilities = [], equity = []; let earnings = 0;
  for (const a of accounts) {
    const v = b[a.id] || 0;
    if (a.type === 'income' || a.type === 'expense') { earnings -= v; continue; }
    if (!v) continue;
    if (a.type === 'asset') assets.push({ acc: a.id, name: a.name, group: a.group, amount: v });
    else if (a.type === 'liability') liabilities.push({ acc: a.id, name: a.name, amount: -v });
    else equity.push({ acc: a.id, name: a.name, amount: -v });
  }
  if (earnings) equity.push({ acc: '_earnings', name: 'Accumulated profit', amount: earnings });
  const ta = sum(assets, (x) => x.amount), tl = sum(liabilities, (x) => x.amount), te = sum(equity, (x) => x.amount);
  return { assets, liabilities, equity, totalAssets: ta, totalLiabilities: tl, totalEquity: te, netWorth: ta - tl };
}

export function trialBalance(entries, accounts, { from, to } = {}) {
  const b = balances(entries, { from, to });
  const rows = accounts.filter((a) => b[a.id]).map((a) => ({ acc: a.id, name: a.name, type: a.type, dr: b[a.id] > 0 ? b[a.id] : 0, cr: b[a.id] < 0 ? -b[a.id] : 0 }));
  return { rows, totalDr: sum(rows, (r) => r.dr), totalCr: sum(rows, (r) => r.cr) };
}

// Running statement of one account (cash book when the account is cash or a bank).
export function accountLedger(entries, acc, { from, to } = {}) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let opening = 0, bal = 0; const rows = [];
  for (const e of sorted) {
    for (const l of e.lines) {
      if (l.acc !== acc) continue;
      if (from && e.date < from) { opening += l.dr - l.cr; continue; }
      if (to && e.date > to) continue;
      rows.push({ entry: e, dr: l.dr, cr: l.cr });
    }
  }
  bal = opening; rows.forEach((r) => { bal += r.dr - r.cr; r.balance = bal; });
  return { opening, rows, closing: bal };
}

const OWED_TO_US = ['receivables', 'loans-given'], WE_OWE = ['payables', 'deposits', 'loans-taken'];
// { partyId: { owesUs, weOwe, net } }  net > 0 means the party owes us
export function partyBalances(entries, asOf) {
  const out = {};
  for (const e of entries) {
    if (!e.party || (asOf && e.date > asOf)) continue;
    const o = (out[e.party] = out[e.party] || { owesUs: 0, weOwe: 0, net: 0 });
    for (const l of e.lines) {
      if (OWED_TO_US.includes(l.acc)) o.owesUs += l.dr - l.cr;
      else if (WE_OWE.includes(l.acc)) o.weOwe += l.cr - l.dr;
    }
    o.net = o.owesUs - o.weOwe;
  }
  return out;
}
export function partyStatement(entries, party) {
  let bal = 0;
  return [...entries].filter((e) => e.party === party).sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => {
    let d = 0; for (const l of e.lines) { if (OWED_TO_US.includes(l.acc) || WE_OWE.includes(l.acc)) d += l.dr - l.cr; }
    bal += d; return { entry: e, change: d, balance: bal };
  });
}

// Receivables ageing: debits are settled oldest first by credits; what is left is bucketed by age.
export function ageing(entries, asOf) {
  const per = {};
  [...entries].filter((e) => e.party && e.date <= asOf).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((e) => {
    for (const l of e.lines) {
      if (l.acc !== 'receivables') continue;
      const p = (per[e.party] = per[e.party] || { open: [], credit: 0 });
      if (l.dr) p.open.push({ date: e.date, amt: l.dr });
      if (l.cr) p.credit += l.cr;
    }
  });
  const days = (d) => Math.round((new Date(asOf + 'T00:00') - new Date(d + 'T00:00')) / 864e5);
  return Object.entries(per).map(([party, p]) => {
    let c = p.credit; const row = { party, b0: 0, b30: 0, b60: 0, b90: 0, total: 0 };
    for (const o of p.open) {
      const used = Math.min(c, o.amt); c -= used; const left = o.amt - used; if (!left) continue;
      const d = days(o.date); row[d <= 30 ? 'b0' : d <= 60 ? 'b30' : d <= 90 ? 'b60' : 'b90'] += left; row.total += left;
    }
    row.total -= c; // over-payment shows as a negative total
    return row;
  }).filter((r) => r.total);
}

// Book cost of each tagged asset: { assetId: cost }
export function assetCosts(entries) {
  const out = {};
  for (const e of entries) for (const l of e.lines) if (l.asset) out[l.asset] = (out[l.asset] || 0) + l.dr - l.cr;
  return out;
}

// Equity at book value at the end of each month (for the net worth trend).
export function netWorthSeries(entries, accounts, months) {
  const t = typeOf(accounts); const delta = {}; let before = 0;
  for (const e of entries) {
    const m = e.date.slice(0, 7); let d = 0;
    for (const l of e.lines) { if (t[l.acc] === 'asset') d += l.dr - l.cr; else if (t[l.acc] === 'liability') d += l.dr - l.cr; }
    if (m < months[0]) before += d; else delta[m] = (delta[m] || 0) + d;
  }
  let run = before;
  return months.map((m) => { run += delta[m] || 0; return { month: m, value: run }; });
}
