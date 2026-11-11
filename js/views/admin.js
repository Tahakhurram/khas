// Calendar & schedules, Approvals, Settings, Import / Export, and the staff screens.
import { S, entries, accounts, units, unit, unitName, accName, partyName, cashAccounts, save, addEntry, addEntries, canWrite, isOwner, allSubmissions, decide, submit, withdraw, assignedUnits, saveInboxConfig, saveAttachment, readAttachment } from '../store.js';
import { ENTRY_TYPES } from '../engine.js';
import { allDues, reminders, HERD_GROUPS, sellCost } from '../calc.js';
import { KINDS } from '../seed.js';
import { esc, money, today, fmtDate, sum, uid, slug, addDays, monthLabel } from '../util.js';
import { $, $$, table, badge, modal, formHtml, readForm, busy, toast, icon, confirmBox, kpi, compressImage } from '../ui.js';
import { openEntry, showEntry } from './entry.js';
import { Excel } from '../excel.js';

const partyId = (name, pending) => {
  if (!name) return '';
  const all = S.db.parties.parties, f = all.find((p) => p.name.toLowerCase() === String(name).toLowerCase()); if (f) return f.id;
  const id = uid(); all.push({ id, name: String(name), kind: 'Other' }); if (pending) pending.parties = true; return id;
};

// ---------- Calendar ----------
export function renderCalendar(main) {
  const from = addDays(today(), -120), to = addDays(today(), 180);
  const dues = allDues(S.db, from, to).filter((d) => !d.paid || d.date >= addDays(today(), -31)).map((d) => ({ ...d, k: `${d.src}:${d.id}:${d.key}` }));
  const rem = reminders(S.db), overdue = dues.filter((d) => !d.paid && d.date < today());
  const months = [...new Set(dues.map((d) => d.date.slice(0, 7)))];
  const sch = S.db.schedules.schedules, w = canWrite();
  main.innerHTML = `<div class="page-h"><div><h1>Calendar and alerts</h1><p class="muted">Rent, tower rent, instalments and other dates to remember.</p></div></div>
    <div class="grid kpis">${kpi('Overdue', money(sum(overdue, (d) => d.amount)), `${overdue.length} item${overdue.length === 1 ? '' : 's'}`, overdue.length ? 'bad' : '')}${kpi('Due in 30 days', money(sum(dues.filter((d) => !d.paid && d.date >= today() && d.date <= addDays(today(), 30)), (d) => d.amount)), 'Expected in and out')}${kpi('Reminders', rem.length, 'Leases ending, harvests, unpaid exports')}</div>
    ${rem.length ? `<div class="card section"><div class="card-h"><h3>Reminders</h3></div>${table([{ h: 'Date', v: (r) => fmtDate(r.date) }, { h: 'What', v: (r) => `${badge(r.tone === 'bad' ? 'Late' : 'Soon', r.tone)} ${esc(r.title)}` }, { h: 'Business', v: (r) => esc(unitName(r.unit)) }], rem)}</div>` : ''}
    ${months.length ? months.map((m) => `<div class="card section"><div class="card-h"><h3>${monthLabel(m, true)}</h3></div>${table(
      [{ h: 'Due', v: (d) => fmtDate(d.date) }, { h: 'What', v: (d) => `${esc(d.title)}<div class="small muted">${esc(unitName(d.unit))}${d.party ? ' · ' + esc(partyName(d.party)) : ''}</div>` }, { h: 'Amount', num: true, v: (d) => `${d.kind === 'income' ? '+' : '−'}${money(d.amount)}` },
        { h: 'Status', num: true, v: (d) => (d.paid ? badge(d.kind === 'income' ? 'Received' : 'Paid', 'good') : `${d.date < today() ? badge('Overdue', 'bad') + ' ' : ''}${w ? `<button class="btn sm" data-due="${esc(d.k)}">${d.kind === 'income' ? 'Mark received' : 'Mark paid'}</button>` : ''}`) }],
      dues.filter((d) => d.date.startsWith(m)))}</div>`).join('') : '<div class="card section"><div class="empty">Nothing scheduled. Add flats and contracts on their business pages, or add a schedule below.</div></div>'}
    <div class="card section"><div class="card-h"><h3>Recurring items and schedules</h3>${w ? `<button class="btn sm" id="schAdd">${icon('plus')} Add</button>` : ''}</div>${table(
      [{ h: 'Name', v: (s) => `<b>${esc(s.name)}</b><div class="small muted">${esc(unitName(s.unit))}</div>` }, { h: 'Kind', v: (s) => esc({ income: 'Income', expense: 'Expense', instalment: 'Instalment' }[s.kind]) }, { h: 'Repeats', v: (s) => esc({ monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly', custom: `${(s.items || []).length} dates` }[s.freq]) }, { h: 'Amount', num: true, v: (s) => (s.freq === 'custom' ? money(sum(s.items || [], (i) => i.amount)) : money(s.amount)) }],
      sch, { empty: 'No schedules yet.', rowAttr: (s) => `data-sch="${esc(s.id)}" class="click"` })}</div>`;
  $$('[data-due]', main).forEach((b) => (b.onclick = () => {
    const d = dues.find((x) => x.k === b.dataset.due);
    if (d.src === 'rental') { const r = S.db.rentals.rentals.find((x) => x.id === d.id); const u = unit(r.unit) || {};
      openEntry({ type: 'income', lockType: true, unit: r.unit, category: u.kind === 'tower' ? 'inc-tower' : 'inc-rent', amount: d.amount, partyText: partyName(r.party), link: `rental:${r.id}`, memo: `${r.name}: rent ${d.key}`, onSaved: async (e) => { (r.paid = r.paid || {})[d.key] = e.id; await save('rentals', `Rent received: ${r.name}`); } });
    } else { const s = sch.find((x) => x.id === d.id);
      openEntry({ type: s.kind, lockType: true, unit: s.unit, category: s.category, asset: s.asset, amount: d.amount, partyText: partyName(s.party), memo: `${s.name} (${fmtDate(d.date)})`, onSaved: async (e) => { (s.done = s.done || {})[d.key] = e.id; await save('schedules', `Mark done: ${s.name}`); } });
    }
  }));
  const fields = [{ name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Zesora instalments' }, { name: 'unit', label: 'Business', type: 'select', options: units().map((u) => [u.id, u.name]), required: true },
    { name: 'kind', label: 'Kind', type: 'select', options: [['income', 'Income'], ['expense', 'Expense'], ['instalment', 'Instalment payment']], required: true },
    { name: 'category', label: 'Income / expense type', type: 'select', options: accounts().filter((a) => ['income', 'expense'].includes(a.type)).map((a) => [a.id, a.name]), hint: 'not needed for instalments' },
    { name: 'asset', label: 'Asset', type: 'select', options: S.db.assets.assets.map((a) => [a.id, a.name]), hint: 'instalments only' }, { name: 'partyText', label: 'Person / party', type: 'text' },
    { name: 'freq', label: 'Repeats', type: 'select', options: [['monthly', 'Monthly'], ['quarterly', 'Every 3 months'], ['yearly', 'Yearly'], ['custom', 'Custom dates (list below)']], required: true },
    { name: 'amount', label: 'Amount each time (PKR)', type: 'money' }, { name: 'start', label: 'First date', type: 'date' }, { name: 'end', label: 'Last date', type: 'date' },
    { name: 'itemsText', label: 'Custom dates', type: 'textarea', full: true, placeholder: 'One per line: 2027-01-15 500000', hint: 'date then amount' }];
  const edit = (s) => modal({ title: s ? 'Edit schedule' : 'Add schedule', wide: true,
    body: `<form>${formHtml(fields, s ? { ...s, partyText: partyName(s.party), itemsText: (s.items || []).map((i) => `${i.date} ${i.amount}`).join('\n') } : { kind: 'income', freq: 'monthly', start: today() })}
      <div class="actions">${s ? '<button type="button" class="btn danger" data-del>Delete</button>' : ''}<button class="btn primary" data-save>Save</button></div></form>`,
    onMount(b, close) {
      $('form', b).onsubmit = (ev) => { ev.preventDefault(); busy($('[data-save]', b), async () => {
        const v = readForm(b, fields), pend = {};
        const items = v.itemsText.split('\n').map((l) => l.trim().match(/^(\d{4}-\d{2}-\d{2})[\s,;]+([\d,.]+)/)).filter(Boolean).map((m) => ({ date: m[1], amount: Number(m[2].replace(/,/g, '')) }));
        if (v.freq === 'custom' && !items.length) throw new Error('Add at least one line like: 2027-01-15 500000');
        if (v.freq !== 'custom' && (!v.start || !v.amount)) throw new Error('Enter the first date and the amount.');
        if (v.kind === 'instalment' && !v.asset) throw new Error('Choose the asset the instalments are for.');
        if (v.kind !== 'instalment' && !v.category) throw new Error('Choose the income or expense type.');
        const rec = { ...v, items, party: partyId(v.partyText, pend) }; delete rec.itemsText; delete rec.partyText;
        if (pend.parties) await save('parties', 'Add party');
        if (s) Object.assign(sch.find((x) => x.id === s.id), rec); else sch.push({ id: uid(), done: {}, ...rec });
        await save('schedules', `${s ? 'Update' : 'Add'} schedule ${v.name}`); toast('Saved'); close();
      }); };
      const del = $('[data-del]', b); if (del) del.onclick = async () => { if (await confirmBox('Delete this schedule? Entries already recorded stay in the ledger.')) busy(del, async () => { S.db.schedules.schedules = sch.filter((x) => x.id !== s.id); await save('schedules', 'Delete schedule'); close(); }); };
    } });
  const add = $('#schAdd', main); if (add) add.onclick = () => edit(null);
  if (w) $$('[data-sch]', main).forEach((tr) => (tr.onclick = () => edit(sch.find((x) => x.id === tr.dataset.sch))));
}

// ---------- Approvals ----------
export function renderApprovals(main) {
  const all = allSubmissions(), pending = all.filter((s) => s.status === 'pending'), done = all.filter((s) => s.status !== 'pending').slice(0, 40);
  const cashOpts = cashAccounts().map((a) => `<option value="${esc(a.id)}"${a.id === (S.db.meta.staffAccount || 'cash') ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
  main.innerHTML = `<div class="page-h"><div><h1>Approvals</h1><p class="muted">Entries sent in by managers and employees. Nothing reaches the books until an owner approves it.</p></div></div>
    <div class="section">${pending.length ? pending.map((s) => `<div class="card sub-card" data-s="${esc(s.id)}">
      <div class="sub-top"><div><b>${s.kind === 'income' ? 'Income' : 'Expense'} · ${money(s.amount)}</b><div class="small muted">${fmtDate(s.date)} · ${esc(unitName(s.unit))} · ${esc(accName(s.category))} · sent by ${esc(s.by)}</div></div>${badge('Waiting', 'warn')}</div>
      <p>${esc(s.memo || '')}${s.partyName ? ` <span class="muted">(${esc(s.partyName)})</span>` : ''}</p><div class="att"></div>
      <div class="sub-actions">${s.attach ? '<button class="btn sm" data-view>View receipt</button>' : ''}<label class="inline">${s.kind === 'income' ? 'Received in' : 'Paid from'} <select data-acc>${cashOpts}</select></label>
        <button class="btn sm danger" data-no>Reject</button><button class="btn sm primary" data-yes>Approve</button></div></div>`).join('') : '<div class="card"><div class="empty">Nothing waiting for approval.</div></div>'}</div>
    <div class="card section"><div class="card-h"><h3>Recently decided</h3></div>${table([{ h: 'Date', v: (s) => fmtDate(s.date) }, { h: 'Entry', v: (s) => `${esc(s.memo || '')}<div class="small muted">${esc(unitName(s.unit))} · ${esc(s.by)}</div>` }, { h: 'Amount', num: true, v: (s) => money(s.amount) },
      { h: 'Decision', v: (s) => `${badge(s.status === 'approved' ? 'Approved' : 'Rejected', s.status === 'approved' ? 'good' : 'bad')} <span class="small muted">${esc(s.decidedBy || '')}${s.reason ? ' · ' + esc(s.reason) : ''}</span>` }], done, { empty: 'No decisions yet.' })}</div>`;
  $$('[data-s]', main).forEach((card) => {
    const s = pending.find((x) => x.id === card.dataset.s);
    $('[data-yes]', card).onclick = (ev) => busy(ev.currentTarget, async () => { await decide(s, true, { account: $('[data-acc]', card).value }); toast('Approved and added to the ledger'); });
    $('[data-no]', card).onclick = () => modal({ title: 'Reject this entry', body: `<form>${formHtml([{ name: 'reason', label: 'Reason (shown to the sender)', type: 'text', required: true, full: true }])}<div class="actions"><button class="btn danger" data-save>Reject</button></div></form>`,
      onMount(b, close) { $('form', b).onsubmit = (ev) => { ev.preventDefault(); busy($('[data-save]', b), async () => { await decide(s, false, { reason: readForm(b, [{ name: 'reason' }]).reason }); toast('Rejected'); close(); }); }; } });
    const v = $('[data-view]', card); if (v) v.onclick = async () => { v.disabled = true; const src = await readAttachment(s.attach, true); $('.att', card).innerHTML = src ? `<img class="receipt" src="${src}" alt="Receipt photo">` : '<p class="small muted">Could not load the photo.</p>'; };
  });
}

// ---------- Settings ----------
let tab = 'businesses';
const TABS = [['businesses', 'Businesses'], ['accounts', 'Accounts'], ['staff', 'Staff access'], ['books', 'Books'], ['data', 'Import / Export']];
export function renderSettings(main, hooks) {
  main.innerHTML = `<div class="page-h"><div><h1>Settings</h1><p class="muted">Businesses, accounts, who can see what, and your data.</p></div></div>
    <div class="tabs">${TABS.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="setBody"></div>`;
  $$('[data-tab]', main).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderSettings(main, hooks); }));
  ({ businesses: setUnits, accounts: setAccounts, staff: setStaff, books: setBooks, data: setData })[tab]($('#setBody', main), hooks);
}

function setUnits(host) {
  const w = canWrite(), list = S.db.units.units;
  const fields = [{ name: 'name', label: 'Name', type: 'text', required: true }, { name: 'kind', label: 'Type of business', type: 'select', required: true, options: [['livestock', 'Livestock farm'], ['crops', 'Crops (own farming)'], ['batai', 'Land on Batai / Theka'], ['exports', 'Exports / trading'], ['flats', 'Rental flats or shops'], ['tower', 'Yearly land rent (tower)'], ['hostel', 'Hostel (from hostel app)'], ['construction', 'Construction project'], ['landtrade', 'Land trading'], ['buildsell', 'Build & sell'], ['stocks', 'Stocks'], ['land', 'Land held'], ['instalment', 'Property on instalments'], ['other', 'Other']] },
    { name: 'place', label: 'Place / short note', type: 'text' }, { name: 'hostelId', label: 'Linked hostel (hostel app)', type: 'select', options: (S.hostelList || []).map((h) => [h.id, h.name]), hint: 'hostels only' }, { name: 'archived', label: 'Archived (hide from menus)', type: 'check' }];
  host.innerHTML = `<div class="card section"><div class="card-h"><h3>Businesses</h3>${w ? `<button class="btn sm" id="uAdd">${icon('plus')} Add business</button>` : ''}</div>${table(
    [{ h: 'Name', v: (u) => `<b>${esc(u.name)}</b><div class="small muted">${esc(u.place || '')}</div>` }, { h: 'Type', v: (u) => esc(KINDS[u.kind] ? KINDS[u.kind].label : u.kind) }, { h: 'Status', v: (u) => (u.archived ? badge('Archived', 'warn') : badge('Active', 'good')) + (u.hostelId ? ' ' + badge('Hostel app', 'info') : '') }],
    list, { rowAttr: (u) => `data-u="${esc(u.id)}" class="click"` })}${S.hostelError ? `<p class="small neg note">Hostel app data could not be read: ${esc(S.hostelError)}</p>` : ''}</div>`;
  const edit = (u) => modal({ title: u ? 'Edit business' : 'Add business', body: `<form>${formHtml(fields, u || { kind: 'other' })}<div class="actions"><button class="btn primary" data-save>Save</button></div></form>`,
    onMount(b, close) { $('form', b).onsubmit = (ev) => { ev.preventDefault(); busy($('[data-save]', b), async () => {
      const v = readForm(b, fields); if (!v.hostelId) delete v.hostelId;
      if (u) { const t = list.find((x) => x.id === u.id); Object.assign(t, v); if (!v.hostelId) delete t.hostelId; } else { let id = slug(v.name); while (list.some((x) => x.id === id)) id += '-2'; list.push({ id, ...v }); }
      await save('units', `${u ? 'Update' : 'Add'} business ${v.name}`); await saveInboxConfig(S.inbox.config.assign).catch(() => {}); toast(v.hostelId ? 'Saved. Reload to bring in the hostel data.' : 'Saved'); close();
    }); }; } });
  const add = $('#uAdd', host); if (add) add.onclick = () => edit(null);
  if (w) $$('[data-u]', host).forEach((tr) => (tr.onclick = () => edit(list.find((x) => x.id === tr.dataset.u))));
}

function setAccounts(host) {
  const w = canWrite(), list = accounts(), TYPES = { asset: 'Asset', liability: 'Liability', equity: 'Equity', income: 'Income type', expense: 'Expense type' };
  const fields = [{ name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. HBL current account' }, { name: 'kind', label: 'What is it', type: 'select', required: true, options: [['bank', 'Bank account'], ['cash', 'Cash box / wallet'], ['income', 'Income type'], ['expense', 'Expense type'], ['asset', 'Other asset'], ['liability', 'Other liability']] }, { name: 'archived', label: 'Archived (hide from forms)', type: 'check' }];
  host.innerHTML = `<div class="card section"><div class="card-h"><h3>Chart of accounts</h3>${w ? `<button class="btn sm" id="aAdd">${icon('plus')} Add account</button>` : ''}</div>${table(
    [{ h: 'Account', v: (a) => `<b>${esc(a.name)}</b>` }, { h: 'Type', v: (a) => esc(a.cashlike ? (a.group === 'bank' ? 'Bank account' : 'Cash') : TYPES[a.type]) }, { h: '', v: (a) => (a.archived ? badge('Archived', 'warn') : a.system ? '<span class="small muted">Built in</span>' : '') }],
    list, { rowAttr: (a) => `data-a="${esc(a.id)}" class="click"` })}</div>`;
  const edit = (a) => modal({ title: a ? 'Edit account' : 'Add account', body: `<form>${formHtml(a ? fields.filter((f) => f.name !== 'kind') : fields, a || { kind: 'bank' })}${a && a.system ? '<p class="small muted">Built-in accounts can be renamed or archived but not deleted.</p>' : ''}<div class="actions"><button class="btn primary" data-save>Save</button></div></form>`,
    onMount(b, close) { $('form', b).onsubmit = (ev) => { ev.preventDefault(); busy($('[data-save]', b), async () => {
      const v = readForm(b, fields);
      if (a) Object.assign(list.find((x) => x.id === a.id), { name: v.name, archived: v.archived });
      else { let id = slug(v.name); while (list.some((x) => x.id === id)) id += '-2';
        const shape = { bank: { type: 'asset', group: 'bank', cashlike: true }, cash: { type: 'asset', group: 'cash', cashlike: true }, income: { type: 'income' }, expense: { type: 'expense' }, asset: { type: 'asset', group: 'fixed' }, liability: { type: 'liability' } }[v.kind];
        list.push({ id, name: v.name, ...shape }); }
      await save('accounts', `${a ? 'Update' : 'Add'} account ${v.name}`); await saveInboxConfig(S.inbox.config.assign).catch(() => {}); toast('Saved'); close();
    }); }; } });
  const add = $('#aAdd', host); if (add) add.onclick = () => edit(null);
  if (w) $$('[data-a]', host).forEach((tr) => (tr.onclick = () => edit(list.find((x) => x.id === tr.dataset.a))));
}

function setStaff(host) {
  const staff = (S.userList || []).filter((u) => u.role === 'staff'), assign = S.inbox.config.assign || {};
  host.innerHTML = `<div class="card section"><div class="card-h"><h3>Staff access</h3></div>
    <p class="muted" style="margin-top:0">Managers and employees can only add entries for the businesses ticked here, and see the last 90 days of those entries. They never see net worth, bank balances, other businesses or the map. Their entries wait for an owner's approval.</p>
    ${staff.length ? `<div class="tablewrap"><table><thead><tr><th>Business</th>${staff.map((u) => `<th class="num">${esc(u.name || u.username)}</th>`).join('')}</tr></thead><tbody>${units().map((u) => `<tr><td>${esc(u.name)}</td>${staff.map((s) => `<td class="num"><input type="checkbox" data-as="${esc(s.username)}" value="${esc(u.id)}"${(assign[s.username] || []).includes(u.id) ? ' checked' : ''} aria-label="${esc(s.username)} can access ${esc(u.name)}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <label class="inline" style="margin-top:1rem">Approved staff entries are paid from / received in <select id="stAcc">${cashAccounts().map((a) => `<option value="${esc(a.id)}"${a.id === (S.db.meta.staffAccount || 'cash') ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select> <span class="small muted">(can be changed on each approval)</span></label>
      <div class="actions"><button class="btn primary" id="stSave">Save access</button></div>` : '<div class="empty">No staff logins exist yet. They are created by tools/create_logins.py.</div>'}</div>`;
  const b = $('#stSave', host); if (b) b.onclick = () => busy(b, async () => {
    const next = {}; staff.forEach((s) => (next[s.username] = $$(`[data-as="${s.username}"]:checked`, host).map((c) => c.value)));
    S.db.meta.staffAccount = $('#stAcc', host).value; await save('meta', 'Update staff default account'); await saveInboxConfig(next); toast('Staff access saved');
  });
}

function setBooks(host, hooks) {
  const m = S.db.meta, opening = entries().filter((e) => e.type === 'opening'), hv = m.herdValue || {};
  const bsAccounts = accounts().filter((a) => ['asset', 'liability'].includes(a.type) && !a.archived);
  host.innerHTML = `<div class="grid two section">
    <div class="card"><div class="card-h"><h3>Lock a period</h3></div><p class="muted" style="margin-top:0">Entries dated on or before this date cannot be added, changed or deleted. Fix mistakes with a reversing entry. Leave empty to unlock.</p>
      <form id="lockForm" class="inline-form"><input type="date" name="lock" value="${esc(m.lockThrough || '')}" aria-label="Lock through date"><button class="btn primary">Save lock</button></form>
      <p class="small muted">${m.lockThrough ? `Locked through ${fmtDate(m.lockThrough)}.` : 'Nothing is locked.'}</p></div>
    <div class="card"><div class="card-h"><h3>Value of the herd</h3></div><p class="muted" style="margin-top:0">An estimated value per head, used only for net worth.</p>
      <form id="herdForm">${formHtml(Object.entries(HERD_GROUPS).map(([k, l]) => ({ name: k, label: `${l} (PKR each)`, type: 'money' })), hv)}<div class="actions"><button class="btn primary">Save values</button></div></form></div></div>
    <div class="card section"><div class="card-h"><h3>Opening balances</h3></div><p class="muted" style="margin-top:0">What KHAS already had on the day you start using this app: cash, bank balances, money owed. For land, flats and other assets, add them on their business page with "Already paid before KHAS".</p>
      <form id="openForm">${formHtml([{ name: 'account', label: 'Account', type: 'select', options: bsAccounts.map((a) => [a.id, a.name]), required: true }, { name: 'amount', label: 'Balance (PKR)', type: 'money', required: true }, { name: 'date', label: 'As of', type: 'date', required: true }, { name: 'partyText', label: 'Person (for money owed)', type: 'text' }], { date: today(), account: 'cash' })}
        <div class="actions"><button class="btn primary">Add opening balance</button></div></form>
      ${table([{ h: 'Date', v: (e) => fmtDate(e.date) }, { h: 'Details', v: (e) => esc(e.memo || '') }, { h: 'Amount', num: true, v: (e) => money(e.amount) }], opening, { empty: 'No opening balances yet.', rowAttr: (e) => `data-e="${esc(e.id)}" class="click"` })}</div>
    <div class="card section"><div class="card-h"><h3>Demo data</h3></div><p class="muted" style="margin-top:0">See the whole app working with made-up numbers. Nothing is saved and your real data is not touched. Sign in again to come back.</p>
      <button class="btn" id="demoBtn">Preview with demo data</button></div>`;
  $('#lockForm', host).onsubmit = (ev) => { ev.preventDefault(); busy($('button', ev.target), async () => { m.lockThrough = ev.target.lock.value; await save('meta', m.lockThrough ? `Lock books through ${m.lockThrough}` : 'Unlock books'); toast('Saved'); }); };
  $('#herdForm', host).onsubmit = (ev) => { ev.preventDefault(); busy($('button', ev.target), async () => { m.herdValue = readForm(ev.target, Object.keys(HERD_GROUPS).map((k) => ({ name: k, type: 'money' }))); await save('meta', 'Update herd value'); toast('Saved'); }); };
  $('#openForm', host).onsubmit = (ev) => { ev.preventDefault(); busy($('button', ev.target), async () => {
    const v = readForm(ev.target, [{ name: 'account' }, { name: 'amount', type: 'money' }, { name: 'date' }, { name: 'partyText' }]), a = accounts().find((x) => x.id === v.account), side = a.type === 'liability' ? 'cr' : 'dr', pend = {};
    const party = partyId(v.partyText, pend); if (pend.parties) await save('parties', 'Add party');
    await addEntry({ date: v.date, type: 'opening', amount: v.amount, account: v.account, side, party, memo: `Opening balance: ${a.name}`, lines: side === 'dr' ? [{ acc: v.account, dr: v.amount, cr: 0 }, { acc: 'opening-equity', dr: 0, cr: v.amount }] : [{ acc: 'opening-equity', dr: v.amount, cr: 0 }, { acc: v.account, dr: 0, cr: v.amount }] });
    toast('Opening balance added');
  }); };
  $$('[data-e]', host).forEach((tr) => (tr.onclick = () => showEntry(tr.dataset.e)));
  $('#demoBtn', host).onclick = () => hooks.startDemo();
}

// ---------- Import / Export ----------
const IMPORTS = { entries: 'Income and expense entries', herd: 'Herd events (Dumba)', flats: 'Flats and tenants', trades: 'Stock trades' };
function parseImport(kind, rows) {
  const P = Excel.pick, find = (list, name) => list.find((x) => x.name.toLowerCase() === String(name).trim().toLowerCase());
  return rows.map((r) => {
    const o = { err: '' }, bad = (m) => { if (!o.err) o.err = m; };
    if (kind === 'entries') {
      o.date = Excel.toDate(P(r, 'date')); o.type = String(P(r, 'type')).toLowerCase().startsWith('inc') ? 'income' : 'expense'; o.amount = Excel.toNum(P(r, 'amount'));
      const u = find(units(true), P(r, 'business')), c = find(accounts(), P(r, 'category')), a = P(r, 'account') ? find(accounts(), P(r, 'account')) : accounts().find((x) => x.id === 'cash');
      o.unitName = P(r, 'business'); o.catName = P(r, 'category'); o.person = String(P(r, 'person') || ''); o.memo = String(P(r, 'notes', 'note', 'memo') || '');
      if (!o.date) bad('Date not understood'); if (!(o.amount > 0)) bad('Amount missing'); if (!u) bad('Business not found'); if (!c || c.type !== o.type) bad(`${o.type === 'income' ? 'Income' : 'Expense'} category not found`); if (!a || !['asset', 'liability'].includes(a.type)) bad('Account not found');
      o.unit = u && u.id; o.category = c && c.id; o.account = a && a.id; o.show = [o.date, o.type, o.unitName, o.catName, o.amount, o.memo];
    } else if (kind === 'herd') {
      o.date = Excel.toDate(P(r, 'date')); o.kind = String(P(r, 'event')).toLowerCase().trim(); o.group = String(P(r, 'group')).toLowerCase().trim(); o.count = Excel.toNum(P(r, 'count')); o.weightKg = Excel.toNum(P(r, 'weight')) || ''; o.amount = Excel.toNum(P(r, 'amount')) || ''; o.note = String(P(r, 'notes', 'note') || '');
      if (!o.date) bad('Date not understood'); if (!['birth', 'death', 'purchase', 'sale'].includes(o.kind)) bad('Event must be Birth, Death, Purchase or Sale'); if (!HERD_GROUPS[o.group]) bad('Group must be Ewe, Ram or Lamb'); if (!(o.count > 0)) bad('Count missing');
      o.show = [o.date, o.kind, o.group, o.count, o.amount, o.note];
    } else if (kind === 'flats') {
      o.name = String(P(r, 'flat') || ''); o.tenant = String(P(r, 'tenant') || ''); o.rent = Excel.toNum(P(r, 'monthlyrent', 'rent')); o.start = Excel.toDate(P(r, 'start')); o.end = Excel.toDate(P(r, 'leaseend', 'end')) || ''; o.dueDay = Excel.toNum(P(r, 'dueday')) || 1; o.deposit = Excel.toNum(P(r, 'deposit')) || '';
      if (!o.name) bad('Flat name missing'); if (!(o.rent > 0)) bad('Rent missing'); if (!o.start) bad('Start date not understood');
      o.show = [o.name, o.tenant, o.rent, o.start, o.end, o.dueDay];
    } else {
      o.date = Excel.toDate(P(r, 'date')); o.side = String(P(r, 'side')).toLowerCase().startsWith('s') ? 'sell' : 'buy'; o.symbol = String(P(r, 'symbol')).toUpperCase().replace(/[^A-Z0-9.]/g, ''); o.qty = Excel.toNum(P(r, 'shares', 'qty')); o.price = Excel.toNum(P(r, 'price')); o.fees = Excel.toNum(P(r, 'fees')) || 0;
      if (!o.date) bad('Date not understood'); if (!o.symbol) bad('Symbol missing'); if (!(o.qty > 0)) bad('Shares missing'); if (!(o.price > 0)) bad('Price missing');
      o.show = [o.date, o.side, o.symbol, o.qty, o.price, o.fees];
    }
    return o;
  });
}
async function commitImport(kind, rows) {
  const pend = {}, firstUnit = (k) => (units().find((u) => u.kind === k) || {}).id;
  if (kind === 'entries') {
    const list = rows.map((o) => ({ date: o.date, type: o.type, unit: o.unit, amount: o.amount, category: o.category, account: o.account, party: partyId(o.person, pend), memo: o.memo, imported: true,
      lines: o.type === 'income' ? [{ acc: o.account, dr: Math.round(o.amount), cr: 0 }, { acc: o.category, dr: 0, cr: Math.round(o.amount) }] : [{ acc: o.category, dr: Math.round(o.amount), cr: 0 }, { acc: o.account, dr: 0, cr: Math.round(o.amount) }] }));
    if (pend.parties) await save('parties', 'Add people from import');
    await addEntries(list, `Import ${list.length} entries from Excel`);
  } else if (kind === 'herd') {
    const unitId = firstUnit('livestock'), es = [];
    rows.forEach((o) => { const ev = { id: uid(), date: o.date, kind: o.kind, group: o.group, count: o.count, weightKg: o.weightKg, amount: o.amount, note: o.note };
      if ((o.kind === 'sale' || o.kind === 'purchase') && o.amount) { const sale = o.kind === 'sale', cat = sale ? 'inc-livestock' : 'exp-livestock', a = Math.round(o.amount); ev.entryId = uid();
        es.push({ id: ev.entryId, date: o.date, type: sale ? 'income' : 'expense', unit: unitId, amount: a, category: cat, account: 'cash', memo: `${sale ? 'Sold' : 'Bought'} ${o.count} ${HERD_GROUPS[o.group].toLowerCase()}`, imported: true, lines: sale ? [{ acc: 'cash', dr: a, cr: 0 }, { acc: cat, dr: 0, cr: a }] : [{ acc: cat, dr: a, cr: 0 }, { acc: 'cash', dr: 0, cr: a }] }); }
      S.db.livestock.events.push(ev); });
    if (es.length) await addEntries(es, `Import ${es.length} herd sales and purchases`);
    await save('livestock', `Import ${rows.length} herd events`);
  } else if (kind === 'flats') {
    const unitId = firstUnit('flats');
    rows.forEach((o) => S.db.rentals.rentals.push({ id: uid(), unit: unitId, name: o.name, party: partyId(o.tenant, pend), rent: o.rent, freq: 'monthly', start: o.start, end: o.end, dueDay: o.dueDay, deposit: o.deposit, status: 'let', paid: {} }));
    if (pend.parties) await save('parties', 'Add tenants from import');
    await save('rentals', `Import ${rows.length} flats`);
  } else {
    const unitId = firstUnit('stocks'), st = S.db.stocks, es = [];
    [...rows].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((o) => {
      const gross = Math.round(o.qty * o.price), fees = Math.round(o.fees), tag = 'stk:' + o.symbol, id = uid(); let e;
      if (o.side === 'buy') e = { type: 'asset_purchase', amount: gross + fees, lines: [{ acc: 'stocks', dr: gross + fees, cr: 0, asset: tag }, { acc: 'cash', dr: 0, cr: gross + fees }] };
      else { const c = sellCost(st, o.symbol, o.qty), net = gross - fees, gain = net - c; e = { type: 'asset_sale', amount: net, cost: c, lines: [{ acc: 'cash', dr: net, cr: 0 }, { acc: 'stocks', dr: 0, cr: c, asset: tag }, ...(gain > 0 ? [{ acc: 'inc-gain', dr: 0, cr: gain }] : gain < 0 ? [{ acc: 'exp-loss', dr: -gain, cr: 0 }] : [])] }; }
      es.push({ ...e, id, date: o.date, unit: unitId, account: 'cash', assetAccount: 'stocks', memo: `${o.side === 'buy' ? 'Bought' : 'Sold'} ${o.qty} ${o.symbol} @ ${o.price}`, imported: true });
      st.trades.push({ id: uid(), date: o.date, side: o.side, symbol: o.symbol, qty: o.qty, price: o.price, fees, entryId: id }); st.prices[o.symbol] = { price: o.price, date: o.date };
    });
    await addEntries(es, `Import ${es.length} stock trades`); await save('stocks', `Import ${rows.length} trades`);
  }
}
export async function exportAll() {
  const es = [...entries()].reverse(), db = S.db, obj = (list, keys) => [keys, ...list.map((x) => keys.map((k) => (typeof x[k] === 'object' && x[k] ? JSON.stringify(x[k]) : x[k] ?? '')))];
  await Excel.download([
    { name: 'Entries', widths: [12, 20, 22, 36, 20, 14, 26, 26, 12], rows: [['Date', 'Type', 'Business', 'Details', 'Person', 'Amount', 'Debit', 'Credit', 'Entered by'], ...es.map((e) => [e.date, ENTRY_TYPES[e.type] || e.type, unitName(e.unit), e.memo || '', partyName(e.party), e.amount, e.lines.filter((l) => l.dr).map((l) => accName(l.acc)).join(' + '), e.lines.filter((l) => l.cr).map((l) => accName(l.acc)).join(' + '), e.by || ''])] },
    { name: 'Lines', widths: [14, 12, 30, 14, 14], rows: [['Entry', 'Date', 'Account', 'Debit', 'Credit'], ...es.flatMap((e) => e.lines.map((l) => [e.id, e.date, accName(l.acc), l.dr, l.cr]))] },
    { name: 'Accounts', rows: obj(accounts(), ['id', 'name', 'type', 'group']) }, { name: 'Businesses', rows: obj(db.units.units, ['id', 'name', 'kind', 'place', 'archived']) }, { name: 'People', rows: obj(db.parties.parties, ['id', 'name', 'kind', 'phone', 'cnic', 'notes']) },
    { name: 'Assets', rows: obj(db.assets.assets, ['id', 'unit', 'name', 'account', 'location', 'size', 'sizeUnit', 'acquired', 'totalPrice', 'status', 'valuations', 'notes']) },
    { name: 'Rentals', rows: obj(db.rentals.rentals, ['id', 'unit', 'name', 'party', 'rent', 'freq', 'start', 'end', 'dueDay', 'increasePct', 'deposit', 'status', 'paid']) },
    { name: 'Herd events', rows: obj(db.livestock.events, ['date', 'kind', 'group', 'count', 'weightKg', 'amount', 'note']) }, { name: 'Crops', rows: obj(db.crops.seasons, ['unit', 'crop', 'season', 'year', 'field', 'area', 'areaUnit', 'status', 'yieldQty', 'yieldUnit', 'partner', 'kind', 'pct', 'lease', 'produce', 'shared']) },
    { name: 'Export orders', rows: obj(db.exports.orders, ['name', 'date', 'partyText', 'country', 'items', 'qty', 'cur', 'famount', 'fx', 'status', 'shipDate']) }, { name: 'Stock trades', rows: obj(db.stocks.trades, ['date', 'side', 'symbol', 'qty', 'price', 'fees']) },
    { name: 'Projects', rows: obj(db.projects.projects, ['unit', 'name', 'location', 'budget', 'pct', 'stage', 'status', 'startDate', 'targetDate', 'unitsTotal', 'unitsSold']) }, { name: 'Schedules', rows: obj(db.schedules.schedules, ['name', 'unit', 'kind', 'category', 'asset', 'amount', 'freq', 'start', 'end', 'items', 'done']) },
  ], `khas-full-backup-${today()}.xlsx`);
}
function setData(host) {
  host.innerHTML = `<div class="card section"><div class="card-h"><h3>Full backup</h3></div><p class="muted" style="margin-top:0">Download everything as one Excel workbook: every entry, account, person, asset and record. Good for backups and for an accountant.</p><button class="btn primary" id="expAll">${icon('data')} Download backup</button></div>
    <div class="grid two section">${Object.entries(IMPORTS).map(([k, l]) => `<div class="card"><div class="card-h"><h3>Import: ${l}</h3></div><div class="row-btns"><button class="btn sm" data-tpl="${k}">Download template</button>${canWrite() ? `<label class="btn sm">Choose file…<input type="file" accept=".xlsx,.xls,.csv" data-imp="${k}" hidden></label>` : ''}</div><div id="prev-${k}"></div></div>`).join('')}</div>`;
  $('#expAll', host).onclick = (ev) => busy(ev.currentTarget, exportAll);
  $$('[data-tpl]', host).forEach((b) => (b.onclick = () => Excel.template(b.dataset.tpl).catch((e) => toast(e.message, true))));
  $$('[data-imp]', host).forEach((inp) => (inp.onchange = async () => {
    const kind = inp.dataset.imp, box = $(`#prev-${kind}`, host), file = inp.files[0]; if (!file) return;
    try {
      const rows = parseImport(kind, await Excel.readRows(file)), ok = rows.filter((r) => !r.err), bad = rows.filter((r) => r.err);
      box.innerHTML = `<p class="small" style="margin:.8rem 0 .4rem"><b>${ok.length}</b> row${ok.length === 1 ? '' : 's'} ready${bad.length ? `, <b class="neg">${bad.length}</b> with problems (these are skipped)` : ''}.</p>
        <div class="tablewrap preview"><table><tbody>${rows.slice(0, 30).map((r) => `<tr class="${r.err ? 'bad-row' : ''}">${r.show.map((c) => `<td>${esc(c ?? '')}</td>`).join('')}<td>${r.err ? badge(r.err, 'bad') : badge('OK', 'good')}</td></tr>`).join('')}</tbody></table></div>
        ${rows.length > 30 ? `<p class="small muted">Showing the first 30 of ${rows.length} rows.</p>` : ''}${ok.length ? `<div class="actions"><button class="btn primary" data-go>Import ${ok.length} row${ok.length === 1 ? '' : 's'}</button></div>` : ''}`;
      const go = $('[data-go]', box); if (go) go.onclick = () => busy(go, async () => { await commitImport(kind, ok); toast(`Imported ${ok.length} rows`); box.innerHTML = `<p class="small pos">Imported ${ok.length} rows.</p>`; });
    } catch (err) { box.innerHTML = `<p class="small neg">${esc(err.message)}</p>`; }
    inp.value = '';
  }));
}

// ---------- Staff screens ----------
let stab = 'add';
export function renderStaff(main) {
  const cfg = S.inbox.config, mine = assignedUnits(), myUnits = cfg.units.filter((u) => mine.includes(u.id)), subs = S.inbox.subs[S.auth.username] || [];
  main.innerHTML = `<div class="page-h"><div><h1>Hello, ${esc(S.auth.name || S.auth.username)}</h1><p class="muted">Add income and expenses for your businesses. An owner approves each one.</p></div></div>
    <div class="tabs">${[['add', 'Add entry'], ['mine', `My entries${subs.filter((s) => s.status === 'pending').length ? ` (${subs.filter((s) => s.status === 'pending').length} waiting)` : ''}`], ['view', 'My businesses']].map(([k, l]) => `<button class="${k === stab ? 'on' : ''}" data-st="${k}">${esc(l)}</button>`).join('')}</div><div id="stBody"></div>`;
  $$('[data-st]', main).forEach((b) => (b.onclick = () => { stab = b.dataset.st; renderStaff(main); }));
  const body = $('#stBody', main);
  if (!myUnits.length) { body.innerHTML = '<div class="card"><div class="empty">No businesses have been assigned to you yet. Ask an owner to give you access.</div></div>'; return; }
  if (stab === 'add') {
    let kind = 'expense';
    const draw = () => {
      const fields = [{ name: 'kind', label: 'Type', type: 'select', options: [['expense', 'Expense (money paid out)'], ['income', 'Income (money received)']], required: true }, { name: 'unit', label: 'Business', type: 'select', options: myUnits.map((u) => [u.id, u.name]), required: true },
        { name: 'category', label: kind === 'income' ? 'Income type' : 'Expense type', type: 'select', options: (cfg.categories[kind] || []).map((c) => [c.id, c.name]), required: true }, { name: 'amount', label: 'Amount (PKR)', type: 'money', required: true, min: 1 },
        { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'partyName', label: 'Person / shop (optional)', type: 'text' }, { name: 'method', label: 'Method', type: 'select', options: ['Cash', 'Bank transfer', 'Cheque', 'Online'].map((m) => [m, m]) }, { name: 'memo', label: 'What was it for?', type: 'text', required: true, full: true }];
      body.innerHTML = `<form class="card" id="subForm">${formHtml(fields, { kind, date: today(), unit: myUnits[0].id, method: 'Cash' })}<label class="full">Receipt photo (optional)<input type="file" name="photo" accept="image/*"></label><div class="actions"><button class="btn primary" id="subSave">Send for approval</button></div></form>`;
      const form = $('#subForm', body);
      form.elements.kind.onchange = (e) => { kind = e.target.value; draw(); };
      form.onsubmit = (ev) => { ev.preventDefault(); busy($('#subSave', form), async () => {
        const v = readForm(form, fields), photo = form.elements.photo.files[0]; if (v.date > today()) throw new Error('The date cannot be in the future.');
        if (photo) v.attach = await saveAttachment(await compressImage(photo));
        await submit(v); toast('Sent for approval'); stab = 'mine'; renderStaff(main);
      }); };
    };
    draw();
  } else if (stab === 'mine') {
    body.innerHTML = `<div class="card">${table([{ h: 'Date', v: (s) => fmtDate(s.date) }, { h: 'Entry', v: (s) => `<b>${esc(s.memo || '')}</b><div class="small muted">${s.kind === 'income' ? 'Income' : 'Expense'} · ${esc((cfg.units.find((u) => u.id === s.unit) || {}).name || s.unit)}</div>` }, { h: 'Amount', num: true, v: (s) => money(s.amount) },
      { h: 'Status', v: (s) => (s.status === 'pending' ? `${badge('Waiting', 'warn')} <button class="btn sm" data-wd="${esc(s.id)}">Withdraw</button>` : s.status === 'approved' ? badge('Approved', 'good') : `${badge('Rejected', 'bad')} <span class="small muted">${esc(s.reason || '')}</span>`) }], subs, { empty: 'You have not sent any entries yet.' })}</div>`;
    $$('[data-wd]', body).forEach((b) => (b.onclick = async () => { if (await confirmBox('Withdraw this entry?', 'Withdraw')) busy(b, async () => { await withdraw(b.dataset.wd); toast('Withdrawn'); }); }));
  } else {
    body.innerHTML = myUnits.map((u) => { const v = S.inbox.views[u.id];
      return `<div class="card section"><div class="card-h"><h3>${esc(u.name)}</h3>${v ? `<span class="small muted">Updated ${fmtDate(v.updated.slice(0, 10))}</span>` : ''}</div>
        ${v ? `<div class="grid kpis">${kpi('Income this month', money(v.month.income))}${kpi('Expenses this month', money(v.month.expense))}</div>${table([{ h: 'Date', v: (e) => fmtDate(e.date) }, { h: 'Details', v: (e) => esc(e.memo) }, { h: 'Amount', num: true, v: (e) => `${e.type === 'income' ? '+' : '−'}${money(e.amount)}` }], v.entries, { empty: 'No entries in the last 90 days.' })}` : '<div class="empty">Nothing to show yet. Approved entries from the last 90 days appear here.</div>'}</div>`; }).join('');
  }
}
