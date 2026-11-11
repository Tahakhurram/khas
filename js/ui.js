// Shared UI pieces: toast, modal / bottom sheet, form builder, tables, charts, icons.
import { esc, money, short } from './util.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function toast(msg, isErr) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), isErr ? 6500 : 2600);
}
// Run an async action from a button: disables it, shows errors as a toast.
export async function busy(btn, fn) {
  const label = btn && btn.innerHTML; if (btn) { btn.disabled = true; btn.innerHTML = 'Saving…'; }
  try { return await fn(); } catch (err) { toast(err.message || String(err), true); return undefined; }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
}

const I = {
  world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  overview: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  ledger: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  units: '<path d="M3 21V8l6-4v17M9 21V11l6-3v13M15 21v-9l6 2v7M2 21h20"/>',
  reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  invest: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  parties: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.7.7 3 2.5 3.5 5.2"/>',
  approvals: '<path d="M9 12l2 2 4-4"/><rect x="4" y="4" width="16" height="16" rx="3"/>',
  data: '<path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  clip: '<path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
};
export const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;

// ---------- modal (bottom sheet on phones) ----------
export function modal({ title, body, wide, onMount, onClose }) {
  const el = document.createElement('div'); el.className = 'modal-back';
  el.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h2>${esc(title)}</h2><button class="iconbtn" data-close aria-label="Close">${icon('close')}</button></div>
    <div class="modal-b">${body}</div></div>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', key); if (onClose) onClose(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
  $('[data-close]', el).onclick = close; document.addEventListener('keydown', key);
  document.body.appendChild(el);
  if (onMount) onMount($('.modal-b', el), close);
  const first = $('input:not([type=hidden]),select,textarea', el); if (first && window.innerWidth > 760) first.focus();
  return close;
}
export function confirmBox(message, okLabel = 'Delete') {
  return new Promise((res) => {
    let done = false;
    modal({ title: 'Please confirm', body: `<p style="margin-top:0">${esc(message)}</p><div class="actions"><button class="btn" data-no>Cancel</button><button class="btn danger" data-yes>${esc(okLabel)}</button></div>`,
      onMount(b, close) { $('[data-no]', b).onclick = close; $('[data-yes]', b).onclick = () => { done = true; close(); }; }, onClose: () => res(done) });
  });
}

// ---------- forms ----------
// field: { name, label, type:'text'|'number'|'money'|'date'|'select'|'textarea'|'check', options:[[value,label]], required, hint, placeholder, step }
export function fieldHtml(f, v) {
  const val = v ?? f.default ?? ''; const req = f.required ? ' required' : ''; const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  let input;
  if (f.type === 'select') input = `<select name="${f.name}"${req}>${f.required && !f.noBlank ? '' : '<option value="">—</option>'}${(f.options || []).map(([ov, ol]) => `<option value="${esc(ov)}"${String(ov) === String(val) ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') input = `<textarea name="${f.name}" rows="2"${req}${ph}>${esc(val)}</textarea>`;
  else if (f.type === 'check') return `<label class="check" data-field="${f.name}"><input type="checkbox" name="${f.name}"${val ? ' checked' : ''}> ${esc(f.label)}</label>`;
  else if (f.type === 'money' || f.type === 'number') input = `<input name="${f.name}" type="number" inputmode="decimal" step="${f.step || 'any'}" min="${f.min ?? ''}" value="${esc(val)}"${req}${ph}>`;
  else input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}"${req}${ph}${f.list ? ` list="${f.list}"` : ''}>`;
  return `<label data-field="${f.name}"${f.full ? ' class="full"' : ''}>${esc(f.label)}${f.hint ? ` <span class="hint">${esc(f.hint)}</span>` : ''}${input}</label>`;
}
export const formHtml = (fields, values = {}) => `<div class="form-grid">${fields.map((f) => fieldHtml(f, values[f.name])).join('')}</div>`;
export function readForm(root, fields) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(`[name="${f.name}"]`); if (!el) continue;
    if (f.type === 'check') out[f.name] = el.checked;
    else if (f.type === 'money' || f.type === 'number') out[f.name] = el.value === '' ? '' : Number(el.value);
    else out[f.name] = el.value.trim();
  }
  return out;
}

// ---------- tables ----------
// cols: [{ h:'Header', num:true, v:(row)=>html }]   (v must return safe html: use esc())
export function table(cols, rows, { empty = 'Nothing here yet.', foot, rowAttr } = {}) {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  return `<div class="tablewrap"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr${rowAttr ? ' ' + rowAttr(r) : ''}>${cols.map((c) => `<td class="${c.num ? 'num' : ''}${c.cls ? ' ' + c.cls : ''}">${c.v(r)}</td>`).join('')}</tr>`).join('')
  }</tbody>${foot ? `<tfoot><tr>${foot.map((c, i) => `<td class="${cols[i] && cols[i].num ? 'num' : ''}">${c}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
}
export const kpi = (label, value, foot = '', cls = '') => `<div class="card kpi ${cls}"><div class="k-label">${esc(label)}</div><div class="k-value">${value}</div>${foot ? `<div class="k-foot">${foot}</div>` : ''}</div>`;
export const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;
export const amt = (n, signed) => `<span class="${signed ? (n < 0 ? 'neg' : n > 0 ? 'pos' : '') : ''}" title="${money(n)}">${money(n)}</span>`;
export const legend = (items) => `<div class="legend">${items.map(([c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>`;
export const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${v === cur ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;

// ---------- charts (Chart.js) ----------
let charts = [];
export const killCharts = () => { charts.forEach((c) => c.destroy()); charts = []; };
export const series = () => ({ income: css('--s1'), expense: css('--s2'), net: css('--s3'), cats: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css('--s' + i)) });
export function chart(id, cfg) {
  const el = document.getElementById(id); if (!el || !window.Chart) return null;
  Chart.defaults.color = css('--muted'); Chart.defaults.font.family = 'Inter, system-ui, sans-serif'; Chart.defaults.font.size = 12; Chart.defaults.borderColor = css('--line');
  cfg.options = { responsive: true, maintainAspectRatio: false, animation: { duration: 350 }, ...cfg.options };
  cfg.options.plugins = { legend: { display: false }, ...cfg.options.plugins,
    tooltip: { backgroundColor: '#14201a', padding: 10, cornerRadius: 8, boxPadding: 4, callbacks: { label: (c) => ` ${c.dataset.label || c.label}: ${money(c.parsed.y ?? c.parsed)}` }, ...(cfg.options.plugins || {}).tooltip } };
  const c = new Chart(el, cfg); charts.push(c); return c;
}
export const moneyAxis = { beginAtZero: true, ticks: { callback: (v) => short(v), maxTicksLimit: 6 }, grid: { color: () => css('--line') }, border: { display: false } };
// Income vs expense bars for a monthly series [{month, income, expense}]
export function incomeExpenseChart(id, rows, labels) {
  const s = series();
  return chart(id, { type: 'bar', data: { labels, datasets: [
    { label: 'Income', data: rows.map((r) => r.income), backgroundColor: s.income, borderRadius: 4, maxBarThickness: 18, borderWidth: 0 },
    { label: 'Expenses', data: rows.map((r) => r.expense), backgroundColor: s.expense, borderRadius: 4, maxBarThickness: 18, borderWidth: 0 },
  ] }, options: { interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false } }, y: moneyAxis } } });
}
// Tiny inline sparkline (SVG) for a list of numbers.
export function spark(values, w = 120, h = 30) {
  if (!values.length) return '';
  const max = Math.max(...values, 1), min = Math.min(...values, 0), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
// Shrink a photo in the browser to roughly 300 KB and return base64 JPEG (no data: prefix).
export function compressImage(file, maxSide = 1400, target = 300 * 1024) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      let q = 0.8, out = c.toDataURL('image/jpeg', q);
      while (out.length * 0.75 > target && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      res(out.split(',')[1]);
    };
    img.onerror = () => rej(new Error('That file is not a readable image.')); img.src = url;
  });
}
