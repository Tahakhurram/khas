// Browser tests for the accounting engine and business calculations. No build step, no framework.
import { buildLines, validate, pnl, balanceSheet, trialBalance, accountLedger, partyBalances, ageing, assetCosts, totals, reverseOf, isLocked, ENTRY_TYPES } from '../js/engine.js';
import { herd, holdings, sellCost, bataiSplit, instalmentProgress, rentDues, rentAmount, scheduleItems, hostelEntries } from '../js/calc.js';
import * as H from '../js/hostel-calc.js';
import { ACCOUNTS } from '../js/seed.js';
import { pkGroup, short, money, periodRange, monthsBetween } from '../js/util.js';
import { demoFiles } from '../js/demo.js';

const out = document.getElementById('out'); let pass = 0, fail = 0;
function test(name, fn) {
  const li = document.createElement('li');
  try { fn(); li.className = 'ok'; li.textContent = '✓ ' + name; pass++; } catch (e) { li.className = 'fail'; li.textContent = `✗ ${name}: ${e.message}`; fail++; }
  out.appendChild(li);
}
const eq = (a, b, msg = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const sum = (ls, k) => ls.reduce((s, l) => s + l[k], 0);
const acc = [...ACCOUNTS, { id: 'bank', name: 'Bank', type: 'asset', cashlike: true }];
const E = (date, type, f) => ({ id: type + date + Math.random(), date, type, amount: f.amount, unit: f.unit, party: f.party, lines: buildLines(type, f) });

// 1. every entry type produces balanced lines that pass validation
const forms = {
  income: { amount: 1000, account: 'cash', category: 'inc-rent' }, expense: { amount: 700, account: 'cash', category: 'exp-feed' }, transfer: { amount: 500, from: 'cash', to: 'bank' },
  asset_purchase: { amount: 9000, account: 'bank', assetAccount: 'land', asset: 'a1' }, asset_sale: { amount: 12000, cost: 9000, account: 'bank', assetAccount: 'land', asset: 'a1' },
  instalment: { amount: 600, account: 'bank', asset: 'z1' }, receipt: { amount: 300, account: 'cash' }, payment: { amount: 200, account: 'cash' }, deposit_in: { amount: 100, account: 'cash' }, deposit_out: { amount: 100, account: 'cash' },
  loan_given: { amount: 50, account: 'cash' }, loan_back: { amount: 50, account: 'cash' }, loan_taken: { amount: 80, account: 'cash' }, loan_repaid: { amount: 80, account: 'cash' },
  drawing: { amount: 40, account: 'cash' }, capital: { amount: 400, account: 'cash' }, opening: { amount: 5000, account: 'bank', side: 'dr' },
  journal: { lines: [{ acc: 'cash', dr: 10, cr: 0 }, { acc: 'inc-other', dr: 0, cr: 10 }] },
};
Object.keys(ENTRY_TYPES).forEach((t) => test(`"${ENTRY_TYPES[t]}" posts balanced lines`, () => {
  const lines = buildLines(t, forms[t]); eq(sum(lines, 'dr'), sum(lines, 'cr'), 'debits vs credits');
  eq(validate({ date: '2026-01-01', lines }, acc), null, 'validation');
}));
test('Asset sale at a loss posts the loss', () => { const l = buildLines('asset_sale', { amount: 8000, cost: 9000, account: 'bank', assetAccount: 'land' }); eq(l.find((x) => x.acc === 'exp-loss').dr, 1000); eq(sum(l, 'dr'), sum(l, 'cr')); });
test('Unbalanced journal is rejected', () => { if (!validate({ date: '2026-01-01', lines: [{ acc: 'cash', dr: 10, cr: 0 }, { acc: 'inc-other', dr: 0, cr: 9 }] }, acc)) throw new Error('should fail'); });
test('Unknown account is rejected', () => { if (!validate({ date: '2026-01-01', lines: [{ acc: 'nope', dr: 10, cr: 0 }, { acc: 'cash', dr: 0, cr: 10 }] }, acc)) throw new Error('should fail'); });

// 2. reports tie out on a small set of books
const es = [
  E('2026-01-01', 'opening', { amount: 100000, account: 'bank', side: 'dr' }),
  E('2026-01-05', 'income', { amount: 45000, account: 'bank', category: 'inc-rent', unit: 'flats' }),
  E('2026-01-08', 'expense', { amount: 12000, account: 'cash', category: 'exp-feed', unit: 'farm' }),
  E('2026-01-09', 'transfer', { amount: 20000, from: 'bank', to: 'cash' }),
  E('2026-02-01', 'asset_purchase', { amount: 60000, account: 'bank', assetAccount: 'land', asset: 'p1', unit: 'land' }),
  E('2026-02-10', 'income', { amount: 30000, account: 'receivables', category: 'inc-rent', unit: 'flats', party: 'ali' }),
  E('2026-03-15', 'receipt', { amount: 10000, account: 'cash', party: 'ali' }),
  E('2026-03-20', 'asset_sale', { amount: 75000, cost: 60000, account: 'bank', assetAccount: 'land', asset: 'p1', unit: 'land' }),
  E('2026-03-25', 'drawing', { amount: 5000, account: 'cash' }),
];
test('Profit & loss: income 90,000 (incl. gain), expenses 12,000, net 78,000', () => { const p = pnl(es, acc, {}); eq([p.totalIncome, p.totalExpense, p.net], [90000, 12000, 78000]); });
test('Profit & loss by business', () => { eq(totals(es, acc, { unit: 'flats' }).net, 75000); eq(totals(es, acc, { unit: 'farm' }).net, -12000); eq(totals(es, acc, { unit: 'land' }).net, 15000); });
test('Balance sheet balances: assets = liabilities + equity', () => { const b = balanceSheet(es, acc, '2026-12-31'); eq(b.totalAssets, b.totalLiabilities + b.totalEquity); eq(b.netWorth, 173000); });
test('Balance sheet as of an earlier date', () => { const b = balanceSheet(es, acc, '2026-01-31'); eq(b.totalAssets, 133000); eq(b.totalAssets, b.totalLiabilities + b.totalEquity); });
test('Trial balance: debits = credits', () => { const t = trialBalance(es, acc); eq(t.totalDr, t.totalCr); });
test('Cash book running balance', () => { const l = accountLedger(es, 'cash', { from: '2026-02-01' }); eq(l.opening, 8000); eq(l.closing, 13000); eq(l.rows.length, 2); });
test('Party balance and ageing', () => { eq(partyBalances(es).ali.net, 20000); const a = ageing(es, '2026-04-20'); eq(a[0].total, 20000); eq(a[0].b60, 20000); });
test('Asset cost goes to zero after it is sold', () => eq(assetCosts(es).p1, 0));
test('Reversal cancels an entry', () => { const r = reverseOf(es[2], '2026-04-01'); const p = pnl([...es, { ...r, id: 'r' }], acc, {}); eq(p.totalExpense, 0); });
test('Period lock', () => { eq(isLocked('2026-06-30', '2026-06-30'), true); eq(isLocked('2026-07-01', '2026-06-30'), false); eq(isLocked('2026-07-01', ''), false); });

// 3. business calculations
test('Batai split 50/50 after shared costs', () => eq(bataiSplit({ kind: 'batai', produce: 2600000, shared: 400000, pct: 50 }), { pool: 2200000, ours: 1100000, partner: 1100000 }));
test('Batai split 60/40', () => eq(bataiSplit({ kind: 'batai', produce: 1000000, shared: 0, pct: 60 }).ours, 600000));
test('Theka is the fixed lease money', () => eq(bataiSplit({ kind: 'theka', lease: 600000, produce: 999 }).ours, 600000));
test('Instalment progress', () => { eq(instalmentProgress(9500000, 2375000), { paid: 2375000, total: 9500000, remaining: 7125000, pct: 25 }); eq(instalmentProgress(0, 500).pct, 0); });
test('Herd count from events', () => eq(herd({ opening: { ewe: 10, ram: 2, lamb: 5 }, events: [{ date: '2026-01-01', kind: 'birth', group: 'lamb', count: 6 }, { date: '2026-02-01', kind: 'sale', group: 'ram', count: 1 }, { date: '2026-03-01', kind: 'grow', group: 'ewe', count: 4 }, { date: '2026-03-02', kind: 'death', group: 'lamb', count: 1 }] }), { ewe: 14, ram: 1, lamb: 6, total: 21 }));
test('Stocks: average cost and realised profit', () => { const st = { trades: [{ date: '2026-01-01', side: 'buy', symbol: 'X', qty: 100, price: 10, fees: 0 }, { date: '2026-01-02', side: 'buy', symbol: 'X', qty: 100, price: 20, fees: 0 }], prices: { X: { price: 25 } } };
  eq(sellCost(st, 'X', 50), 750); st.trades.push({ date: '2026-01-03', side: 'sell', symbol: 'X', qty: 50, price: 30, fees: 0 }); const h = holdings(st)[0]; eq([h.qty, h.cost, h.realised, h.value, h.unrealised], [150, 2250, 750, 3750, 1500]); });
test('Monthly rent dues and paid marks', () => { const d = rentDues({ rent: 45000, freq: 'monthly', start: '2026-01-10', dueDay: 5, paid: { '2026-02': 'x' } }, '2026-01-01', '2026-03-31'); eq(d.map((x) => [x.key, x.date, x.paid]), [['2026-01', '2026-01-05', false], ['2026-02', '2026-02-05', true], ['2026-03', '2026-03-05', false]]); });
test('Yearly tower rent with 10% increase', () => { const r = { rent: 950000, freq: 'yearly', start: '2024-11-29', increasePct: 10 }; eq(rentDues(r, '2026-01-01', '2026-12-31').map((x) => [x.date, x.amount]), [['2026-11-29', 1149500]]); eq(rentAmount(r, '2024'), 950000); });
test('Schedules: quarterly and custom', () => { eq(scheduleItems({ freq: 'quarterly', start: '2026-01-31', amount: 600000 }, '2026-01-01', '2026-12-31').map((x) => x.date), ['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31']);
  eq(scheduleItems({ freq: 'custom', items: [{ date: '2027-01-15', amount: 5 }], done: { '2027-01-15': 'e' } }, '2027-01-01', '2027-12-31')[0].paid, true); });

// 4. formatting
test('Pakistani number grouping', () => { eq(pkGroup(1250000), '12,50,000'); eq(pkGroup(999), '999'); eq(pkGroup(100000), '1,00,000'); eq(pkGroup(-12345678), '-1,23,45,678'); eq(money(1500), 'Rs 1,500'); });
test('Lakh and crore short forms', () => { eq(short(1250000), '12.5 lakh'); eq(short(12000000), '1.2 crore'); eq(short(45000), '45k'); eq(short(250000000), '25 crore'); });
test('Fiscal year range (Jul to Jun)', () => { eq(periodRange('fy', '2026-11-11').from, '2026-07-01'); eq(periodRange('fy', '2026-03-01').to, '2026-06-30'); eq(monthsBetween('2025-11', '2026-02').length, 4); });

// 5. hostel feed matches the hostel app's own calculations (same formulas as hostel-management-system/js/app.js)
const hd = H.normalise({ rooms: [{ beds: [{ occupant: { fee: 15000, since: '2026-01-10' } }, { occupant: { fee: '18000', since: '2026-03-01' } }, { occupant: null }] }], history: [{ from: '2026-01-05', to: '2026-02-20', fee: 12000 }], expenses: [{ date: '2026-02-03', category: 'Electricity', amount: 40000 }, { date: '2026-02-09', category: 'Food', amount: 9000 }, { date: '2026-02-11', category: 'Internet', amount: 6000 }] });
test('Hostel income per month (current residents + past residents)', () => { eq([H.incomeFor(hd, '2026-01'), H.incomeFor(hd, '2026-02'), H.incomeFor(hd, '2026-03')], [27000, 27000, 33000]); eq(H.occupiedIn(hd, '2026-02'), 2); });
test('Hostel expenses and occupancy', () => { eq(H.expensesFor(hd, '2026-02'), 55000); eq(H.occupancy(hd), { beds: 3, occupied: 2, available: 1, pct: 67, rent: 33000, rooms: 1 }); });
test('Hostel feed lines are balanced, virtual and match the totals', () => { const v = hostelEntries([{ hostelId: 'h', unit: 'hostel', name: 'H', data: hd }], '2026-03-20');
  v.forEach((e) => { eq(sum(e.lines, 'dr'), sum(e.lines, 'cr')); eq(e.virtual, true); });
  const feb = v.filter((e) => e.id.includes('2026-02')); eq(totals(feb, acc, {}), { income: 27000, expense: 55000, net: -28000 }); eq(feb.find((e) => e.lines[0].acc === 'exp-utilities').amount, 46000); eq(totals(v, acc, {}).income, 87000); });

// 6. the demo books (hundreds of entries) balance
test('Demo data: every entry valid, balance sheet balances', () => { const d = demoFiles().data, all = Object.keys(d).filter((k) => k.startsWith('ledger/')).flatMap((k) => d[k].entries), a = d['accounts.json'].accounts;
  if (all.length < 100) throw new Error('too few demo entries'); all.forEach((e) => { const err = validate(e, a); if (err) throw new Error(`${e.memo}: ${err}`); });
  const b = balanceSheet(all, a, '9999-12-31'); eq(b.totalAssets, b.totalLiabilities + b.totalEquity); const t = trialBalance(all, a); eq(t.totalDr, t.totalCr); });

// 7. the data layer, end to end, on the in-memory demo backend (same code paths as GitHub, nothing saved)
import { S, connect, loadAll, entries, addEntry, updateEntry, deleteEntry, decide, allSubmissions, save, quick } from '../js/store.js';
async function atest(name, fn) { const li = document.createElement('li'); try { await fn(); li.className = 'ok'; li.textContent = '✓ ' + name; pass++; } catch (e) { li.className = 'fail'; li.textContent = `✗ ${name}: ${e.message}`; fail++; } out.appendChild(li); }
await connect({ username: 'taha', role: 'owner', token: 'demo' }, demoFiles()); await loadAll();
await atest('Store: loads demo books and the live hostel feed', async () => { if (!entries().some((e) => e.virtual)) throw new Error('no hostel feed lines'); if (!entries().some((e) => !e.virtual)) throw new Error('no saved entries'); if (S.hostels.length !== 1) throw new Error('hostel not linked'); });
await atest('Store: hostel feed is never written to the ledger files', async () => { if (Object.values(S.ledger).some((y) => y.entries.some((e) => e.virtual))) throw new Error('virtual entry was saved'); });
await atest('Store: add, edit and delete an entry', async () => {
  const before = quick({ unit: 'flats' }).income, d = new Date().toISOString().slice(0, 10);
  const e = await addEntry({ date: d, type: 'income', unit: 'flats', amount: 1000, lines: buildLines('income', { amount: 1000, account: 'cash', category: 'inc-rent' }) }); eq(quick({ unit: 'flats' }).income, before + 1000);
  await updateEntry(e.id, { ...e, amount: 2500, lines: buildLines('income', { amount: 2500, account: 'cash', category: 'inc-rent' }) }); eq(quick({ unit: 'flats' }).income, before + 2500);
  await deleteEntry(e.id); eq(quick({ unit: 'flats' }).income, before);
});
await atest('Store: unbalanced entries and locked periods are refused', async () => {
  let threw = 0; const d = new Date().toISOString().slice(0, 10);
  try { await addEntry({ date: d, type: 'journal', amount: 5, lines: [{ acc: 'cash', dr: 5, cr: 0 }, { acc: 'inc-other', dr: 0, cr: 4 }] }); } catch { threw++; }
  S.db.meta.lockThrough = d; await save('meta', 'lock');
  try { await addEntry({ date: d, type: 'income', unit: 'flats', amount: 10, lines: buildLines('income', { amount: 10, account: 'cash', category: 'inc-rent' }) }); } catch { threw++; }
  S.db.meta.lockThrough = ''; await save('meta', 'unlock'); eq(threw, 2);
});
await atest('Store: approving a staff submission posts it to the ledger once', async () => {
  const sub = allSubmissions().find((x) => x.status === 'pending'), before = quick({ unit: sub.unit })[sub.kind];
  await decide(sub, true, { account: 'cash' }); eq(quick({ unit: sub.unit })[sub.kind], before + sub.amount);
  let threw = false; try { await decide(sub, true, { account: 'cash' }); } catch { threw = true; } eq(threw, true);
  const other = allSubmissions().find((x) => x.status === 'pending'); await decide(other, false, { reason: 'test' }); eq(allSubmissions().filter((x) => x.status === 'pending').length, 0);
});
await atest('Store: books still balance after all of the above', async () => { const real = entries(), b = balanceSheet(real, S.db.accounts.accounts, '9999-12-31'); eq(b.totalAssets, b.totalLiabilities + b.totalEquity); });

document.getElementById('summary').textContent = fail ? `${fail} FAILED, ${pass} passed` : `All ${pass} tests passed`;
document.getElementById('summary').className = fail ? 'fail' : 'ok'; document.title = fail ? `FAIL ${fail}` : `PASS ${pass}`;
