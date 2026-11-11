// Overview dashboard, Investments & returns, and the shared net worth calculation.
import { S, entries, accounts, units, unitName, cashAccounts, canWrite } from '../store.js';
import { totals, totalsByUnit, monthly, balanceSheet, balances, pnl, netWorthSeries, assetCosts } from '../engine.js';
import { herd, holdings, allDues, reminders } from '../calc.js';
import { esc, money, moneyShort, short, today, monthsBack, monthLabel, sum, periodRange, addDays, fmtDate, daysBetween } from '../util.js';
import { $, $$, table, kpi, badge, amt, legend, chart, incomeExpenseChart, series, moneyAxis, seg, css } from '../ui.js';
import { assetValue, unitSummary } from './units.js';

// Net worth = books at cost + rise in value of assets and shares + estimated value of the herd.
export function netWorth() {
  const bs = balanceSheet(entries(), accounts(), '9999-12-31'), costs = assetCosts(entries());
  const assetUplift = sum(S.db.assets.assets.filter((a) => a.status !== 'sold'), (a) => assetValue(a, costs[a.id] || 0) - (costs[a.id] || 0));
  const stockUplift = sum(holdings(S.db.stocks).filter((h) => h.qty > 0), (h) => h.unrealised);
  const h = herd(S.db.livestock), hv = S.db.meta.herdValue || {};
  const herdValue = (h.ewe * (hv.ewe || 0)) + (h.ram * (hv.ram || 0)) + (h.lamb * (hv.lamb || 0));
  return { book: bs.netWorth, assetUplift, stockUplift, herdValue, total: bs.netWorth + assetUplift + stockUplift + herdValue, bs };
}

// Three-column money flow: businesses -> KHAS -> expense types and what is kept.
function sankey(left, right, total) {
  const W = 760, H = 360, nw = 12, pad = 8, top = 12, x0 = 190, x1 = W / 2 - nw / 2, x2 = W - 190 - nw;
  if (!total) return '<div class="empty">No income recorded in this period yet.</div>';
  const scale = (list) => (H - top * 2 - pad * (list.length - 1)) / sum(list, (d) => d.v);
  const k = Math.min(scale(left), scale(right));
  const lay = (list) => { let y = top + (H - top * 2 - (sum(list, (d) => d.v) * k + pad * (list.length - 1))) / 2; return list.map((d) => { const h = Math.max(1.5, d.v * k), o = { ...d, y, h }; y += h + pad; return o; }); };
  const L = lay(left), R = lay(right), midH = total * k, midY = (H - midH) / 2;
  const ribbon = (xa, ya, xb, yb, h, color, label) => { const mx = (xa + xb) / 2; return `<path d="M${xa},${ya} C${mx},${ya} ${mx},${yb} ${xb},${yb} L${xb},${yb + h} C${mx},${yb + h} ${mx},${ya + h} ${xa},${ya + h} Z" fill="${color}" opacity=".28"><title>${esc(label)}</title></path>`; };
  let ly = midY, ry = midY, out = '';
  L.forEach((d) => { out += ribbon(x0 + nw, d.y, x1, ly, d.h, 'var(--s1)', `${d.name}: ${money(d.v)}`); ly += d.v * k; });
  R.forEach((d) => { out += ribbon(x1 + nw, ry, x2, d.y, d.h, d.keep ? 'var(--s3)' : 'var(--s2)', `${d.name}: ${money(d.v)}`); ry += d.v * k; });
  const node = (x, d, color, side) => `<rect x="${x}" y="${d.y}" width="${nw}" height="${d.h}" rx="3" fill="${color}"><title>${esc(d.name)}: ${money(d.v)}</title></rect>
    <text x="${side === 'l' ? x - 8 : x + nw + 8}" y="${d.y + d.h / 2}" text-anchor="${side === 'l' ? 'end' : 'start'}" dominant-baseline="middle" class="sk-l">${esc(d.name.length > 19 ? d.name.slice(0, 18) + '…' : d.name)} <tspan class="sk-v">${short(d.v)}</tspan></text>`;
  return `<div class="sankey"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Money flow from businesses to expenses and savings">${out}
    ${L.map((d) => node(x0, d, 'var(--s1)', 'l')).join('')}${R.map((d) => node(x2, d, d.keep ? 'var(--s3)' : 'var(--s2)', 'r')).join('')}
    <rect x="${x1}" y="${midY}" width="${nw}" height="${midH}" rx="3" fill="var(--text)"/><text x="${x1 + nw / 2}" y="${midY - 6}" text-anchor="middle" class="sk-l" style="font-weight:600">KHAS</text></svg></div>`;
}
const topN = (list, n) => { const s = [...list].sort((a, b) => b.v - a.v); if (s.length <= n) return s; return [...s.slice(0, n - 1), { name: 'Other', v: sum(s.slice(n - 1), (d) => d.v) }]; };

let period = 'year';
export function renderOverview(main) {
  const r = periodRange(period), es = entries(), acc = accounts(), nw = netWorth();
  const t = totals(es, acc, r), tm = totals(es, acc, periodRange('month'));
  const byU = totalsByUnit(es, acc, r), months = monthsBack(today().slice(0, 7), 12), ms = monthly(es, acc, months), s = series();
  const unitRows = units().map((u) => ({ u, ...(byU[u.id] || { income: 0, expense: 0, net: 0 }) })).filter((x) => x.income || x.expense).sort((a, b) => b.income - a.income);
  const p = pnl(es, acc, r);
  const left = topN(unitRows.filter((x) => x.income > 0).map((x) => ({ name: x.u.name, v: x.income })), 8);
  const inflow = sum(left, (d) => d.v), right = topN(p.expense.filter((x) => x.amount > 0).map((x) => ({ name: x.name, v: x.amount })), 7);
  const kept = inflow - sum(right, (d) => d.v); if (kept > 0) right.push({ name: 'Kept (net profit)', v: kept, keep: true });
  const bal = balances(es), cash = cashAccounts().map((a) => ({ a, v: bal[a.id] || 0 }));
  const dues = allDues(S.db, addDays(today(), -120), addDays(today(), 45)).filter((d) => !d.paid).slice(0, 7);
  const nws = netWorthSeries(es, acc, months), uplift = nw.total - nw.book;

  main.innerHTML = `<div class="page-h"><div><h1>Overview</h1><p class="muted">The whole of KHAS in one place.</p></div><div class="top-actions">${seg('period', [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['all', 'All time']], period)}</div></div>
    <div class="grid kpis k4">
      ${kpi('Net worth', `<span title="${money(nw.total)}">${moneyShort(nw.total)}</span>`, `Books ${moneyShort(nw.book)}${uplift ? ` + ${moneyShort(uplift)} rise in value` : ''}`, 'hero')}
      ${kpi(`Income · ${r.label}`, money(t.income), `${money(tm.income)} this month`)}${kpi(`Expenses · ${r.label}`, money(t.expense), `${money(tm.expense)} this month`)}
      ${kpi(`Net profit · ${r.label}`, amt(t.net, true), t.income ? `${Math.round((t.net / t.income) * 100)}% of income kept` : '')}</div>
    <div class="grid two">
      <div class="card"><div class="card-h"><h3>Income and expenses <span class="sub">· last 12 months, all businesses</span></h3>${legend([[s.income, 'Income'], [s.expense, 'Expenses']])}</div><div class="chartbox"><canvas id="ovMonthly"></canvas></div></div>
      <div class="card"><div class="card-h"><h3>Net worth at cost <span class="sub">· last 12 months</span></h3></div><div class="chartbox"><canvas id="ovWorth"></canvas></div></div>
    </div>
    <div class="card section"><div class="card-h"><h3>Where the money comes from and goes <span class="sub">· ${esc(r.label)}</span></h3>${legend([[s.income, 'Income'], [s.expense, 'Expenses'], [s.net, 'Kept']])}</div>${sankey(left, right, inflow)}</div>
    <div class="grid two">
      <div class="card"><div class="card-h"><h3>By business <span class="sub">· ${esc(r.label)}</span></h3></div>${table(
        [{ h: 'Business', v: (x) => `<a href="#/unit/${esc(x.u.id)}">${esc(x.u.name)}</a>` }, { h: 'Income', num: true, v: (x) => money(x.income) }, { h: 'Expenses', num: true, v: (x) => money(x.expense) }, { h: 'Net', num: true, v: (x) => amt(x.net, true) }],
        unitRows, { empty: 'No income or expenses in this period.', foot: ['<b>Total</b>', `<b>${money(t.income)}</b>`, `<b>${money(t.expense)}</b>`, `<b>${money(t.net)}</b>`] })}</div>
      <div>
        <div class="card"><div class="card-h"><h3>Cash and bank</h3><b>${money(sum(cash, (c) => c.v))}</b></div>${table([{ h: 'Account', v: (c) => `<a href="#/reports/cashbook?acc=${esc(c.a.id)}">${esc(c.a.name)}</a>` }, { h: 'Balance', num: true, v: (c) => amt(c.v, true) }], cash)}</div>
        <div class="card section"><div class="card-h"><h3>Coming up</h3><a class="btn sm" href="#/calendar">Calendar</a></div>${table(
          [{ h: 'Due', v: (d) => `${fmtDate(d.date)} ${d.date < today() ? badge('Overdue', 'bad') : ''}` }, { h: 'What', v: (d) => `${esc(d.title)}<div class="small muted">${esc(unitName(d.unit))}</div>` }, { h: 'Amount', num: true, v: (d) => money(d.amount) }], dues, { empty: 'Nothing due in the next 45 days.' })}</div>
      </div>
    </div>`;
  incomeExpenseChart('ovMonthly', ms, months.map((m) => monthLabel(m)));
  chart('ovWorth', { type: 'line', data: { labels: months.map((m) => monthLabel(m)), datasets: [{ label: 'Net worth at cost', data: nws.map((x) => x.value), borderColor: s.income, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.25 }] },
    options: { interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false } }, y: { ...moneyAxis, beginAtZero: false } } } });
  $$('[data-seg=period] button', main).forEach((b) => (b.onclick = () => { period = b.dataset.v; renderOverview(main); }));
}

// ---------- Investments & returns ----------
export function renderInvestments(main) {
  const all = periodRange('all'), es = entries(), first = {};
  es.forEach((e) => { if (e.unit && (!first[e.unit] || e.date < first[e.unit])) first[e.unit] = e.date; });
  const rows = units().map((u) => {
    const s = unitSummary(u, all), gain = s.value - s.invested, ret = s.net + gain;
    const years = first[u.id] ? Math.max(daysBetween(first[u.id], today()) / 365, 1 / 12) : 0;
    const pct = s.invested > 0 ? (ret / s.invested) * 100 : null, ann = pct != null && years ? (Math.pow(Math.max(0, 1 + ret / s.invested), 1 / Math.max(years, 1)) - 1) * 100 : null;
    return { u, ...s, gain, ret, pct, ann, years };
  }).filter((x) => x.invested || x.value || x.income || x.expense);
  const nw = netWorth(), inv = sum(rows, (x) => x.invested), val = sum(rows, (x) => x.value);
  const pts = rows.filter((x) => x.invested > 0 && x.pct != null), maxV = Math.max(...pts.map((x) => x.value), 1);
  main.innerHTML = `<div class="page-h"><div><h1>Investments and returns</h1><p class="muted">What was put into each business, what it is worth now and what it has earned, all time.</p></div></div>
    <div class="grid kpis k4">${kpi('Money invested', `<span title="${money(inv)}">${moneyShort(inv)}</span>`, 'Cost of assets and shares held')}${kpi('Worth now', `<span title="${money(val)}">${moneyShort(val)}</span>`, 'Latest valuations and prices')}
      ${kpi('Rise in value', amt(val - inv, true), 'Not yet sold, so not income')}${kpi('Herd value', money(nw.herdValue), nw.herdValue ? 'Estimated from value per head' : 'Set value per head in Settings')}</div>
    <div class="card section"><div class="card-h"><h3>Size against return <span class="sub">· each bubble is a business; bigger means worth more</span></h3></div>
      ${pts.length ? '<div class="chartbox tall"><canvas id="invBubble"></canvas></div>' : '<div class="empty">Add assets with their cost to see this chart.</div>'}</div>
    <div class="card section"><div class="card-h"><h3>Return by business</h3></div>${table(
      [{ h: 'Business', v: (x) => `<a href="#/unit/${esc(x.u.id)}">${esc(x.u.name)}</a>` }, { h: 'Invested', num: true, v: (x) => money(x.invested) }, { h: 'Worth now', num: true, v: (x) => money(x.value) }, { h: 'Net income', num: true, v: (x) => amt(x.net, true) },
        { h: 'Total return', num: true, v: (x) => amt(x.ret, true) }, { h: 'Return %', num: true, v: (x) => (x.pct == null ? '—' : x.pct.toFixed(1) + '%') }, { h: 'Per year', num: true, v: (x) => (x.ann == null ? '—' : x.ann.toFixed(1) + '%') }],
      rows, { empty: 'Nothing recorded yet.' })}
      <p class="small muted note">Total return = net income earned + rise in value. "Per year" spreads it over the time since the first entry for that business (at least one year).</p></div>`;
  if (pts.length) chart('invBubble', { type: 'bubble', data: { datasets: [{ label: 'Businesses', data: pts.map((x) => ({ x: x.invested, y: Number(x.pct.toFixed(1)), r: 8 + 26 * Math.sqrt(x.value / maxV), name: x.u.name })), backgroundColor: css('--s1') + '55', borderColor: css('--s1'), borderWidth: 2 }] },
    options: { scales: { x: { ...moneyAxis, title: { display: true, text: 'Money invested (PKR)' } }, y: { title: { display: true, text: 'Total return %' }, grid: { color: () => css('--line') }, border: { display: false }, ticks: { callback: (v) => v + '%' } } },
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.raw.name}: ${money(c.raw.x)} invested, ${c.raw.y}% return` } } } } });
}
