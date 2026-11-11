// Ledger (all entries), Reports, and People (party ledgers).
import { S, entries, accounts, units, unitName, accName, partyName, cashAccounts, save, canWrite } from '../store.js';
import { ENTRY_TYPES, pnl, balanceSheet, trialBalance, accountLedger, partyBalances, partyStatement, ageing, assetCosts } from '../engine.js';
import { allDues, instalmentProgress } from '../calc.js';
import { esc, money, today, fmtDate, sum, periodRange, uid } from '../util.js';
import { $, $$, table, badge, amt, seg, modal, formHtml, readForm, busy, toast, icon, confirmBox } from '../ui.js';
import { openEntry, showEntry } from './entry.js';
import { Excel } from '../excel.js';
import { netWorth } from './overview.js';

// ---------- Ledger ----------
const lf = { q: '', unit: '', type: '', from: '', to: '', limit: 150 };
export function renderLedger(main, params = {}) {
  if (params.unit !== undefined) { lf.unit = params.unit; lf.limit = 150; }
  const q = lf.q.toLowerCase();
  const list = entries().filter((e) => (!lf.unit || e.unit === lf.unit) && (!lf.type || e.type === lf.type) && (!lf.from || e.date >= lf.from) && (!lf.to || e.date <= lf.to)
    && (!q || `${e.memo || ''} ${partyName(e.party)} ${e.partyText || ''} ${unitName(e.unit)} ${e.amount} ${ENTRY_TYPES[e.type] || ''}`.toLowerCase().includes(q)));
  const sign = (e) => (['income', 'receipt', 'deposit_in', 'loan_back', 'loan_taken', 'capital', 'asset_sale'].includes(e.type) ? 1 : e.type === 'transfer' || e.type === 'journal' || e.type === 'opening' ? 0 : -1);
  main.innerHTML = `<div class="page-h"><div><h1>Ledger</h1><p class="muted">Every entry across all businesses. ${list.length.toLocaleString()} shown.</p></div>
      ${canWrite() ? `<div class="top-actions"><button class="btn primary" id="ledAdd">${icon('plus')} Add entry</button></div>` : ''}</div>
    <div class="card filters"><input id="lq" type="search" placeholder="Search notes, people, amounts…" value="${esc(lf.q)}" aria-label="Search entries">
      <select id="lunit" aria-label="Business"><option value="">All businesses</option>${units(true).map((u) => `<option value="${esc(u.id)}"${u.id === lf.unit ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      <select id="ltype" aria-label="Entry type"><option value="">All types</option>${Object.entries(ENTRY_TYPES).map(([k, l]) => `<option value="${k}"${k === lf.type ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <input id="lfrom" type="date" value="${lf.from}" aria-label="From date"><input id="lto" type="date" value="${lf.to}" aria-label="To date"></div>
    <div class="card section">${table(
      [{ h: 'Date', v: (e) => fmtDate(e.date) }, { h: 'Details', v: (e) => `<b>${esc(e.memo || ENTRY_TYPES[e.type] || '')}</b>${e.virtual ? ' ' + badge('Hostel app', 'info') : ''}<div class="small muted">${esc(ENTRY_TYPES[e.type] || e.type)}${e.unit ? ' · ' + esc(unitName(e.unit)) : ''}${e.party ? ' · ' + esc(partyName(e.party)) : ''}</div>` },
        { h: 'Amount', num: true, v: (e) => { const s = sign(e); return `<span class="${s > 0 ? 'pos' : ''}">${s > 0 ? '+' : s < 0 ? '−' : ''}${money(e.amount)}</span>`; } }],
      list.slice(0, lf.limit), { empty: 'No entries match. Add your first entry to get started.', rowAttr: (e) => `data-e="${esc(e.id)}" class="click"` })}
      ${list.length > lf.limit ? '<div class="center"><button class="btn" id="lmore">Show more</button></div>' : ''}</div>`;
  const re = () => renderLedger(main);
  $('#lq', main).oninput = (e) => { lf.q = e.target.value; clearTimeout(re.t); re.t = setTimeout(() => { re(); const i = $('#lq', main); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  $('#lunit', main).onchange = (e) => { lf.unit = e.target.value; re(); };
  $('#ltype', main).onchange = (e) => { lf.type = e.target.value; re(); };
  $('#lfrom', main).onchange = (e) => { lf.from = e.target.value; re(); };
  $('#lto', main).onchange = (e) => { lf.to = e.target.value; re(); };
  const more = $('#lmore', main); if (more) more.onclick = () => { lf.limit += 300; re(); };
  const add = $('#ledAdd', main); if (add) add.onclick = () => openEntry({ unit: lf.unit || '' });
  $$('[data-e]', main).forEach((tr) => (tr.onclick = () => showEntry(tr.dataset.e)));
}

// ---------- Reports ----------
const REPORTS = [['pnl', 'Profit & loss'], ['balance', 'Balance sheet'], ['cashbook', 'Cash book'], ['daybook', 'Day book'], ['trial', 'Trial balance'], ['ageing', 'Receivables ageing'], ['instalments', 'Instalments & dues']];
const rp = { period: 'year', from: '', to: '', unit: '', acc: 'cash' };
const range = () => (rp.period === 'custom' ? { from: rp.from || '0000-01-01', to: rp.to || '9999-12-31', label: `${rp.from ? fmtDate(rp.from) : 'Start'} to ${rp.to ? fmtDate(rp.to) : 'today'}` } : periodRange(rp.period));

// A report is { heads, rows (raw values), num: [col indexes], bold: [row indexes] }
const rep = (heads, rows, num = [], bold = []) => ({ heads, rows, num, bold });
const repHtml = (r) => (r.rows.length ? `<div class="tablewrap"><table class="report"><thead><tr>${r.heads.map((h, i) => `<th class="${r.num.includes(i) ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${
  r.rows.map((row, ri) => `<tr class="${r.bold.includes(ri) ? 'strong' : ''}">${row.map((c, i) => `<td class="${r.num.includes(i) ? 'num' : ''}">${typeof c === 'number' ? money(c) : esc(c ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nothing to show for this period.</div>');

function build(kind) {
  const es = entries(), acc = accounts(), r = range();
  if (kind === 'pnl') {
    const p = pnl(es, acc, { ...r, unit: rp.unit }), rows = [['INCOME', '']], bold = [0];
    p.income.forEach((x) => rows.push([x.name, x.amount])); bold.push(rows.length); rows.push(['Total income', p.totalIncome]);
    bold.push(rows.length); rows.push(['EXPENSES', '']); p.expense.forEach((x) => rows.push([x.name, x.amount])); bold.push(rows.length); rows.push(['Total expenses', p.totalExpense]);
    bold.push(rows.length); rows.push(['NET PROFIT', p.net]);
    return { title: `Profit & loss · ${rp.unit ? unitName(rp.unit) : 'All businesses'} · ${r.label}`, ...rep(['', 'Amount (PKR)'], rows, [1], bold) };
  }
  if (kind === 'balance') {
    const asOf = r.to > today() ? today() : r.to, b = balanceSheet(es, acc, asOf), rows = [], bold = [];
    const sec = (title, list, total) => { bold.push(rows.length); rows.push([title, '']); list.forEach((x) => rows.push([x.name, x.amount])); bold.push(rows.length); rows.push([`Total ${title.toLowerCase()}`, total]); };
    sec('ASSETS', b.assets, b.totalAssets); sec('LIABILITIES', b.liabilities, b.totalLiabilities); sec('EQUITY', b.equity, b.totalEquity);
    bold.push(rows.length); rows.push(['NET WORTH AT COST (assets − liabilities)', b.netWorth]);
    if (asOf === today()) { const n = netWorth(); rows.push(['Rise in value of assets and shares', n.assetUplift + n.stockUplift], ['Estimated value of herd', n.herdValue]); bold.push(rows.length); rows.push(['NET WORTH AT CURRENT VALUE', n.total]); }
    return { title: `Balance sheet as of ${fmtDate(asOf)}`, ...rep(['', 'Amount (PKR)'], rows, [1], bold) };
  }
  if (kind === 'cashbook') {
    const l = accountLedger(es, rp.acc, r), rows = [['', 'Opening balance', '', '', l.opening]];
    l.rows.forEach((x) => rows.push([fmtDate(x.entry.date), `${x.entry.memo || ENTRY_TYPES[x.entry.type]}${x.entry.unit ? ' · ' + unitName(x.entry.unit) : ''}`, x.dr || '', x.cr || '', x.balance]));
    rows.push(['', 'Closing balance', sum(l.rows, (x) => x.dr), sum(l.rows, (x) => x.cr), l.closing]);
    return { title: `${accName(rp.acc)} · ${r.label}`, ...rep(['Date', 'Details', 'In', 'Out', 'Balance'], rows, [2, 3, 4], [0, rows.length - 1]) };
  }
  if (kind === 'daybook') {
    const list = es.filter((e) => e.date >= r.from && e.date <= r.to).reverse();
    return { title: `Day book · ${r.label}`, ...rep(['Date', 'Type', 'Business', 'Details', 'Person', 'Amount'], list.map((e) => [fmtDate(e.date), ENTRY_TYPES[e.type] || e.type, unitName(e.unit), e.memo || '', partyName(e.party), e.amount]), [5]) };
  }
  if (kind === 'trial') {
    const t = trialBalance(es, acc, { to: r.to }), rows = t.rows.map((x) => [x.name, x.dr || '', x.cr || '']); rows.push(['Total', t.totalDr, t.totalCr]);
    return { title: `Trial balance as of ${r.to > today() ? fmtDate(today()) : fmtDate(r.to)}`, ...rep(['Account', 'Debit', 'Credit'], rows, [1, 2], [rows.length - 1]) };
  }
  if (kind === 'ageing') {
    const a = ageing(es, today()), rows = a.map((x) => [partyName(x.party), x.b0 || '', x.b30 || '', x.b60 || '', x.b90 || '', x.total]);
    if (rows.length) rows.push(['Total', sum(a, (x) => x.b0), sum(a, (x) => x.b30), sum(a, (x) => x.b60), sum(a, (x) => x.b90), sum(a, (x) => x.total)]);
    return { title: `Receivables ageing as of ${fmtDate(today())}`, ...rep(['Person', '0–30 days', '31–60', '61–90', 'Over 90', 'Total owed'], rows, [1, 2, 3, 4, 5], [rows.length - 1]) };
  }
  // instalments & dues
  const costs = assetCosts(es), rows = [];
  S.db.assets.assets.filter((a) => a.totalPrice).forEach((a) => { const p = instalmentProgress(a.totalPrice, costs[a.id] || 0); rows.push([a.name, 'Instalment plan', `${p.pct}% paid`, p.paid, p.remaining]); });
  allDues(S.db, r.from, r.to > '9000' ? today() : r.to).forEach((d) => rows.push([d.title, fmtDate(d.date), d.paid ? 'Paid' : d.date < today() ? 'Overdue' : 'Upcoming', d.paid ? d.amount : '', d.paid ? '' : d.amount]));
  return { title: `Instalments and dues · ${r.label}`, ...rep(['Item', 'Due', 'Status', 'Paid', 'Outstanding'], rows, [3, 4]) };
}

export function renderReports(main, kind = 'pnl', params = {}) {
  if (params.acc) rp.acc = params.acc;
  if (!REPORTS.some((x) => x[0] === kind)) kind = 'pnl';
  const r = build(kind);
  main.innerHTML = `<div class="page-h noprint"><div><h1>Reports</h1><p class="muted">Pick a report and a period. Export to Excel, or print to save as PDF.</p></div>
      <div class="top-actions"><button class="btn" id="repXls">${icon('data')} Excel</button><button class="btn" id="repPrint">Print / PDF</button></div></div>
    <div class="tabs noprint">${REPORTS.map(([k, l]) => `<a href="#/reports/${k}" class="${k === kind ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div class="card filters noprint">${seg('rper', [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['fy', 'Jul–Jun'], ['all', 'All'], ['custom', 'Custom']], rp.period)}
      ${rp.period === 'custom' ? `<input id="rfrom" type="date" value="${rp.from}" aria-label="From"><input id="rto" type="date" value="${rp.to}" aria-label="To">` : ''}
      ${kind === 'pnl' ? `<select id="runit" aria-label="Business"><option value="">All businesses</option>${units(true).map((u) => `<option value="${esc(u.id)}"${u.id === rp.unit ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select>` : ''}
      ${kind === 'cashbook' ? `<select id="racc" aria-label="Account">${accounts().filter((a) => ['asset', 'liability'].includes(a.type)).map((a) => `<option value="${esc(a.id)}"${a.id === rp.acc ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : ''}</div>
    <div class="card section printable"><div class="rep-title"><div class="brand-sm">KHAS</div><h2>${esc(r.title)}</h2><p class="small muted">Prepared ${fmtDate(today())}</p></div>${repHtml(r)}</div>`;
  const re = () => renderReports(main, kind);
  $$('[data-seg=rper] button', main).forEach((b) => (b.onclick = () => { rp.period = b.dataset.v; re(); }));
  [['#rfrom', 'from'], ['#rto', 'to'], ['#runit', 'unit'], ['#racc', 'acc']].forEach(([sel, k]) => { const el = $(sel, main); if (el) el.onchange = () => { rp[k] = el.value; re(); }; });
  $('#repPrint', main).onclick = () => window.print();
  $('#repXls', main).onclick = () => Excel.download([{ name: 'Report', rows: [[r.title], [], r.heads, ...r.rows], widths: r.heads.map((_, i) => (i === 0 || i === 1 ? 34 : 16)) }], `khas-${kind}-${today()}.xlsx`).catch((e) => toast(e.message, true));
}

// ---------- People ----------
const KINDS_P = ['Tenant', 'Buyer', 'Farmer / partner', 'Contractor', 'Supplier', 'Broker', 'Employee', 'Other'];
export function renderParties(main) {
  const bal = partyBalances(entries()), rows = S.db.parties.parties.map((p) => ({ ...p, ...(bal[p.id] || { owesUs: 0, weOwe: 0, net: 0 }) })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
  const fields = [{ name: 'name', label: 'Name', type: 'text', required: true }, { name: 'kind', label: 'Type', type: 'select', options: KINDS_P.map((k) => [k, k]), required: true }, { name: 'phone', label: 'Phone', type: 'text' }, { name: 'cnic', label: 'CNIC', type: 'text' }, { name: 'notes', label: 'Notes', type: 'text', full: true }];
  main.innerHTML = `<div class="page-h"><div><h1>People</h1><p class="muted">Tenants, buyers, farmers, contractors: who owes KHAS and who KHAS owes.</p></div>${canWrite() ? `<div class="top-actions"><button class="btn primary" id="pAdd">${icon('plus')} Add person</button></div>` : ''}</div>
    <div class="grid kpis">${[['Owed to us', sum(rows, (r) => r.owesUs)], ['We owe', sum(rows, (r) => r.weOwe)]].map(([l, v]) => `<div class="card kpi"><div class="k-label">${l}</div><div class="k-value">${money(v)}</div></div>`).join('')}</div>
    <div class="card section">${table([{ h: 'Name', v: (p) => `<b>${esc(p.name)}</b><div class="small muted">${esc(p.kind || '')}${p.phone ? ' · ' + esc(p.phone) : ''}</div>` }, { h: 'Owes us', num: true, v: (p) => (p.owesUs ? money(p.owesUs) : '') }, { h: 'We owe', num: true, v: (p) => (p.weOwe ? money(p.weOwe) : '') },
      { h: 'Balance', num: true, v: (p) => (p.net ? amt(p.net, true) : badge('Settled', 'good')) }], rows, { empty: 'No people added yet. They are also added automatically when you type a new name on an entry.', rowAttr: (p) => `data-p="${esc(p.id)}" class="click"` })}</div>`;
  const edit = (p) => modal({ title: p ? p.name : 'Add person', wide: !!p,
    body: `<form>${formHtml(fields, p || { kind: 'Other' })}<div class="actions">${p ? '<button type="button" class="btn danger" data-del>Delete</button>' : ''}<button class="btn primary" data-save>Save</button></div></form>
      ${p ? `<h3 style="margin:1.2rem 0 .5rem">Statement</h3>${table([{ h: 'Date', v: (x) => fmtDate(x.entry.date) }, { h: 'Details', v: (x) => esc(x.entry.memo || ENTRY_TYPES[x.entry.type]) }, { h: 'Change', num: true, v: (x) => (x.change ? amt(x.change, true) : '') }, { h: 'Balance', num: true, v: (x) => money(x.balance) }], partyStatement(entries(), p.id).reverse(), { empty: 'No entries with this person yet.' })}<p class="small muted">A positive balance means they owe KHAS.</p>` : ''}`,
    onMount(b, close) {
      $('form', b).onsubmit = (ev) => { ev.preventDefault(); busy($('[data-save]', b), async () => { const v = readForm(b, fields); if (p) Object.assign(S.db.parties.parties.find((x) => x.id === p.id), v); else S.db.parties.parties.push({ id: uid(), ...v }); await save('parties', `${p ? 'Update' : 'Add'} ${v.name}`); toast('Saved'); close(); }); };
      const del = $('[data-del]', b); if (del) del.onclick = async () => {
        if (entries().some((e) => e.party === p.id)) return toast('This person has entries, so they cannot be deleted.', true);
        if (await confirmBox(`Delete ${p.name}?`)) busy(del, async () => { S.db.parties.parties = S.db.parties.parties.filter((x) => x.id !== p.id); await save('parties', `Delete ${p.name}`); close(); });
      };
    } });
  const add = $('#pAdd', main); if (add) add.onclick = () => edit(null);
  $$('[data-p]', main).forEach((tr) => (tr.onclick = () => edit(rows.find((r) => r.id === tr.dataset.p))));
}
