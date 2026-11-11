// Made-up data so every screen and the map can be seen working. Lives in memory only; never saved.
import { FILES } from './seed.js';
import { buildLines } from './engine.js';
import { today, addDays, monthsBack, pad, monthEnd } from './util.js';

export function demoFiles() {
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280, vary = (n, p = 0.15) => Math.round(n * (1 + (rnd() - 0.5) * 2 * p) / 500) * 500;
  const f = {}; Object.keys(FILES).forEach((k) => (f[k] = FILES[k]()));
  const now = today(), thisM = now.slice(0, 7), months = monthsBack(thisM, 14), year = Number(now.slice(0, 4));
  const ledger = {}; let n = 0;
  const E = (date, type, unit, amount, o = {}) => {
    if (date > now) return null;
    const e = { id: 'd' + (++n), date, type, unit, amount: Math.round(amount), account: 'hbl', by: 'taha', at: date + 'T10:00:00Z', ...o };
    e.lines = buildLines(type, e); (ledger[date.slice(0, 4)] = ledger[date.slice(0, 4)] || { entries: [] }).entries.push(e); return e;
  };
  const inc = (d, u, cat, amt, memo, o) => E(d, 'income', u, amt, { category: cat, memo, ...o }), exp = (d, u, cat, amt, memo, o) => E(d, 'expense', u, amt, { category: cat, memo, ...o });

  f.accounts.accounts.push({ id: 'hbl', name: 'HBL current account', type: 'asset', group: 'bank', cashlike: true }, { id: 'meezan', name: 'Meezan savings account', type: 'asset', group: 'bank', cashlike: true });
  const party = (id, name, kind) => { f.parties.parties.push({ id, name, kind }); return id; };
  ['Imran Sheikh', 'Bilal Ahmed', 'Sana Malik', 'Usman Tariq', 'Hamza Raza', 'Ayesha Noor'].forEach((nm, i) => party('t' + i, nm, 'Tenant'));
  party('telco', 'Telecom tower company', 'Tenant'); party('farmer1', 'Ghulam Rasool', 'Farmer / partner'); party('farmer2', 'Allah Ditta', 'Farmer / partner'); party('buyer1', 'HomeCare Supplies (UK)', 'Buyer'); party('contractor', 'Rana Builders', 'Contractor'); party('zes', 'Zesora Developers', 'Supplier');

  const start = months[0] + '-01';
  E(start, 'opening', '', 36000000, { account: 'hbl', side: 'dr', memo: 'Opening balance: HBL current account' }); E(start, 'opening', '', 1500000, { account: 'meezan', side: 'dr', memo: 'Opening balance: Meezan savings' }); E(start, 'opening', '', 3200000, { account: 'cash', side: 'dr', memo: 'Opening balance: cash in hand' });
  const asset = (id, unit, name, account, cost, o = {}) => { f.assets.assets.push({ id, unit, name, account, status: 'held', valuations: [], ...o }); if (cost) E(start, 'opening', unit, cost, { account, side: 'dr', asset: id, memo: `Opening cost: ${name}` }); };
  asset('a-flats', 'flats', 'Flats building, Johar Town', 'buildings', 42000000, { location: 'Johar Town, Lahore', valuations: [{ date: now, value: 61000000 }] });
  asset('a-tower', 'tower-plot', 'Tower plot', 'land', 9000000, { location: 'Lahore', size: 10, sizeUnit: 'marla', valuations: [{ date: now, value: 14500000 }] });
  asset('a-hostel', 'hostel-de-khas', 'Hostel De Khas building', 'buildings', 55000000, { location: 'Ali Town, Lahore', valuations: [{ date: now, value: 72000000 }] });
  asset('a-h2', 'hostel-2', 'Hostel 2 (land and structure)', 'cip', 21000000, { location: 'Ali Town, Lahore', status: 'Under construction' });
  asset('a-ng', 'nathia-gali', 'Nathia Gali plot', 'land', 6500000, { location: 'Nathia Gali', size: 2, sizeUnit: 'kanal', valuations: [{ date: now, value: 11000000 }] });
  asset('a-z1', 'zesora', 'Zesora apartment A-204', 'property-instalments', 2400000, { location: 'Khanuspur', totalPrice: 9500000, status: 'Under construction' });
  asset('a-z2', 'zesora', 'Zesora apartment A-205', 'property-instalments', 2400000, { location: 'Khanuspur', totalPrice: 9500000, status: 'Under construction' });
  asset('a-p1', 'land-trading', 'Plot 14, Bahria Orchard', 'land', 7800000, { location: 'Lahore', size: 10, sizeUnit: 'marla', status: 'for-sale', valuations: [{ date: now, value: 9600000 }] });
  asset('a-p2', 'land-trading', 'Plot 88, DHA Rahbar', 'land', 12500000, { location: 'Lahore', size: 1, sizeUnit: 'kanal', valuations: [{ date: now, value: 13800000 }] });
  asset('a-p3', 'land-trading', 'Plot 7, Lake City', 'land', 5200000, { location: 'Lahore', size: 5, sizeUnit: 'marla', status: 'sold' });
  asset('a-bs', 'build-sell', 'Three houses, Ali Town', 'cip', 16000000, { location: 'Ali Town, Lahore', status: 'Under construction' });
  E(addDays(now, -70), 'asset_sale', 'land-trading', 6900000, { asset: 'a-p3', assetAccount: 'land', cost: 5200000, memo: 'Sold Plot 7, Lake City' });

  // rentals
  const rents = [48000, 45000, 52000, 45000, 60000, 47000];
  rents.forEach((r, i) => f.rentals.rentals.push({ id: 'r' + i, unit: 'flats', name: `Flat ${i + 1}`, party: i === 4 ? '' : 't' + i, rent: r, freq: 'monthly', start: months[0] + '-01', end: i === 1 ? addDays(now, 38) : `${year + 1}-06-30`, dueDay: 5, deposit: r * 2, status: i === 4 ? 'vacant' : 'let', paid: {} }));
  f.rentals.rentals.push({ id: 'rt', unit: 'tower-plot', name: 'Tower land lease', party: 'telco', rent: 950000, freq: 'yearly', start: addDays(now, 18 - 365), increasePct: 10, status: 'let', paid: {} });
  E(addDays(now, 18 - 365), 'income', 'tower-plot', 950000, { category: 'inc-tower', party: 'telco', memo: 'Tower land lease: yearly rent' }); f.rentals.rentals[6].paid[String(Number(addDays(now, 18 - 365).slice(0, 4)))] = 'd' + n;

  months.forEach((m, mi) => {
    const d = (day) => `${m}-${pad(Math.min(day, Number(monthEnd(m).slice(8))))}`;
    f.rentals.rentals.slice(0, 6).forEach((r, i) => { if (r.status === 'vacant') return; if (m === thisM && i >= 3) return; if (mi === months.length - 2 && i === 3) return; const e = inc(d(5 + i), 'flats', 'inc-rent', r.rent, `${r.name}: rent ${m}`, { party: r.party, link: 'rental:' + r.id }); if (e) r.paid[m] = e.id; });
    exp(d(12), 'flats', 'exp-maintenance', vary(22000, 0.5), 'Plumbing, paint and repairs');
    exp(d(3), 'dumba-farm', 'exp-feed', vary(85000), 'Wanda, chara and silage', { account: 'cash' }); exp(d(28), 'dumba-farm', 'exp-labour', 60000, 'Farm workers salaries', { account: 'cash' }); if (mi % 3 === 0) exp(d(15), 'dumba-farm', 'exp-vet', vary(18000, 0.4), 'Vaccination and medicine', { account: 'cash' });
    exp(d(20), 'crops', 'exp-water', vary(14000, 0.3), 'Tube well electricity', { account: 'cash', link: 'season:s1' });
    exp(d(9), 'hostel-2', 'exp-other', vary(15000, 0.4), 'Site guard and misc.', { account: 'cash', link: 'project:p1' });
    E(d(14), 'asset_purchase', 'hostel-2', vary(1400000, 0.3), { asset: 'a-h2', assetAccount: 'cip', party: 'contractor', memo: 'Construction: material and labour', link: 'project:p1' });
    if (mi % 2 === 0) E(d(18), 'asset_purchase', 'build-sell', vary(900000, 0.3), { asset: 'a-bs', assetAccount: 'cip', party: 'contractor', memo: 'Houses: grey structure work', link: 'project:p2' });
    if (mi % 3 === 1) E(d(10), 'instalment', 'zesora', 600000, { asset: mi % 2 ? 'a-z1' : 'a-z2', party: 'zes', memo: 'Zesora quarterly instalment' });
    if (mi % 3 === 2) inc(d(22), 'stocks', 'inc-dividends', vary(64000, 0.4), 'Dividends received');
    E(d(25), 'drawing', '', 250000, { memo: 'Household drawing' });
    if (mi > 2) E(d(27), 'transfer', '', vary(180000, 0.2), { from: 'hostel-cash', to: 'hbl', memo: 'Hostel cash deposited in bank' });
  });

  // livestock
  f.livestock.opening = { ewe: 46, ram: 6, lamb: 18 }; f.meta.herdValue = { ewe: 55000, ram: 95000, lamb: 30000 };
  const ev = (date, kind, group, count, amount, weightKg) => { if (date > now) return; const o = { id: 'e' + (++n), date, kind, group, count, amount: amount || '', weightKg: weightKg || '' };
    if (amount) { const e = kind === 'sale' ? inc(date, 'dumba-farm', 'inc-livestock', amount, `Sold ${count} ${group}s`) : exp(date, 'dumba-farm', 'exp-livestock', amount, `Bought ${count} ${group}s`); o.entryId = e.id; } f.livestock.events.push(o); };
  ev(addDays(now, -330), 'birth', 'lamb', 14); ev(addDays(now, -300), 'sale', 'ram', 4, 420000, 260); ev(addDays(now, -210), 'grow', 'ewe', 10); ev(addDays(now, -170), 'sale', 'lamb', 9, 765000, 520); ev(addDays(now, -160), 'purchase', 'ram', 2, 190000); ev(addDays(now, -120), 'birth', 'lamb', 21); ev(addDays(now, -100), 'death', 'lamb', 2); ev(addDays(now, -45), 'sale', 'ram', 3, 345000, 205); ev(addDays(now, -12), 'birth', 'lamb', 9);

  // crops and batai
  f.crops.seasons.push(
    { id: 's1', unit: 'crops', crop: 'Wheat', season: 'Rabi', year, field: 'North field', area: 12, areaUnit: 'acre', status: 'growing', sownDate: addDays(now, -60), harvestDate: addDays(now, 50) },
    { id: 's2', unit: 'crops', crop: 'Maize', season: 'Kharif', year, field: 'Canal side', area: 8, areaUnit: 'acre', status: 'harvested', yieldQty: 520, yieldUnit: 'maund' },
    { id: 's3', unit: 'crops', crop: 'Mustard', season: 'Rabi', year, field: 'Small plot', area: 3, areaUnit: 'acre', status: 'ready', harvestDate: addDays(now, 9) },
    { id: 's4', unit: 'crops', crop: 'Fodder', season: 'Rabi', year, field: 'Farm side', area: 4, areaUnit: 'acre', status: 'sown' },
    { id: 'b1', unit: 'batai', crop: 'Rice', season: 'Kharif', year, field: 'East block', area: 15, areaUnit: 'acre', status: 'harvested', partner: 'farmer1', kind: 'batai', pct: 50, produce: 2600000, shared: 400000 },
    { id: 'b2', unit: 'batai', crop: 'Wheat', season: 'Rabi', year, field: 'West block', area: 10, areaUnit: 'acre', status: 'growing', partner: 'farmer2', kind: 'theka', lease: 600000, harvestDate: addDays(now, 55) });
  exp(addDays(now, -62), 'crops', 'exp-seed', 96000, 'Wheat seed', { link: 'season:s1' }); exp(addDays(now, -40), 'crops', 'exp-fertiliser', 210000, 'DAP and urea', { link: 'season:s1' }); exp(addDays(now, -200), 'crops', 'exp-seed', 70000, 'Maize seed', { link: 'season:s2' }); exp(addDays(now, -150), 'crops', 'exp-machinery', 85000, 'Harvester and tractor', { link: 'season:s2' });
  inc(addDays(now, -120), 'crops', 'inc-crops', 1250000, 'Maize sold at mandi', { link: 'season:s2' });
  inc(addDays(now, -95), 'batai', 'inc-batai', 800000, 'Rice batai: part of our share', { party: 'farmer1', link: 'season:b1' }); inc(addDays(now, -58), 'batai', 'inc-batai', 300000, 'Theka advance, west block', { party: 'farmer2', link: 'season:b2' });

  // exports
  f.exports.orders.push({ id: 'o1', unit: 'exports', name: 'KX-1042', date: addDays(now, -140), partyText: 'HomeCare Supplies (UK)', country: 'UK', items: 'Cotton mops', qty: 12000, cur: 'USD', famount: 21600, fx: 279, status: 'paid', shipDate: addDays(now, -110) },
    { id: 'o2', unit: 'exports', name: 'KX-1049', date: addDays(now, -40), partyText: 'HomeCare Supplies (UK)', country: 'UK', items: 'Kitchen towels', qty: 30000, cur: 'USD', famount: 18900, fx: 281, status: 'shipped', shipDate: addDays(now, -6) });
  exp(addDays(now, -132), 'exports', 'exp-materials', 3900000, 'Yarn and stitching, KX-1042', { link: 'order:o1' }); exp(addDays(now, -111), 'exports', 'exp-freight', 310000, 'Freight and clearing, KX-1042', { link: 'order:o1' });
  inc(addDays(now, -85), 'exports', 'inc-export', 21600 * 279, 'Payment received, KX-1042', { party: 'buyer1', link: 'order:o1', cur: 'USD', famount: 21600, fx: 279 });
  exp(addDays(now, -30), 'exports', 'exp-materials', 3350000, 'Fabric and stitching, KX-1049', { link: 'order:o2' }); exp(addDays(now, -6), 'exports', 'exp-freight', 280000, 'Freight, KX-1049', { link: 'order:o2' });

  // projects, schedules, stocks
  f.projects.projects.push({ id: 'p1', unit: 'hostel-2', name: 'Hostel 2 building', location: 'Ali Town, Lahore', budget: 48000000, pct: 55, stage: 'Grey structure, 3rd floor', status: 'building', startDate: months[0] + '-01', targetDate: addDays(now, 240) },
    { id: 'p2', unit: 'build-sell', name: 'Three houses, Ali Town', location: 'Ali Town, Lahore', budget: 30000000, pct: 66, stage: 'House 2 finishing', status: 'building', unitsTotal: 3, unitsSold: 1 });
  inc(addDays(now, -25), 'build-sell', 'inc-other', 4000000, 'Booking advance, House 1', { link: 'project:p2' });
  f.schedules.schedules.push({ id: 'sc1', name: 'Zesora instalments', unit: 'zesora', kind: 'instalment', asset: 'a-z1', party: 'zes', amount: 600000, freq: 'quarterly', start: addDays(now, 21), end: addDays(now, 800), done: {} });
  const trade = (date, side, symbol, qty, price) => { const gross = qty * price, fees = Math.round(gross * 0.002), tag = 'stk:' + symbol;
    const e = E(date, 'journal', 'stocks', gross + fees, { memo: `Bought ${qty} ${symbol} @ ${price}`, lines: [{ acc: 'stocks', dr: gross + fees, cr: 0, asset: tag }, { acc: 'hbl', dr: 0, cr: gross + fees }] }); e.type = 'asset_purchase';
    f.stocks.trades.push({ id: 'tr' + e.id, date, side, symbol, qty, price, fees, entryId: e.id }); };
  trade(addDays(now, -380), 'buy', 'LUCK', 800, 910); trade(addDays(now, -300), 'buy', 'ENGRO', 2500, 320); trade(addDays(now, -220), 'buy', 'MEBL', 3000, 228); trade(addDays(now, -90), 'buy', 'OGDC', 4000, 196);
  f.stocks.prices = { LUCK: { price: 1085, date: now }, ENGRO: { price: 341, date: now }, MEBL: { price: 262, date: now }, OGDC: { price: 188, date: now } };

  // hostel app data (as the hostel app would store it)
  const rooms = []; for (let fl = 1; fl <= 3; fl++) for (let r = 1; r <= 6; r++) rooms.push({ id: `${fl}0${r}`, floorId: 'f' + fl, name: `${fl}0${r}`, beds: [0, 1, 2].map((b) => ({ id: `${fl}${r}${b}`, label: String(b + 1), occupant: rnd() < 0.86 ? { name: 'Resident', fee: 14000 + Math.round(rnd() * 4) * 1000, since: months[Math.floor(rnd() * 3)] + '-01' } : null })) });
  const hx = []; months.forEach((m) => [['Electricity', 120000], ['Salaries', 110000], ['Food', 90000], ['Internet', 12000], ['Maintenance', 25000]].forEach(([c, a]) => { const date = `${m}-10`; if (date <= now) hx.push({ id: 'x' + (++n), date, category: c, amount: vary(a, 0.2), note: '' }); }));
  const hostel = { 'hostels.json': { hostels: [{ id: 'hostel-de-khas', name: 'HOSTEL DE KHAS' }] }, 'hostels/hostel-de-khas.json': { floors: [1, 2, 3].map((i) => ({ id: 'f' + i, name: 'Floor ' + i })), rooms, expenses: hx, history: [] } };

  const data = {}; Object.entries(f).forEach(([k, v]) => (data[`${k}.json`] = v)); Object.entries(ledger).forEach(([y, v]) => (data[`ledger/${y}.json`] = v));
  const cat = (t) => f.accounts.accounts.filter((a) => a.type === t).map((a) => ({ id: a.id, name: a.name }));
  const inbox = { 'config.json': { assign: { staff1: ['dumba-farm', 'crops'], staff2: ['flats'] }, units: f.units.units.map((u) => ({ id: u.id, name: u.name, kind: u.kind })), categories: { income: cat('income'), expense: cat('expense') } },
    'submissions/staff1.json': { items: [{ id: 'sub1', by: 'staff1', at: now + 'T08:00:00Z', status: 'pending', kind: 'expense', unit: 'dumba-farm', category: 'exp-feed', amount: 42000, date: now, memo: 'Chara for the week', partyName: 'Village fodder shop', method: 'Cash' },
      { id: 'sub2', by: 'staff1', at: addDays(now, -1) + 'T08:00:00Z', status: 'pending', kind: 'income', unit: 'dumba-farm', category: 'inc-livestock', amount: 96000, date: addDays(now, -1), memo: 'Sold 1 ram at mandi', method: 'Cash' }] } };
  return { data, inbox, hostel };
}
export const DEMO_USERS = [{ username: 'khurram', role: 'owner', name: 'Khurram Suleman' }, { username: 'asma', role: 'owner', name: 'Asma Khurram' }, { username: 'taha', role: 'owner', name: 'Taha Khurram' }, { username: 'khizer', role: 'owner', name: 'Khizer Khurram' }, { username: 'staff1', role: 'staff', name: 'Staff 1' }, { username: 'staff2', role: 'staff', name: 'Staff 2' }];
