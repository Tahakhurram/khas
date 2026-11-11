// Business pages: one layout, with sections that depend on the unit's kind.
import { S, entries, accounts, units, unit, save, addEntry, partyName, unitName, canWrite, saveAttachment, readAttachment } from '../store.js';
import { totals, monthly, assetCosts } from '../engine.js';
import { herd, herdStats, HERD_GROUPS, holdings, sellCost, bataiSplit, instalmentProgress, rentDues, scheduleItems } from '../calc.js';
import * as H from '../hostel-calc.js';
import { KINDS } from '../seed.js';
import { esc, money, moneyShort, today, uid, fmtDate, monthsBack, monthLabel, sum, periodRange, addDays } from '../util.js';
import { $, $$, modal, toast, busy, formHtml, readForm, table, kpi, badge, amt, legend, incomeExpenseChart, series, confirmBox, compressImage, icon } from '../ui.js';
import { openEntry, showEntry } from './entry.js';

const entriesOf = (unitId) => entries().filter((e) => e.unit === unitId);
const linked = (link) => entries().filter((e) => e.link === link);
const spentOn = (es) => sum(es.filter((e) => ['expense', 'asset_purchase', 'instalment'].includes(e.type)), (e) => e.amount);
const earnedOn = (es) => sum(es.filter((e) => ['income', 'asset_sale'].includes(e.type)), (e) => e.amount);
const partyId = async (name) => {
  if (!name) return '';
  const f = S.db.parties.parties.find((p) => p.name.toLowerCase() === name.toLowerCase()); if (f) return f.id;
  const id = uid(); S.db.parties.parties.push({ id, name, kind: 'Other' }); await save('parties', `Add party ${name}`); return id;
};
const partyField = (label = 'Person / party') => ({ name: 'partyText', label, type: 'text', list: 'partyListU' });
const partyDatalist = () => `<datalist id="partyListU">${S.db.parties.parties.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>`;

// A card with a table of records and add / edit / delete in a modal.
function crud(host, o) {
  const card = document.createElement('div'); card.className = 'card section';
  const w = canWrite();
  card.innerHTML = `<div class="card-h"><h3>${esc(o.title)}${o.sub ? ` <span class="sub">· ${esc(o.sub)}</span>` : ''}</h3>${w && o.fields ? `<button class="btn sm" data-add>${icon('plus')} ${esc(o.addLabel || 'Add')}</button>` : ''}</div>
    ${table(o.cols, o.rows, { empty: o.empty || 'Nothing added yet.', rowAttr: (r) => `data-id="${esc(r.id)}"${o.fields ? ' class="click"' : ''}`, foot: o.foot })}`;
  host.appendChild(card);
  const edit = (row) => modal({
    title: row ? `Edit ${o.noun || 'record'}` : `Add ${o.noun || 'record'}`, wide: o.fields.length > 6,
    body: `<form>${formHtml(o.fields.filter((f) => !f.createOnly || !row), row ? (o.toForm ? o.toForm(row) : row) : (o.defaults || {}))}${partyDatalist()}
      <div class="actions">${row && o.remove ? '<button type="button" class="btn danger" data-del>Delete</button>' : ''}<button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div></form>`,
    onMount(b, close) {
      $('[data-cancel]', b).onclick = close;
      const del = $('[data-del]', b);
      if (del) del.onclick = async () => { if (await confirmBox(`Delete this ${o.noun || 'record'}?`)) busy(del, async () => { await o.remove(row); toast('Deleted'); close(); }); };
      $('form', b).onsubmit = (ev) => { ev.preventDefault(); busy($('[data-save]', b), async () => { await o.saveRow(row, readForm(b, o.fields)); toast('Saved'); close(); }); };
    },
  });
  const add = $('[data-add]', card); if (add) add.onclick = () => edit(null);
  if (o.fields && w) $$('tbody tr', card).forEach((tr) => (tr.onclick = (ev) => { if (ev.target.closest('button')) return; const r = o.rows.find((x) => x.id === tr.dataset.id); if (r) edit(r); }));
  if (o.bind) o.bind(card);
  return card;
}
// Standard save / delete for a list kept in one data file.
const listOps = (file, key, unitId, noun) => ({
  noun,
  async saveRow(row, vals) { const list = S.db[file][key]; if (row) Object.assign(list.find((x) => x.id === row.id), vals); else list.push({ id: uid(), unit: unitId, ...vals }); await save(file, `${row ? 'Update' : 'Add'} ${noun}`); },
  async remove(row) { S.db[file][key] = S.db[file][key].filter((x) => x.id !== row.id); await save(file, `Delete ${noun}`); },
});

// ---------- sections by kind ----------
function livestock(host, u) {
  const ls = S.db.livestock, h = herd(ls), st = herdStats(ls, today().slice(0, 4)), t = totals(entries(), accounts(), { unit: u.id, ...periodRange('year') });
  const row = document.createElement('div'); row.className = 'grid kpis';
  row.innerHTML = kpi('Herd (Dumba)', h.total, `${h.ewe} ewes · ${h.ram} rams · ${h.lamb} lambs`) + kpi('Lambs born this year', st.born, st.died ? `${st.died} died` : 'No deaths recorded')
    + kpi('Sold this year', st.sold, st.sold ? `Average ${money(st.avgPrice)} per head` : 'No sales yet') + kpi('Profit per head sold', st.sold ? money(t.net / st.sold) : '—', 'This year: net ÷ head sold');
  host.appendChild(row);
  const KINDS_EV = { birth: 'Birth', death: 'Death', purchase: 'Purchase', sale: 'Sale', grow: 'Lambs grown up', adjust: 'Count correction' };
  const fields = [
    { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'kind', label: 'What happened', type: 'select', options: Object.entries(KINDS_EV), required: true },
    { name: 'group', label: 'Group', type: 'select', options: Object.entries(HERD_GROUPS), required: true, hint: 'for "grown up": what the lambs became' }, { name: 'count', label: 'Number of animals', type: 'number', required: true },
    { name: 'weightKg', label: 'Total weight (kg)', type: 'number' }, { name: 'amount', label: 'Amount (PKR)', type: 'money', hint: 'sales and purchases only' },
    { name: 'account', label: 'Cash / bank account', type: 'select', options: accounts().filter((a) => a.cashlike).map((a) => [a.id, a.name]), required: true, noBlank: true, createOnly: true },
    partyField('Buyer / seller'), { name: 'note', label: 'Notes', type: 'text', full: true },
  ];
  crud(host, {
    title: 'Herd events', sub: 'births, deaths, sales, purchases', noun: 'herd event', addLabel: 'Record event', fields, defaults: { date: today(), kind: 'birth', group: 'lamb', account: 'cash' },
    rows: [...ls.events].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60),
    cols: [{ h: 'Date', v: (r) => fmtDate(r.date) }, { h: 'Event', v: (r) => esc(KINDS_EV[r.kind] || r.kind) }, { h: 'Group', v: (r) => esc(HERD_GROUPS[r.group] || r.group) }, { h: 'Count', num: true, v: (r) => r.count },
      { h: 'Weight', num: true, v: (r) => (r.weightKg ? r.weightKg + ' kg' : '') }, { h: 'Amount', num: true, v: (r) => (r.amount ? money(r.amount) : '') }],
    async saveRow(row, v) {
      if (row) { Object.assign(ls.events.find((x) => x.id === row.id), { ...v, account: undefined }); return save('livestock', 'Update herd event'); }
      const ev = { id: uid(), ...v }; delete ev.account; delete ev.partyText;
      if ((v.kind === 'sale' || v.kind === 'purchase') && v.amount) {
        const sale = v.kind === 'sale', cat = sale ? 'inc-livestock' : 'exp-livestock';
        const e = await addEntry({ date: v.date, type: sale ? 'income' : 'expense', unit: u.id, amount: v.amount, category: cat, account: v.account, party: await partyId(v.partyText), memo: `${sale ? 'Sold' : 'Bought'} ${v.count} ${HERD_GROUPS[v.group].toLowerCase()}${v.note ? ' · ' + v.note : ''}`,
          lines: sale ? [{ acc: v.account, dr: v.amount, cr: 0 }, { acc: cat, dr: 0, cr: v.amount }] : [{ acc: cat, dr: v.amount, cr: 0 }, { acc: v.account, dr: 0, cr: v.amount }] });
        ev.entryId = e.id;
      }
      ls.events.push(ev); await save('livestock', `Herd: ${KINDS_EV[v.kind]} ${v.count}`);
    },
    async remove(row) { ls.events = ls.events.filter((x) => x.id !== row.id); await save('livestock', 'Delete herd event'); },
  });
}

function seasons(host, u) {
  const batai = u.kind === 'batai';
  const rows = S.db.crops.seasons.filter((s) => s.unit === u.id).map((s) => {
    const es = linked(`season:${s.id}`), cost = spentOn(es), income = earnedOn(es);
    const split = batai ? bataiSplit(s) : null;
    return { ...s, cost, income, profit: income - cost, split, due: split ? split.ours - income : 0 };
  }).sort((a, b) => (String(b.year) + b.season).localeCompare(String(a.year) + a.season));
  const STATUS = [['ploughed', 'Ploughed'], ['sown', 'Sown'], ['growing', 'Growing'], ['ready', 'Ready to harvest'], ['harvested', 'Harvested']];
  const fields = [
    { name: 'crop', label: 'Crop', type: 'text', required: true, placeholder: 'Wheat, rice, maize…' }, { name: 'season', label: 'Season', type: 'select', options: [['Rabi', 'Rabi (winter)'], ['Kharif', 'Kharif (summer)']], required: true },
    { name: 'year', label: 'Year', type: 'number', required: true }, { name: 'field', label: 'Field / land', type: 'text' },
    { name: 'area', label: 'Area', type: 'number' }, { name: 'areaUnit', label: 'Area unit', type: 'select', options: [['acre', 'Acre'], ['kanal', 'Kanal'], ['marla', 'Marla']], required: true },
    { name: 'status', label: 'Stage', type: 'select', options: STATUS, required: true }, { name: 'sownDate', label: 'Sown on', type: 'date' }, { name: 'harvestDate', label: 'Harvest expected', type: 'date' },
    { name: 'yieldQty', label: 'Harvest quantity', type: 'number' }, { name: 'yieldUnit', label: 'Quantity unit', type: 'select', options: [['maund', 'Maund'], ['kg', 'Kg']] },
    ...(batai ? [partyField('Partner (farmer)'), { name: 'kind', label: 'Agreement', type: 'select', options: [['batai', 'Batai (share of crop)'], ['theka', 'Theka (fixed lease money)']], required: true },
      { name: 'pct', label: 'Our share %', type: 'number', hint: 'Batai only' }, { name: 'lease', label: 'Lease money (PKR)', type: 'money', hint: 'Theka only' },
      { name: 'produce', label: 'Total crop sale value (PKR)', type: 'money', hint: 'fill in after harvest' }, { name: 'shared', label: 'Shared costs (PKR)', type: 'money', hint: 'costs taken off before splitting' }] : []),
    { name: 'notes', label: 'Notes', type: 'text', full: true },
  ];
  const acres = (s) => (Number(s.area) || 0) * (s.areaUnit === 'kanal' ? 0.125 : s.areaUnit === 'marla' ? 0.00625 : 1);
  crud(host, {
    title: batai ? 'Batai / Theka agreements' : 'Crop seasons', noun: batai ? 'agreement' : 'season', fields, rows,
    defaults: { season: 'Rabi', year: Number(today().slice(0, 4)), areaUnit: 'acre', status: 'sown', yieldUnit: 'maund', kind: 'batai', pct: 50 },
    toForm: (r) => ({ ...r, partyText: partyName(r.partner) }),
    cols: batai ? [{ h: 'Crop / field', v: (r) => `<b>${esc(r.crop)}</b> ${esc(r.season)} ${esc(r.year)}<div class="small muted">${esc(r.field || '')}${r.area ? ` · ${r.area} ${esc(r.areaUnit)}` : ''}</div>` },
      { h: 'Partner', v: (r) => esc(partyName(r.partner)) }, { h: 'Terms', v: (r) => (r.kind === 'theka' ? 'Theka' : `Batai ${r.pct || 0}/${100 - (r.pct || 0)}`) },
      { h: 'Our share', num: true, v: (r) => money(r.split.ours) }, { h: 'Received', num: true, v: (r) => money(r.income) }, { h: 'Still owed', num: true, v: (r) => (r.due > 0 ? badge(money(r.due), 'warn') : badge('Settled', 'good')) }]
      : [{ h: 'Crop / field', v: (r) => `<b>${esc(r.crop)}</b> ${esc(r.season)} ${esc(r.year)}<div class="small muted">${esc(r.field || '')}${r.area ? ` · ${r.area} ${esc(r.areaUnit)}` : ''}</div>` },
        { h: 'Stage', v: (r) => badge((STATUS.find((x) => x[0] === r.status) || [0, r.status])[1], r.status === 'harvested' ? 'good' : r.status === 'ready' ? 'warn' : '') },
        { h: 'Harvest', num: true, v: (r) => (r.yieldQty ? `${r.yieldQty} ${esc(r.yieldUnit || '')}` : '') }, { h: 'Costs', num: true, v: (r) => money(r.cost) }, { h: 'Sales', num: true, v: (r) => money(r.income) },
        { h: 'Profit', num: true, v: (r) => amt(r.profit, true) }, { h: 'Per acre', num: true, v: (r) => (acres(r) ? money(r.profit / acres(r)) : '—') }],
    async saveRow(row, v) {
      const rec = { ...v, partner: batai ? await partyId(v.partyText) : undefined }; delete rec.partyText;
      const list = S.db.crops.seasons; if (row) Object.assign(list.find((x) => x.id === row.id), rec); else list.push({ id: uid(), unit: u.id, ...rec });
      await save('crops', `${row ? 'Update' : 'Add'} ${batai ? 'agreement' : 'season'}: ${v.crop}`);
    },
    async remove(row) { S.db.crops.seasons = S.db.crops.seasons.filter((x) => x.id !== row.id); await save('crops', 'Delete season'); },
  });
  const p = document.createElement('p'); p.className = 'small muted note';
  p.textContent = batai ? 'When adding an entry for this business, choose the agreement under "Related to" so money received counts against our share.' : 'When adding an entry for this business, choose the season under "Related to" so costs and sales count towards that crop.';
  host.appendChild(p);
}

function exportsSec(host, u) {
  const STATUS = [['quoted', 'Quoted'], ['confirmed', 'Confirmed'], ['produced', 'Produced'], ['shipped', 'Shipped'], ['paid', 'Paid']];
  const rows = S.db.exports.orders.filter((o) => o.unit === u.id).map((o) => { const es = linked(`order:${o.id}`); const value = (Number(o.famount) || 0) * (Number(o.fx) || 0); return { ...o, value, cost: spentOn(es), received: earnedOn(es) }; }).sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
  crud(host, {
    title: 'Export orders', ...listOps('exports', 'orders', u.id, 'order'), rows, defaults: { date: today(), cur: 'USD', status: 'confirmed' },
    fields: [{ name: 'name', label: 'Order / invoice no.', type: 'text', required: true }, { name: 'date', label: 'Order date', type: 'date', required: true }, partyField('Buyer'), { name: 'country', label: 'Country', type: 'text' },
      { name: 'items', label: 'Items', type: 'text', placeholder: 'Mops, kitchen towels…' }, { name: 'qty', label: 'Quantity', type: 'number' }, { name: 'cur', label: 'Invoice currency', type: 'text' },
      { name: 'famount', label: 'Invoice amount', type: 'number' }, { name: 'fx', label: 'Rate (PKR per 1)', type: 'number' }, { name: 'status', label: 'Status', type: 'select', options: STATUS, required: true }, { name: 'shipDate', label: 'Shipped on', type: 'date' }],
    cols: [{ h: 'Order', v: (r) => `<b>${esc(r.name)}</b><div class="small muted">${esc(r.partyText || '')}${r.country ? ' · ' + esc(r.country) : ''}</div>` }, { h: 'Items', v: (r) => `${esc(r.items || '')}${r.qty ? ` × ${r.qty}` : ''}` },
      { h: 'Status', v: (r) => badge((STATUS.find((x) => x[0] === r.status) || [0, r.status])[1], r.status === 'paid' ? 'good' : r.status === 'shipped' ? 'warn' : '') },
      { h: 'Invoice', num: true, v: (r) => `${esc(r.cur || '')} ${Number(r.famount || 0).toLocaleString()}<div class="small muted">${money(r.value)}</div>` }, { h: 'Costs', num: true, v: (r) => money(r.cost) }, { h: 'Received', num: true, v: (r) => money(r.received) }, { h: 'Profit', num: true, v: (r) => amt(r.received - r.cost, true) }],
  });
}

function rentalsSec(host, u) {
  const tower = u.kind === 'tower', cat = tower ? 'inc-tower' : 'inc-rent';
  const list = S.db.rentals.rentals.filter((r) => r.unit === u.id);
  const from = addDays(today(), tower ? -400 : -95), to = addDays(today(), tower ? 370 : 10);
  const dues = list.flatMap((r) => rentDues(r, from, to).map((d) => ({ ...d, r, id: r.id + d.key })));
  const unpaid = dues.filter((d) => !d.paid && d.date <= today());
  const row = document.createElement('div'); row.className = 'grid kpis';
  const occ = list.filter((r) => r.status !== 'vacant').length;
  row.innerHTML = (tower ? kpi('Yearly rent', money(sum(list, (r) => r.rent)), list[0] && list[0].increasePct ? `Rises ${list[0].increasePct}% a year` : '')
    : kpi('Flats let', `${occ} / ${list.length}`, list.length - occ ? `${list.length - occ} vacant` : 'All let') + kpi('Monthly rent roll', money(sum(list.filter((r) => r.status !== 'vacant'), (r) => r.rent)), 'When everything is paid'))
    + kpi('Overdue rent', money(sum(unpaid, (d) => d.amount)), unpaid.length ? `${unpaid.length} payment${unpaid.length > 1 ? 's' : ''} not received` : 'Nothing overdue', unpaid.length ? 'bad' : '')
    + kpi('Deposits held', money(sum(list, (r) => r.deposit)), 'Security deposits on record');
  host.appendChild(row);
  const next = dues.filter((d) => !d.paid).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 12);
  const dc = document.createElement('div'); dc.className = 'card section';
  dc.innerHTML = `<div class="card-h"><h3>Rent due <span class="sub">· not yet received</span></h3></div>${table(
    [{ h: 'Due', v: (d) => `${fmtDate(d.date)} ${d.date < today() ? badge('Overdue', 'bad') : ''}` }, { h: tower ? 'Contract' : 'Flat', v: (d) => `${esc(d.r.name)}<div class="small muted">${esc(partyName(d.r.party))}</div>` }, { h: 'Amount', num: true, v: (d) => money(d.amount) },
      { h: '', num: true, v: (d) => (canWrite() ? `<button class="btn sm" data-pay="${esc(d.id)}">Mark received</button>` : '') }], next, { empty: 'All rent up to date.' })}`;
  host.appendChild(dc);
  $$('[data-pay]', dc).forEach((b) => (b.onclick = () => {
    const d = dues.find((x) => x.id === b.dataset.pay);
    openEntry({ type: 'income', lockType: true, unit: u.id, category: cat, amount: d.amount, date: today(), partyText: partyName(d.r.party), link: `rental:${d.r.id}`, memo: `${d.r.name}: rent ${d.key}`,
      onSaved: async (e) => { const r = S.db.rentals.rentals.find((x) => x.id === d.r.id); (r.paid = r.paid || {})[d.key] = e.id; await save('rentals', `Rent received: ${r.name} ${d.key}`); } });
  }));
  crud(host, {
    title: tower ? 'Tower contract' : 'Flats and tenants', noun: tower ? 'contract' : 'flat', rows: list, defaults: { freq: tower ? 'yearly' : 'monthly', dueDay: 1, status: 'let', start: today() },
    toForm: (r) => ({ ...r, partyText: partyName(r.party) }),
    fields: [{ name: 'name', label: tower ? 'Contract name' : 'Flat name / number', type: 'text', required: true }, partyField(tower ? 'Company' : 'Tenant'), { name: 'rent', label: tower ? 'Yearly rent (PKR)' : 'Monthly rent (PKR)', type: 'money', required: true },
      { name: 'freq', label: 'Paid', type: 'select', options: [['monthly', 'Monthly'], ['yearly', 'Yearly']], required: true }, { name: 'start', label: 'Start date', type: 'date', required: true, hint: 'rent is due from here' }, { name: 'end', label: 'Lease ends', type: 'date' },
      { name: 'dueDay', label: 'Due day of month', type: 'number', hint: 'monthly only' }, { name: 'increasePct', label: 'Yearly increase %', type: 'number' }, { name: 'deposit', label: 'Security deposit (PKR)', type: 'money' },
      { name: 'status', label: 'Status', type: 'select', options: [['let', 'Let'], ['vacant', 'Vacant']], required: true }, { name: 'notes', label: 'Notes', type: 'text', full: true }],
    cols: [{ h: tower ? 'Contract' : 'Flat', v: (r) => `<b>${esc(r.name)}</b>` }, { h: tower ? 'Company' : 'Tenant', v: (r) => esc(partyName(r.party)) || '<span class="muted">—</span>' }, { h: 'Rent', num: true, v: (r) => `${money(r.rent)}<span class="small muted"> /${r.freq === 'yearly' ? 'yr' : 'mo'}</span>` },
      { h: 'Lease ends', v: (r) => (r.end ? fmtDate(r.end) : '') }, { h: 'Status', v: (r) => badge(r.status === 'vacant' ? 'Vacant' : 'Let', r.status === 'vacant' ? 'warn' : 'good') }],
    async saveRow(row, v) {
      const rec = { ...v, party: await partyId(v.partyText) }; delete rec.partyText;
      const all = S.db.rentals.rentals; if (row) Object.assign(all.find((x) => x.id === row.id), rec); else all.push({ id: uid(), unit: u.id, paid: {}, ...rec });
      await save('rentals', `${row ? 'Update' : 'Add'} ${v.name}`);
    },
    async remove(row) { S.db.rentals.rentals = S.db.rentals.rentals.filter((x) => x.id !== row.id); await save('rentals', `Delete ${row.name}`); },
  });
}

function hostelSec(host, u) {
  const h = S.hostels.find((x) => x.unit === u.id);
  const card = document.createElement('div');
  if (!h) { card.className = 'card section'; card.innerHTML = `<div class="empty">${S.hostelError ? 'The hostel app data could not be read: ' + esc(S.hostelError) : 'This business is not linked to a hostel in the hostel app yet. Link it in Settings → Businesses.'}</div>`; host.appendChild(card); return; }
  const o = H.occupancy(H.normalise(h.data)); card.className = 'grid kpis';
  card.innerHTML = kpi('Occupancy', `${o.pct}%`, `${o.occupied} of ${o.beds} beds · live`) + kpi('Empty beds', o.available, `${o.rooms} rooms`) + kpi('Rent roll now', money(o.rent), 'Per month at current occupancy') + kpi('Source', 'Hostel app', 'Rent and expenses come in automatically');
  host.appendChild(card);
}

function projectsSec(host, u) {
  const sell = u.kind === 'buildsell';
  const rows = S.db.projects.projects.filter((p) => p.unit === u.id).map((p) => { const es = linked(`project:${p.id}`); return { ...p, spent: spentOn(es), received: earnedOn(es) }; });
  crud(host, {
    title: sell ? 'Build & sell projects' : 'Construction projects', ...listOps('projects', 'projects', u.id, 'project'), rows, defaults: { status: 'building', pct: 0 },
    fields: [{ name: 'name', label: 'Project name', type: 'text', required: true }, { name: 'location', label: 'Location', type: 'text' }, { name: 'budget', label: 'Budget (PKR)', type: 'money' }, { name: 'pct', label: '% complete', type: 'number', min: 0 },
      { name: 'stage', label: 'Current stage', type: 'text', placeholder: 'Foundation, grey structure, finishing…' }, { name: 'status', label: 'Status', type: 'select', options: [['planned', 'Planned'], ['building', 'Under construction'], ['complete', 'Complete'], ['sold', 'Sold']], required: true },
      { name: 'startDate', label: 'Started', type: 'date' }, { name: 'targetDate', label: 'Target finish', type: 'date' },
      ...(sell ? [{ name: 'unitsTotal', label: 'Units to sell', type: 'number' }, { name: 'unitsSold', label: 'Units sold', type: 'number' }] : []), { name: 'notes', label: 'Notes', type: 'text', full: true }],
    cols: [{ h: 'Project', v: (r) => `<b>${esc(r.name)}</b><div class="small muted">${esc(r.stage || r.location || '')}</div>` },
      { h: 'Progress', v: (r) => `<div class="bar"><i style="width:${Math.min(100, r.pct || 0)}%"></i></div><span class="small muted">${r.pct || 0}% complete</span>` },
      { h: 'Budget', num: true, v: (r) => (r.budget ? money(r.budget) : '—') }, { h: 'Spent', num: true, v: (r) => `${money(r.spent)}${r.budget ? `<div class="small ${r.spent > r.budget ? 'neg' : 'muted'}">${Math.round((r.spent / r.budget) * 100)}% of budget</div>` : ''}` },
      ...(sell ? [{ h: 'Sold', num: true, v: (r) => `${r.unitsSold || 0} / ${r.unitsTotal || 0}` }, { h: 'Received', num: true, v: (r) => money(r.received) }, { h: 'Profit so far', num: true, v: (r) => amt(r.received - r.spent, true) }] : [])],
  });
  const p = document.createElement('p'); p.className = 'small muted note';
  p.textContent = 'Record building costs as "Asset purchase" (or "Expense") and choose the project under "Related to". They add up here against the budget.';
  host.appendChild(p);
}

function stocksSec(host, u) {
  const st = S.db.stocks, hs = holdings(st), open = hs.filter((h) => h.qty > 0);
  const row = document.createElement('div'); row.className = 'grid kpis';
  const cost = sum(open, (h) => h.cost), value = sum(open, (h) => h.value);
  row.innerHTML = kpi('Portfolio value', money(value), `Cost ${money(cost)}`) + kpi('Unrealised profit', amt(value - cost, true), cost ? `${((value - cost) / cost * 100).toFixed(1)}% on cost` : '')
    + kpi('Realised profit', amt(sum(hs, (h) => h.realised), true), 'From shares sold') + kpi('Dividends', money(sum(entries().filter((e) => e.unit === u.id && e.category === 'inc-dividends'), (e) => e.amount)), 'All time');
  host.appendChild(row);
  const card = crud(host, {
    title: 'Holdings', sub: 'average cost', rows: open.map((h) => ({ ...h, id: h.symbol })), empty: 'No shares held. Record a trade below.',
    cols: [{ h: 'Symbol', v: (r) => `<b>${esc(r.symbol)}</b>` }, { h: 'Shares', num: true, v: (r) => r.qty.toLocaleString() }, { h: 'Avg cost', num: true, v: (r) => r.avg.toFixed(2) },
      { h: 'Price', num: true, v: (r) => `<input class="price" type="number" step="any" min="0" data-sym="${esc(r.symbol)}" value="${r.price ? Number(r.price.toFixed(2)) : ''}" aria-label="Price of ${esc(r.symbol)}">` },
      { h: 'Value', num: true, v: (r) => money(r.value) }, { h: 'Profit', num: true, v: (r) => amt(r.unrealised, true) }],
  });
  if (open.length && canWrite()) {
    $('.card-h', card).insertAdjacentHTML('beforeend', '<button class="btn sm" id="savePrices">Save prices</button>');
    $('#savePrices', card).onclick = (ev) => busy(ev.currentTarget, async () => { $$('input.price', card).forEach((i) => { if (i.value) st.prices[i.dataset.sym] = { price: Number(i.value), date: today() }; }); await save('stocks', 'Update share prices'); toast('Prices saved'); });
  }
  crud(host, {
    title: 'Trades', noun: 'trade', addLabel: 'Record trade', rows: [...st.trades].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 80), defaults: { date: today(), side: 'buy', account: 'cash' },
    fields: [{ name: 'date', label: 'Date', type: 'date', required: true }, { name: 'side', label: 'Buy or sell', type: 'select', options: [['buy', 'Buy'], ['sell', 'Sell']], required: true }, { name: 'symbol', label: 'Symbol', type: 'text', required: true, placeholder: 'e.g. LUCK' },
      { name: 'qty', label: 'Shares', type: 'number', required: true }, { name: 'price', label: 'Price per share', type: 'number', required: true }, { name: 'fees', label: 'Brokerage & taxes', type: 'money' },
      { name: 'account', label: 'Cash / bank account', type: 'select', options: accounts().filter((a) => a.cashlike).map((a) => [a.id, a.name]), required: true, noBlank: true }],
    cols: [{ h: 'Date', v: (r) => fmtDate(r.date) }, { h: 'Trade', v: (r) => badge(r.side === 'buy' ? 'Buy' : 'Sell', r.side === 'buy' ? 'info' : 'good') + ` <b>${esc(r.symbol)}</b>` }, { h: 'Shares', num: true, v: (r) => Number(r.qty).toLocaleString() },
      { h: 'Price', num: true, v: (r) => Number(r.price).toFixed(2) }, { h: 'Fees', num: true, v: (r) => money(r.fees || 0) }, { h: 'Total', num: true, v: (r) => money(r.qty * r.price + (r.side === 'buy' ? 1 : -1) * (r.fees || 0)) }],
    async saveRow(row, v) {
      if (row) throw new Error('Trades cannot be edited. Delete the trade and its ledger entry, then record it again.');
      v.symbol = v.symbol.toUpperCase().replace(/[^A-Z0-9.]/g, ''); const gross = Math.round(v.qty * v.price), fees = Math.round(v.fees || 0), tag = 'stk:' + v.symbol; let e;
      if (v.side === 'buy') e = { type: 'asset_purchase', amount: gross + fees, lines: [{ acc: 'stocks', dr: gross + fees, cr: 0, asset: tag }, { acc: v.account, dr: 0, cr: gross + fees }] };
      else {
        const held = hs.find((h) => h.symbol === v.symbol); if (!held || held.qty < v.qty) throw new Error(`You hold only ${held ? held.qty : 0} shares of ${v.symbol}.`);
        const c = sellCost(st, v.symbol, v.qty), net = gross - fees, gain = net - c;
        e = { type: 'asset_sale', amount: net, cost: c, lines: [{ acc: v.account, dr: net, cr: 0 }, { acc: 'stocks', dr: 0, cr: c, asset: tag }, ...(gain > 0 ? [{ acc: 'inc-gain', dr: 0, cr: gain }] : gain < 0 ? [{ acc: 'exp-loss', dr: -gain, cr: 0 }] : [])] };
      }
      const saved = await addEntry({ ...e, date: v.date, unit: u.id, account: v.account, assetAccount: 'stocks', memo: `${v.side === 'buy' ? 'Bought' : 'Sold'} ${v.qty} ${v.symbol} @ ${v.price}` });
      st.trades.push({ id: uid(), date: v.date, side: v.side, symbol: v.symbol, qty: v.qty, price: v.price, fees, entryId: saved.id });
      if (!st.prices[v.symbol] || st.prices[v.symbol].date <= v.date) st.prices[v.symbol] = { price: v.price, date: v.date };
      await save('stocks', `${v.side === 'buy' ? 'Buy' : 'Sell'} ${v.qty} ${v.symbol}`);
    },
    async remove(row) { st.trades = st.trades.filter((x) => x.id !== row.id); await save('stocks', 'Delete trade'); toast('Trade removed. Remember to delete its ledger entry too.'); },
  });
}

export const ASSET_ACCOUNTS = [['land', 'Land & plots'], ['buildings', 'Buildings & flats'], ['cip', 'Construction in progress'], ['property-instalments', 'Property under instalment'], ['other-assets', 'Other assets']];
export const assetValue = (a, cost) => { const v = [...(a.valuations || [])].sort((x, y) => (x.date < y.date ? 1 : -1))[0]; return a.status === 'sold' ? 0 : v ? Number(v.value) : cost; };
function assetsSec(host, u) {
  const costs = assetCosts(entries()), inst = u.kind === 'instalment';
  const rows = S.db.assets.assets.filter((a) => a.unit === u.id).map((a) => { const cost = costs[a.id] || 0; return { ...a, cost, value: assetValue(a, cost), prog: instalmentProgress(a.totalPrice, cost) }; });
  if (inst && rows.length) {
    const total = sum(rows, (r) => r.totalPrice), paid = sum(rows, (r) => r.cost), pr = instalmentProgress(total, paid);
    const k = document.createElement('div'); k.className = 'grid kpis';
    k.innerHTML = kpi('Paid so far', money(paid), `${pr.pct}% of the price`) + kpi('Still to pay', money(pr.remaining), `Total price ${money(total)}`) + kpi('Status', esc(rows[0].status || 'Under construction'), 'Change it on the asset');
    host.appendChild(k);
  }
  const defAcc = { land: 'land', landtrade: 'land', instalment: 'property-instalments', construction: 'cip', buildsell: 'cip' }[u.kind] || 'buildings';
  const card = crud(host, {
    title: inst ? 'Apartments on instalment' : 'Assets', sub: 'cost, value and gain', noun: 'asset', rows, defaults: { account: defAcc, status: 'held', sizeUnit: 'marla', openingDate: today(), openingAccount: 'opening' },
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true }, { name: 'account', label: 'Kind', type: 'select', options: ASSET_ACCOUNTS, required: true }, { name: 'location', label: 'Location', type: 'text' },
      { name: 'size', label: 'Size', type: 'number' }, { name: 'sizeUnit', label: 'Size unit', type: 'select', options: [['marla', 'Marla'], ['kanal', 'Kanal'], ['acre', 'Acre'], ['sqft', 'Sq ft']] }, { name: 'acquired', label: 'Bought on', type: 'date' },
      { name: 'totalPrice', label: 'Total agreed price (PKR)', type: 'money', hint: 'instalment plans' }, { name: 'status', label: 'Status', type: 'select', options: [['held', 'Held'], ['Under construction', 'Under construction'], ['Handed over', 'Handed over'], ['Earning', 'Earning'], ['for-sale', 'For sale'], ['sold', 'Sold']], required: true },
      { name: 'openingCost', label: 'Already paid before KHAS (PKR)', type: 'money', createOnly: true, hint: 'recorded as an opening balance' }, { name: 'openingDate', label: 'As of date', type: 'date', createOnly: true }, { name: 'notes', label: 'Notes', type: 'text', full: true }],
    cols: [{ h: 'Asset', v: (r) => `<b>${esc(r.name)}</b><div class="small muted">${esc(r.location || '')}${r.size ? ` · ${r.size} ${esc(r.sizeUnit || '')}` : ''}</div>` },
      { h: 'Status', v: (r) => badge({ held: 'Held', 'for-sale': 'For sale', sold: 'Sold' }[r.status] || r.status || 'Held', r.status === 'sold' ? 'good' : r.status === 'for-sale' ? 'warn' : '') },
      { h: inst ? 'Paid' : 'Cost', num: true, v: (r) => `${money(r.cost)}${r.totalPrice ? `<div class="bar"><i style="width:${r.prog.pct}%"></i></div><span class="small muted">${r.prog.pct}% of ${moneyShort(r.totalPrice)}</span>` : ''}` },
      { h: 'Value now', num: true, v: (r) => money(r.value) }, { h: 'Gain', num: true, v: (r) => (r.status === 'sold' ? '' : amt(r.value - r.cost, true)) },
      { h: '', num: true, v: (r) => (canWrite() && r.status !== 'sold' ? `<button class="btn sm" data-val="${esc(r.id)}">Update value</button>` : '') }],
    async saveRow(row, v) {
      const rec = { ...v }; delete rec.openingCost; delete rec.openingDate;
      const all = S.db.assets.assets; let id = row && row.id;
      if (row) Object.assign(all.find((x) => x.id === id), rec); else { id = uid(); all.push({ id, unit: u.id, valuations: [], ...rec }); }
      await save('assets', `${row ? 'Update' : 'Add'} asset ${v.name}`);
      if (!row && v.openingCost) await addEntry({ date: v.openingDate || today(), type: 'opening', unit: u.id, amount: v.openingCost, asset: id, account: v.account, side: 'dr', memo: `Opening cost: ${v.name}`, lines: [{ acc: v.account, dr: v.openingCost, cr: 0, asset: id }, { acc: 'opening-equity', dr: 0, cr: v.openingCost }] });
    },
    async remove(row) { if (row.cost) throw new Error('This asset has money recorded against it. Delete or reverse those entries first.'); S.db.assets.assets = S.db.assets.assets.filter((x) => x.id !== row.id); await save('assets', `Delete asset ${row.name}`); },
  });
  $$('[data-val]', card).forEach((b) => (b.onclick = () => {
    const a = S.db.assets.assets.find((x) => x.id === b.dataset.val);
    modal({ title: `Value of ${a.name}`, body: `<form>${formHtml([{ name: 'date', label: 'As of', type: 'date', required: true }, { name: 'value', label: 'Estimated value (PKR)', type: 'money', required: true }], { date: today() })}
      <p class="small muted">A valuation changes net worth but is not counted as income.</p>
      ${(a.valuations || []).length ? table([{ h: 'Date', v: (x) => fmtDate(x.date) }, { h: 'Value', num: true, v: (x) => money(x.value) }], [...a.valuations].sort((x, y) => (x.date < y.date ? 1 : -1))) : ''}
      <div class="actions"><button class="btn primary" data-save>Save value</button></div></form>`,
      onMount(bd, close) { $('form', bd).onsubmit = (ev) => { ev.preventDefault(); busy($('[data-save]', bd), async () => { const v = readForm(bd, [{ name: 'date' }, { name: 'value', type: 'money' }]); (a.valuations = a.valuations || []).push(v); await save('assets', `Valuation: ${a.name}`); toast('Saved'); close(); }); }; } });
  }));
  if (inst) {
    const sch = S.db.schedules.schedules.filter((s) => s.unit === u.id);
    const items = sch.flatMap((s) => scheduleItems(s, '0000-01-01', '9999-12-31').map((i) => ({ ...i, s, id: s.id + i.key })));
    const c = document.createElement('div'); c.className = 'card section';
    c.innerHTML = `<div class="card-h"><h3>Instalment schedule <span class="sub">· optional</span></h3></div>${table([{ h: 'Due', v: (i) => fmtDate(i.date) }, { h: 'Plan', v: (i) => esc(i.s.name) }, { h: 'Amount', num: true, v: (i) => money(i.amount) },
      { h: 'Status', v: (i) => (i.paid ? badge('Paid', 'good') : i.date < today() ? badge('Overdue', 'bad') : badge('Upcoming')) }], items, { empty: 'No schedule yet. Instalments you pay still count above. Add a schedule under Calendar → Recurring & schedules.' })}`;
    host.appendChild(c);
  }
}

function docsSec(host, u) {
  const docs = u.docs || [], c = document.createElement('div'); c.className = 'card section';
  c.innerHTML = `<div class="card-h"><h3>Documents <span class="sub">· photos of papers, registries, agreements</span></h3>${canWrite() ? `<label class="btn sm">${icon('clip')} Add photo<input type="file" accept="image/*" hidden id="docFile"></label>` : ''}</div>
    ${docs.length ? `<div class="docs">${docs.map((d) => `<button class="btn sm" data-doc="${esc(d.attach)}">${esc(d.name)}</button>`).join('')}</div><div id="docView"></div>` : '<div class="empty">No documents added.</div>'}`;
  host.appendChild(c);
  const f = $('#docFile', c);
  if (f) f.onchange = async () => {
    const file = f.files[0]; if (!file) return;
    toast('Uploading…');
    try { const id = await saveAttachment(await compressImage(file, 1800, 500 * 1024)); (u.docs = u.docs || []).push({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), attach: id, date: today() }); await save('units', `Add document to ${u.name}`); toast('Document added'); }
    catch (err) { toast(err.message, true); }
  };
  $$('[data-doc]', c).forEach((b) => (b.onclick = async () => { $('#docView', c).innerHTML = '<p class="small muted">Loading…</p>'; const src = await readAttachment(b.dataset.doc); $('#docView', c).innerHTML = src ? `<img class="receipt" src="${src}" alt="${esc(b.textContent)}">` : '<p class="small muted">Could not load this document.</p>'; }));
}

// ---------- unit summary (used by the page, the list and the map drawer) ----------
export function unitSummary(u, range = periodRange('year')) {
  const t = totals(entries(), accounts(), { unit: u.id, from: range.from, to: range.to });
  const costs = assetCosts(entries()), as = S.db.assets.assets.filter((a) => a.unit === u.id);
  let invested = sum(as, (a) => Math.max(0, costs[a.id] || 0)), value = sum(as, (a) => assetValue(a, costs[a.id] || 0));
  if (u.kind === 'stocks') { const hs = holdings(S.db.stocks).filter((h) => h.qty > 0); invested += sum(hs, (h) => h.cost); value += sum(hs, (h) => h.value); }
  let headline = '';
  if (u.kind === 'livestock') headline = `${herd(S.db.livestock).total} Dumba`;
  else if (u.kind === 'hostel') { const h = S.hostels.find((x) => x.unit === u.id); headline = h ? `${H.occupancy(H.normalise(h.data)).pct}% occupied` : 'Not linked'; }
  else if (u.kind === 'flats') { const l = S.db.rentals.rentals.filter((r) => r.unit === u.id); headline = `${l.filter((r) => r.status !== 'vacant').length}/${l.length} let`; }
  else if (u.kind === 'construction' || u.kind === 'buildsell') { const p = S.db.projects.projects.filter((x) => x.unit === u.id); headline = p.length ? `${Math.round(sum(p, (x) => x.pct) / p.length)}% built` : 'No project yet'; }
  else if (u.kind === 'instalment') { const pr = instalmentProgress(sum(as, (a) => a.totalPrice), invested); headline = pr.total ? `${pr.pct}% paid` : `${moneyShort(invested)} paid`; }
  else if (u.kind === 'crops' || u.kind === 'batai') headline = `${S.db.crops.seasons.filter((s) => s.unit === u.id && s.status !== 'harvested').length} in the field`;
  else if (u.kind === 'exports') headline = `${S.db.exports.orders.filter((o) => o.unit === u.id && o.status !== 'paid').length} open orders`;
  else if (invested || value) headline = `Worth ${moneyShort(value)}`;
  return { ...t, invested, value, headline };
}

// ---------- pages ----------
export function renderUnits(main) {
  const r = periodRange('year');
  main.innerHTML = `<div class="page-h"><div><h1>Businesses</h1><p class="muted">Every stream of KHAS. Figures are for ${esc(r.label)}.</p></div></div>
    <div class="grid unit-grid">${units().map((u) => { const s = unitSummary(u, r); return `<a class="card unit-card" href="#/unit/${esc(u.id)}">
      <div class="uc-top"><span class="badge">${esc(KINDS[u.kind].label)}</span><span class="small muted">${esc(s.headline)}</span></div>
      <h3>${esc(u.name)}</h3><p class="small muted">${esc(u.place || '')}</p>
      <div class="uc-nums"><div><span class="small muted">Income</span><b>${moneyShort(s.income)}</b></div><div><span class="small muted">Expenses</span><b>${moneyShort(s.expense)}</b></div><div><span class="small muted">Net</span><b class="${s.net < 0 ? 'neg' : ''}">${moneyShort(s.net)}</b></div></div></a>`; }).join('')}</div>`;
}

export function renderUnit(main, id) {
  const u = unit(id); if (!u) { main.innerHTML = '<div class="empty">This business was not found.</div>'; return; }
  const yr = periodRange('year'), mo = periodRange('month'), ty = totals(entries(), accounts(), { unit: id, ...yr }), tm = totals(entries(), accounts(), { unit: id, ...mo });
  const months = monthsBack(today().slice(0, 7), 12), ms = monthly(entries(), accounts(), months, id), s = series();
  main.innerHTML = `<div class="page-h"><div><a class="crumb" href="#/units">${icon('back')} Businesses</a><h1>${esc(u.name)}</h1><p class="muted">${badge(KINDS[u.kind].label)} ${esc(u.place || '')}</p></div>
      ${canWrite() ? `<div class="top-actions"><button class="btn primary" id="unitAdd">${icon('plus')} Add entry</button></div>` : ''}</div>
    <div class="grid kpis">${kpi('Income this year', money(ty.income), `${money(tm.income)} this month`)}${kpi('Expenses this year', money(ty.expense), `${money(tm.expense)} this month`)}${kpi('Net this year', amt(ty.net, true), ty.income ? `${Math.round((ty.net / ty.income) * 100)}% margin` : '')}</div>
    <div id="kindHost"></div>
    ${ms.some((m) => m.income || m.expense) ? `<div class="card section"><div class="card-h"><h3>Income and expenses <span class="sub">· last 12 months</span></h3>${legend([[s.income, 'Income'], [s.expense, 'Expenses']])}</div><div class="chartbox"><canvas id="unitChart"></canvas></div></div>` : ''}
    <div id="assetHost"></div>
    <div class="card section"><div class="card-h"><h3>Recent entries</h3><a class="btn sm" href="#/ledger?unit=${esc(id)}">See all</a></div>${table(
      [{ h: 'Date', v: (e) => fmtDate(e.date) }, { h: 'Details', v: (e) => `${esc(e.memo || '')}${e.virtual ? ' ' + badge('Hostel app', 'info') : ''}` }, { h: 'Amount', num: true, v: (e) => `<span class="${e.type === 'income' ? 'pos' : ''}">${e.type === 'income' ? '+' : ''}${money(e.amount)}</span>` }],
      entriesOf(id).slice(0, 12), { empty: 'No entries yet for this business.', rowAttr: (e) => `data-e="${esc(e.id)}" class="click"` })}</div>
    <div id="docHost"></div>`;
  incomeExpenseChart('unitChart', ms, months.map((m) => monthLabel(m)));
  const kh = $('#kindHost', main), ah = $('#assetHost', main);
  ({ livestock, crops: seasons, batai: seasons, exports: exportsSec, flats: rentalsSec, tower: rentalsSec, hostel: hostelSec, construction: projectsSec, buildsell: projectsSec, stocks: stocksSec }[u.kind] || (() => {}))(kh, u);
  if (!['stocks', 'livestock', 'crops', 'batai', 'exports'].includes(u.kind)) assetsSec(ah, u);
  docsSec($('#docHost', main), u);
  const add = $('#unitAdd', main); if (add) add.onclick = () => openEntry({ unit: id, type: 'expense' });
  $$('[data-e]', main).forEach((tr) => (tr.onclick = () => showEntry(tr.dataset.e)));
}
