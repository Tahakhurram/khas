// The "Add entry" form (simple fields in, balanced debit/credit lines out) and the entry detail view.
import { S, accounts, units, cashAccounts, accName, unitName, partyName, addEntry, updateEntry, deleteEntry, save, saveAttachment, readAttachment, findEntry, canWrite } from '../store.js';
import { ENTRY_TYPES, buildLines, reverseOf, assetCosts, isLocked } from '../engine.js';
import { entries } from '../store.js';
import { esc, money, today, uid, fmtDate, sum } from '../util.js';
import { $, $$, modal, toast, busy, fieldHtml, confirmBox, table, badge, compressImage } from '../ui.js';

const METHODS = ['Cash', 'Bank transfer', 'Cheque', 'Online', 'Other'];
const NEEDS_PARTY = ['receipt', 'payment', 'deposit_in', 'deposit_out', 'loan_given', 'loan_back', 'loan_taken', 'loan_repaid'];
const NO_UNIT = ['transfer', 'drawing', 'capital', 'loan_given', 'loan_back', 'loan_taken', 'loan_repaid'];
const opt = (list) => list.map((a) => [a.id, a.name]);
const accs = (pred) => opt(accounts().filter((a) => !a.archived && pred(a)));

// Things inside a unit that an entry can be tied to (a crop season, a flat, a project, an export order).
export function linkOptions(unitId) {
  const db = S.db, out = [];
  db.crops.seasons.filter((s) => s.unit === unitId).forEach((s) => out.push([`season:${s.id}`, `${s.crop} ${s.season || ''} ${s.year || ''}${s.field ? ' · ' + s.field : ''}`]));
  db.projects.projects.filter((p) => p.unit === unitId).forEach((p) => out.push([`project:${p.id}`, p.name]));
  db.exports.orders.filter((o) => o.unit === unitId).forEach((o) => out.push([`order:${o.id}`, `Order ${o.name}`]));
  db.rentals.rentals.filter((r) => r.unit === unitId).forEach((r) => out.push([`rental:${r.id}`, r.name]));
  return out;
}

function fieldsFor(v) {
  const t = v.type, cash = opt(cashAccounts()), f = [];
  const assets = S.db.assets.assets.filter((a) => !v.unit || a.unit === v.unit || a.id === v.asset).map((a) => [a.id, a.name]);
  f.push({ name: 'date', label: 'Date', type: 'date', required: true });
  if (t !== 'journal') f.push({ name: 'amount', label: 'Amount (PKR)', type: 'money', required: true, min: 0, placeholder: '0' });
  if (!NO_UNIT.includes(t)) f.push({ name: 'unit', label: 'Business', type: 'select', options: units().map((u) => [u.id, u.name]), required: ['income', 'expense'].includes(t), noBlank: false });
  if (t === 'income') f.push({ name: 'category', label: 'Income type', type: 'select', options: accs((a) => a.type === 'income'), required: true }, { name: 'account', label: 'Received in', type: 'select', options: [...cash, ['receivables', 'Not received yet (receivable)']], required: true, noBlank: true });
  if (t === 'expense') f.push({ name: 'category', label: 'Expense type', type: 'select', options: accs((a) => a.type === 'expense'), required: true }, { name: 'account', label: 'Paid from', type: 'select', options: [...cash, ['payables', 'Not paid yet (payable)']], required: true, noBlank: true });
  if (t === 'transfer') { const bs = accs((a) => ['asset', 'liability'].includes(a.type)); f.push({ name: 'from', label: 'From account', type: 'select', options: bs, required: true }, { name: 'to', label: 'To account', type: 'select', options: bs, required: true }); }
  if (['asset_purchase', 'asset_sale', 'instalment'].includes(t)) {
    f.push({ name: 'asset', label: 'Asset', type: 'select', options: assets, required: true, hint: assets.length ? '' : 'Add the asset on its business page first' });
    if (t === 'asset_sale') f.push({ name: 'cost', label: 'Cost of what is sold', type: 'money', required: true, min: 0, hint: 'profit = amount − cost' });
    f.push({ name: 'account', label: t === 'asset_sale' ? 'Received in' : 'Paid from', type: 'select', options: t === 'asset_sale' ? [...cash, ['receivables', 'Not received yet (receivable)']] : [...cash, ['payables', 'Not paid yet (payable)']], required: true, noBlank: true });
  }
  if ([...NEEDS_PARTY, 'drawing', 'capital'].includes(t)) f.push({ name: 'account', label: 'Cash / bank account', type: 'select', options: cash, required: true, noBlank: true });
  const links = v.unit ? linkOptions(v.unit) : [];
  if (links.length && !NO_UNIT.includes(t)) f.push({ name: 'link', label: 'Related to', type: 'select', options: links });
  f.push({ name: 'partyText', label: NEEDS_PARTY.includes(t) ? 'Person / party' : 'Person / party (optional)', type: 'text', list: 'partyList', required: NEEDS_PARTY.includes(t), placeholder: 'Type a name' });
  f.push({ name: 'method', label: 'Method', type: 'select', options: METHODS.map((m) => [m, m]) });
  f.push({ name: 'memo', label: 'Notes', type: 'text', full: true, placeholder: 'What was this for?' });
  return f;
}

const journalRow = (l = {}) => `<div class="jrow"><select data-j="acc"><option value="">Account…</option>${accounts().filter((a) => !a.archived).map((a) => `<option value="${a.id}"${a.id === l.acc ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
  <input data-j="dr" type="number" inputmode="decimal" min="0" placeholder="Debit" value="${l.dr || ''}"><input data-j="cr" type="number" inputmode="decimal" min="0" placeholder="Credit" value="${l.cr || ''}"></div>`;

export function openEntry(init = {}) {
  if (!canWrite()) return toast('You are offline. Entries cannot be added right now.', true);
  const editing = init.edit || null;
  let v = editing ? { ...editing, partyText: partyName(editing.party) || editing.partyText || '' } : { type: 'expense', date: today(), method: 'Cash', account: 'cash', ...init };
  let attach = null;
  const typeOpts = Object.entries(ENTRY_TYPES).filter(([k]) => k !== 'opening' || v.type === 'opening');

  modal({
    title: editing ? 'Edit entry' : 'Add entry', wide: true,
    body: '<form id="entryForm" autocomplete="off"></form>',
    onMount(body, close) {
      const form = $('#entryForm', body);
      const draw = () => {
        const fields = fieldsFor(v);
        form.innerHTML = `
          <label class="full">Type<select name="type"${init.lockType ? ' disabled' : ''}>${typeOpts.map(([k, l]) => `<option value="${k}"${k === v.type ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <div class="form-grid">${fields.map((f) => fieldHtml(f, v[f.name])).join('')}</div>
          ${v.type === 'journal' ? `<div class="journal"><div class="jhead small muted"><span>Account</span><span>Debit</span><span>Credit</span></div><div id="jrows">${(v.lines && v.lines.length ? v.lines : [{}, {}]).map(journalRow).join('')}</div>
            <button type="button" class="btn sm" id="jadd">+ Add line</button> <span class="small muted" id="jsum"></span></div>` : ''}
          <details class="fx"${v.famount ? ' open' : ''}><summary>Foreign currency (optional)</summary><div class="form-grid">
            ${fieldHtml({ name: 'cur', label: 'Currency', type: 'text', placeholder: 'USD' }, v.cur)}${fieldHtml({ name: 'famount', label: 'Foreign amount', type: 'number', min: 0 }, v.famount)}${fieldHtml({ name: 'fx', label: 'Rate (PKR per 1)', type: 'number', min: 0 }, v.fx)}</div></details>
          <label class="full">Receipt photo (optional)<input type="file" name="photo" accept="image/*"></label>
          ${v.attach ? '<p class="small muted">A receipt photo is already attached. Choosing a new one replaces it.</p>' : ''}
          <datalist id="partyList">${S.db.parties.parties.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>
          <div class="actions"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary" id="entrySave">${editing ? 'Save changes' : 'Save entry'}</button></div>`;
        $('[data-cancel]', form).onclick = close;
        if (v.type === 'journal') {
          $('#jadd', form).onclick = () => $('#jrows', form).insertAdjacentHTML('beforeend', journalRow());
          const upd = () => { const ls = readJournal(); const d = sum(ls, (l) => l.dr), c = sum(ls, (l) => l.cr); $('#jsum', form).textContent = `Debits ${money(d)} · Credits ${money(c)}${d === c ? ' ✓' : ' (must match)'}`; };
          $('#jrows', form).addEventListener('input', upd); upd();
        }
      };
      const readJournal = () => $$('.jrow', form).map((r) => ({ acc: $('[data-j=acc]', r).value, dr: Number($('[data-j=dr]', r).value) || 0, cr: Number($('[data-j=cr]', r).value) || 0 })).filter((l) => l.acc && (l.dr || l.cr));
      const read = () => {
        const fd = new FormData(form); const o = { ...v };
        ['date', 'unit', 'category', 'account', 'from', 'to', 'asset', 'link', 'partyText', 'method', 'memo', 'cur'].forEach((k) => { if (form.elements[k]) o[k] = String(fd.get(k) || '').trim(); });
        ['amount', 'cost', 'famount', 'fx'].forEach((k) => { if (form.elements[k]) o[k] = fd.get(k) === '' ? '' : Number(fd.get(k)); });
        if (!init.lockType) o.type = form.elements.type.value;
        if (o.type === 'journal') o.lines = readJournal();
        return o;
      };
      draw();
      form.addEventListener('change', (e) => {
        const n = e.target.name;
        if (n === 'photo') { attach = e.target.files[0] || null; return; }
        if (!['type', 'unit', 'asset'].includes(n)) return;
        v = read();
        if (n === 'asset' && v.type === 'asset_sale' && v.asset) v.cost = Math.max(0, assetCosts(entries())[v.asset] || 0);
        draw();
      });
      form.addEventListener('input', (e) => {
        if (!['famount', 'fx'].includes(e.target.name)) return;
        const a = Number(form.elements.famount.value), r = Number(form.elements.fx.value);
        if (a && r && form.elements.amount) form.elements.amount.value = Math.round(a * r);
      });
      form.onsubmit = (ev) => {
        ev.preventDefault();
        busy($('#entrySave', form), async () => {
          v = read();
          const asset = v.asset ? S.db.assets.assets.find((a) => a.id === v.asset) : null;
          if (['asset_purchase', 'asset_sale'].includes(v.type)) v.assetAccount = asset ? asset.account : 'other-assets';
          if (v.type === 'transfer' && v.from === v.to) throw new Error('Choose two different accounts.');
          // Party: match by name, or create a new one.
          let partyId = '';
          if (v.partyText) {
            const found = S.db.parties.parties.find((p) => p.name.toLowerCase() === v.partyText.toLowerCase());
            if (found) partyId = found.id; else { partyId = uid(); S.db.parties.parties.push({ id: partyId, name: v.partyText, kind: 'Other' }); await save('parties', `Add party ${v.partyText}`); }
          }
          const lines = buildLines(v.type, v);
          const amount = v.type === 'journal' ? sum(lines, (l) => l.dr) : v.amount;
          const e = { date: v.date, type: v.type, unit: NO_UNIT.includes(v.type) ? '' : v.unit, amount, memo: v.memo, party: partyId, method: v.method, lines,
            category: v.category, account: v.account, from: v.from, to: v.to, asset: v.asset, assetAccount: v.assetAccount, cost: v.cost, link: v.link,
            cur: v.famount ? (v.cur || 'USD').toUpperCase() : '', famount: v.famount, fx: v.famount ? v.fx : '', attach: v.attach, side: v.side };
          if (attach) e.attach = await saveAttachment(await compressImage(attach));
          const saved = editing ? await updateEntry(editing.id, e) : await addEntry(e);
          toast('Saved'); close();
          if (init.onSaved) await init.onSaved(saved);
        });
      };
    },
  });
}

export function showEntry(id) {
  const e = findEntry(id); if (!e) return;
  const locked = isLocked(e.date, S.db.meta.lockThrough);
  modal({
    title: ENTRY_TYPES[e.type] || 'Entry',
    body: `<div class="detail">
      <div class="detail-amt">${money(e.amount)}${e.famount ? ` <span class="small muted">(${esc(e.cur)} ${Number(e.famount).toLocaleString()} @ ${esc(e.fx)})</span>` : ''}</div>
      <p class="muted" style="margin:.2rem 0 1rem">${fmtDate(e.date)}${e.unit ? ' · ' + esc(unitName(e.unit)) : ''}${e.virtual ? ' · ' + badge('Live from Hostel app', 'info') : ''}${locked ? ' · ' + badge('Locked', 'warn') : ''}</p>
      ${e.memo ? `<p>${esc(e.memo)}</p>` : ''}
      <dl class="dl">${[['Person / party', partyName(e.party) || e.partyText], ['Method', e.method], ['Entered by', e.by + (e.approvedBy ? `, approved by ${e.approvedBy}` : '')], ['Edited by', e.editedBy]].filter((r) => r[1]).map(([k, val]) => `<dt>${k}</dt><dd>${esc(val)}</dd>`).join('')}</dl>
      ${table([{ h: 'Account', v: (l) => esc(accName(l.acc)) }, { h: 'Debit', num: true, v: (l) => (l.dr ? money(l.dr) : '') }, { h: 'Credit', num: true, v: (l) => (l.cr ? money(l.cr) : '') }], e.lines)}
      <div id="attachBox">${e.attach || e.inboxAttach ? '<button class="btn sm" id="viewAttach">View receipt photo</button>' : ''}</div>
      ${e.virtual ? '<p class="small muted">This line comes from the hostel app. Change it there and it updates here.</p>' : `<div class="actions">
        ${locked ? '' : '<button class="btn danger" id="delE">Delete</button><button class="btn" id="editE">Edit</button>'}<button class="btn" id="revE">Reverse</button></div>`}</div>`,
    onMount(b, close) {
      const va = $('#viewAttach', b);
      if (va) va.onclick = async () => { va.disabled = true; va.textContent = 'Loading…'; const src = await readAttachment(e.attach || e.inboxAttach, !e.attach); $('#attachBox', b).innerHTML = src ? `<img class="receipt" src="${src}" alt="Receipt photo">` : '<p class="small muted">The photo could not be loaded.</p>'; };
      if (e.virtual) return;
      const del = $('#delE', b), ed = $('#editE', b);
      if (del) del.onclick = async () => { if (!(await confirmBox('Delete this entry? This cannot be undone.'))) return; busy(del, async () => { await deleteEntry(e.id); toast('Deleted'); close(); }); };
      if (ed) ed.onclick = () => { close(); openEntry({ edit: e }); };
      $('#revE', b).onclick = async () => {
        if (!(await confirmBox('Add a reversing entry dated today? It cancels this entry without deleting it.', 'Reverse'))) return;
        busy($('#revE', b), async () => { const r = reverseOf(e, today()); delete r.id; delete r.at; delete r.by; await addEntry(r, `Reverse entry: ${e.memo || e.type}`); toast('Reversed'); close(); });
      };
    },
  });
}
