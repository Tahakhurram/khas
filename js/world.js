// KHAS World: an isometric, data-driven map of every business. Inline SVG + GSAP, pan and zoom, money-flow particles.
import { S, entries, accounts, units, unitName, canWrite } from './store.js';
import { monthly } from './engine.js';
import { herd, holdings, instalmentProgress, rentDues, bataiSplit } from './calc.js';
import * as H from './hostel-calc.js';
import { KINDS } from './seed.js';
import { esc, money, moneyShort, today, monthsBack, sum, periodRange, addDays, fmtDate, clamp } from './util.js';
import { $, $$, seg, spark, badge, icon } from './ui.js';
import { unitSummary } from './views/units.js';
import { openEntry, showEntry } from './views/entry.js';
import { assetCosts } from './engine.js';

const TW = 64, TH = 32, OX = 800, OY = 130, W = 1600, HGT = 1010, C = 12; // C = treasury centre on the grid
const P = (gx, gy, z = 0) => [OX + (gx - gy) * TW / 2, OY + (gx + gy) * TH / 2 - z];
const pts = (a) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
const poly = (a, fill, extra = '') => `<polygon points="${pts(a)}" fill="${fill}" ${extra}/>`;
const quad = (gx, gy, w, d, fill, extra = '', z = 0) => poly([P(gx, gy, z), P(gx + w, gy, z), P(gx + w, gy + d, z), P(gx, gy + d, z)], fill, extra);
const line = (a, b, stroke, sw = 1, extra = '') => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const up = (p, h) => [p[0], p[1] - h];

const PAL = {
  cream: { left: '#d8ccb3', right: '#bfb295', top: '#ebe3cf' }, brick: { left: '#b97a60', right: '#9d624b', top: '#cf9a84' },
  concrete: { left: '#bbb8b0', right: '#a09d95', top: '#d3d0c8' }, stone: { left: '#e7e0d0', right: '#cdc5b1', top: '#f4efe3' },
  glass: { left: '#8fb0bd', right: '#7498a6', top: '#b7d0d9' }, wood: { left: '#a17a55', right: '#876345', top: '#b99270' }, white: { left: '#eeeae0', right: '#d6d1c4', top: '#faf8f2' },
};
function box(gx, gy, w, d, h, c, z = 0) {
  const A = P(gx, gy, z), B = P(gx + w, gy, z), Cc = P(gx + w, gy + d, z), D = P(gx, gy + d, z);
  return poly([D, Cc, up(Cc, h), up(D, h)], c.left) + poly([Cc, B, up(B, h), up(Cc, h)], c.right) + poly([up(A, h), up(B, h), up(Cc, h), up(D, h)], c.top);
}
// Windows on the two visible faces. lit(i) decides which glow.
function windows(gx, gy, w, d, h, { cols, rows, lit, z = 0, side }) {
  const a = side === 'left' ? P(gx, gy + d, z) : P(gx + w, gy + d, z), b = side === 'left' ? P(gx + w, gy + d, z) : P(gx + w, gy, z);
  const pt = (u, v) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - v * h]; let s = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const u0 = (c + 0.26) / cols, u1 = (c + 0.74) / cols, v0 = (r + 0.3) / rows, v1 = (r + 0.76) / rows, on = lit(r * cols + c + (side === 'left' ? 0 : 1000));
    s += poly([pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)], on ? '#ffd98a' : side === 'left' ? '#56636b' : '#465259', on ? 'class="lit"' : '');
  }
  return s;
}
const litFn = (frac) => (i) => ((i * 37 + 11) % 100) < frac * 100;
function building(gx, gy, w, d, floors, pal, frac = 0.6, z = 0) {
  const h = floors * 22, wl = Math.max(2, Math.round(w * 2)), wr = Math.max(2, Math.round(d * 2)), lit = litFn(frac);
  return box(gx, gy, w, d, h, pal, z) + windows(gx, gy, w, d, h, { cols: wl, rows: floors, lit, z, side: 'left' }) + windows(gx, gy, w, d, h, { cols: wr, rows: floors, lit, z, side: 'right' })
    + box(gx - 0.06, gy - 0.06, w + 0.12, d + 0.12, 4, { left: pal.right, right: pal.right, top: pal.top }, z + h);
}
const shadow = (gx, gy, w, d) => quad(gx + 0.25, gy + 0.25, w, d, '#1d2a1e', 'opacity=".16"');
function pine(gx, gy, s = 1) {
  const [x, y] = P(gx, gy);
  return `<g><ellipse cx="${x}" cy="${y}" rx="${9 * s}" ry="${4 * s}" fill="#1d2a1e" opacity=".18"/><rect x="${x - 1.5 * s}" y="${y - 8 * s}" width="${3 * s}" height="${8 * s}" fill="#6b4f37"/>
    ${[[14, 8, 0], [11, 20, 8], [8, 30, 16]].map(([hw, top, base], i) => `<polygon points="${x - hw * s},${y - (6 + base) * s} ${x},${y - (16 + top) * s} ${x + hw * s},${y - (6 + base) * s}" fill="${['#3f6b4a', '#467552', '#4f805b'][i]}"/><polygon points="${x},${y - (16 + top) * s} ${x + hw * s},${y - (6 + base) * s} ${x},${y - (6 + base) * s}" fill="#2f5639" opacity=".45"/>`).join('')}</g>`;
}
function tree(gx, gy, s = 1) {
  const [x, y] = P(gx, gy);
  return `<g><ellipse cx="${x}" cy="${y}" rx="${10 * s}" ry="${4.5 * s}" fill="#1d2a1e" opacity=".18"/><rect x="${x - 1.6 * s}" y="${y - 12 * s}" width="${3.2 * s}" height="${12 * s}" fill="#735840"/>
    <ellipse cx="${x}" cy="${y - 19 * s}" rx="${11 * s}" ry="${10 * s}" fill="#6f9a58"/><ellipse cx="${x + 3 * s}" cy="${y - 17 * s}" rx="${8 * s}" ry="${8 * s}" fill="#5a8449" opacity=".7"/><ellipse cx="${x - 3 * s}" cy="${y - 23 * s}" rx="${5 * s}" ry="${4 * s}" fill="#8fb673" opacity=".7"/></g>`;
}
function mountain(gx, gy, w, h, snow = true) {
  const [x, y] = P(gx, gy), pk = [x, y - h], l = [x - w / 2, y], r = [x + w / 2, y], m = [x + w * 0.08, y + w * 0.16];
  return `<g>${poly([l, pk, m], '#8b9684')}${poly([pk, r, m], '#6d7868')}${snow ? poly([[x - w * 0.11, y - h * 0.72], pk, [x + w * 0.02, y - h * 0.66]], '#f4f6f4') + poly([pk, [x + w * 0.12, y - h * 0.7], [x + w * 0.02, y - h * 0.66]], '#dfe5e3') : ''}</g>`;
}
function sign(gx, gy, text, bg, z = 0) {
  const [x, y] = P(gx, gy, z), w = text.length * 5.6 + 10;
  return `<g><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 22}" stroke="#5c4a38" stroke-width="2"/><rect x="${x - w / 2}" y="${y - 34}" width="${w}" height="14" rx="2" fill="${bg}" stroke="#fff" stroke-width="1"/><text x="${x}" y="${y - 24}" text-anchor="middle" class="w-sign">${esc(text)}</text></g>`;
}
function fence(gx, gy, w, d) {
  let s = ''; const seg2 = (a, b) => { s += line(up(a, 7), up(b, 7), '#8a6f52', 1.4) + line(up(a, 3.5), up(b, 3.5), '#8a6f52', 1.2); };
  const corners = [[gx, gy], [gx + w, gy], [gx + w, gy + d], [gx, gy + d]];
  corners.forEach((c, i) => { const n = corners[(i + 1) % 4], steps = Math.round(Math.hypot(n[0] - c[0], n[1] - c[1]) * 2);
    for (let k = 0; k < steps; k++) { const a = P(c[0] + (n[0] - c[0]) * k / steps, c[1] + (n[1] - c[1]) * k / steps), b = P(c[0] + (n[0] - c[0]) * (k + 1) / steps, c[1] + (n[1] - c[1]) * (k + 1) / steps); s += line(a, up(a, 9), '#7a614a', 1.6); seg2(a, b); } });
  return s;
}
const sheep = (x, y, s = 1) => `<g class="sheep" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><g class="sheep-in"><ellipse cx="0" cy="1" rx="${9 * s}" ry="${2.5 * s}" fill="#1d2a1e" opacity=".2"/>
  <line x1="${-4 * s}" y1="${-3 * s}" x2="${-4 * s}" y2="0" stroke="#3b332c" stroke-width="1.4"/><line x1="${3 * s}" y1="${-3 * s}" x2="${3 * s}" y2="0" stroke="#3b332c" stroke-width="1.4"/>
  <ellipse cx="0" cy="${-7 * s}" rx="${8 * s}" ry="${5.4 * s}" fill="#f2ede1"/><ellipse cx="${7.5 * s}" cy="${-6 * s}" rx="${3.4 * s}" ry="${3.8 * s}" fill="#e3dccb"/><circle cx="${-8 * s}" cy="${-9 * s}" r="${3 * s}" fill="#3b332c"/></g></g>`;

const STAGE = { ploughed: '#8c7257', sown: '#9c8a63', growing: '#7da658', ready: '#d8b550', harvested: '#c9bb8e' };
function field(gx, gy, w, d, stage, split) {
  const base = STAGE[stage] || STAGE.ploughed, rows = 6; let s = quad(gx, gy, w, d, base, 'stroke="#6f5c45" stroke-width="1"');
  for (let i = 1; i < rows; i++) s += line(P(gx, gy + d * i / rows), P(gx + w, gy + d * i / rows), '#000', 1, 'opacity=".12"');
  if (stage === 'growing' || stage === 'ready') for (let i = 0; i < rows; i++) for (let k = 0; k < 5; k++) { const [x, y] = P(gx + w * (k + 0.5) / 5, gy + d * (i + 0.5) / rows); s += `<path class="tuft" d="M${x.toFixed(1)},${y.toFixed(1)} q-2,-5 0,-9 M${x.toFixed(1)},${y.toFixed(1)} q3,-4 3,-8" stroke="${stage === 'ready' ? '#b8922f' : '#4f7d3a'}" stroke-width="1.3" fill="none"/>`; }
  if (split != null) { const k = clamp(split, 10, 90) / 100; s += quad(gx + w * k, gy, w * (1 - k), d, '#fff', 'opacity=".22"') + line(P(gx + w * k, gy), P(gx + w * k, gy + d), '#fff', 2, 'stroke-dasharray="5 4"'); }
  return s;
}
function towerSprite(gx, gy, due) {
  const [x, y] = P(gx, gy), h = 120; let s = quad(gx - 0.7, gy - 0.7, 1.4, 1.4, '#b9b3a2', 'stroke="#8d8676" stroke-width="1"') + `<ellipse cx="${x + 10}" cy="${y + 4}" rx="18" ry="5" fill="#1d2a1e" opacity=".15"/>`;
  if (due) s += `<circle class="glow" cx="${x}" cy="${y - h}" r="34" fill="#f2b33d" opacity=".3"/>`;
  s += line([x - 11, y], [x - 2, y - h], '#70777c', 2) + line([x + 11, y], [x + 2, y - h], '#70777c', 2) + line([x, y + 4], [x, y - h], '#8a9196', 1.4);
  for (let i = 0; i < 6; i++) { const y0 = y - i * 20, y1 = y - (i + 1) * 20, w0 = 11 - i * 1.5, w1 = 11 - (i + 1) * 1.5; s += line([x - w0, y0], [x + w1, y1], '#8a9196', 1) + line([x + w0, y0], [x - w1, y1], '#8a9196', 1) + line([x - w1, y1], [x + w1, y1], i % 2 ? '#c8534a' : '#eceae4', 2.4); }
  s += `<rect x="${x - 7}" y="${y - h + 8}" width="4" height="12" rx="1" fill="#e8e6df"/><rect x="${x + 3}" y="${y - h + 8}" width="4" height="12" rx="1" fill="#e8e6df"/><ellipse cx="${x + 8}" cy="${y - h + 30}" rx="4" ry="5" fill="#d9d6cd"/>`;
  s += [0, 1, 2].map((i) => `<circle class="ring" data-i="${i}" cx="${x}" cy="${y - h - 4}" r="6" fill="none" stroke="${due ? '#e39a1c' : '#5fa3c7'}" stroke-width="1.6" opacity="0"/>`).join('') + `<circle class="blink" cx="${x}" cy="${y - h - 4}" r="3" fill="#e5483f"/>`;
  return s;
}
function crane(gx, gy, h) {
  const [x, y] = P(gx, gy); let s = line([x, y], [x, y - h], '#d8a531', 3);
  for (let i = 0; i < h / 14; i++) s += line([x - 3, y - i * 14], [x + 3, y - (i + 1) * 14], '#b98a1f', 1);
  return s + `<g class="jib" data-o="${x.toFixed(1)} ${(y - h).toFixed(1)}"><line x1="${x - 26}" y1="${y - h + 6}" x2="${x + 74}" y2="${y - h - 16}" stroke="#d8a531" stroke-width="3"/><line x1="${x}" y1="${y - h - 16}" x2="${x + 74}" y2="${y - h - 16}" stroke="#b98a1f" stroke-width="1"/>
    <rect x="${x - 30}" y="${y - h + 3}" width="10" height="9" fill="#7c7f82"/><line class="hookline" x1="${x + 58}" y1="${y - h - 12}" x2="${x + 58}" y2="${y - h + 26}" stroke="#444" stroke-width="1"/><rect class="hook" x="${x + 53}" y="${y - h + 26}" width="10" height="8" fill="#9c6149"/></g><rect x="${x - 5}" y="${y - h - 6}" width="10" height="10" fill="#e0b44a" stroke="#b98a1f"/>`;
}
// A building that is partly built: finished floors are solid, the rest is scaffolding.
function construction(gx, gy, w, d, floors, pct) {
  const done = Math.round(floors * clamp(pct, 0, 100) / 100), h = floors * 22; let s = shadow(gx, gy, w, d) + quad(gx - 0.2, gy - 0.2, w + 0.4, d + 0.4, '#c9bfa6');
  if (done) s += building(gx, gy, w, d, done, PAL.concrete, 0);
  const A = P(gx, gy), B = P(gx + w, gy), Cc = P(gx + w, gy + d), D = P(gx, gy + d);
  for (let f = done; f <= floors; f++) { const z = f * 22; s += `<polygon points="${pts([up(A, z), up(B, z), up(Cc, z), up(D, z)])}" fill="none" stroke="#a8824f" stroke-width="1.3" opacity=".8"/>`; }
  [A, B, Cc, D].forEach((p) => (s += line(up(p, done * 22), up(p, h), '#a8824f', 1.5)));
  for (let i = 1; i < 4; i++) { const a = [D[0] + (Cc[0] - D[0]) * i / 4, D[1] + (Cc[1] - D[1]) * i / 4], b = [Cc[0] + (B[0] - Cc[0]) * i / 4, Cc[1] + (B[1] - Cc[1]) * i / 4]; s += line(up(a, done * 22), up(a, h), '#a8824f', 1, 'opacity=".7"') + line(up(b, done * 22), up(b, h), '#a8824f', 1, 'opacity=".7"'); }
  return s + crane(gx + w + 0.5, gy - 0.1, h + 46);
}
function ship(gx, gy, sailing) {
  const [x, y] = P(gx, gy);
  return `<g class="ship${sailing ? ' sailing' : ''}" transform="translate(${x},${y})"><g class="ship-in"><ellipse cx="0" cy="6" rx="62" ry="9" fill="#fff" opacity=".25"/>
    <polygon points="-56,-14 50,-14 60,-22 66,-22 52,4 -46,4" fill="#2f3f55"/><polygon points="-48,0 53,0 52,4 -46,4" fill="#a9463c"/>
    ${[['#c8534a', -44], ['#e0a23a', -24], ['#4b8a7a', -4], ['#5a7fb0', -34], ['#d9cdb4', -14]].map(([c, cx], i) => `<rect x="${cx}" y="${i < 3 ? -27 : -39}" width="18" height="12" fill="${c}" stroke="#00000030"/>`).join('')}
    <rect x="24" y="-40" width="20" height="26" fill="#eeeae0"/><rect x="27" y="-36" width="14" height="5" fill="#56636b"/><rect x="32" y="-52" width="6" height="12" fill="#c8534a"/><circle class="smoke" cx="35" cy="-58" r="4" fill="#fff" opacity=".5"/></g></g>`;
}

// ---------- layout ----------
// spot: footprint origin, anchor = where its road starts, lab = label position (grid)
const SPOTS = {
  livestock: { a: [6, 18], lab: [4.2, 20.6] }, crops: { a: [4, 12], lab: [3.1, 12.9] }, batai: { a: [10, 20], lab: [8.5, 23.4] }, exports: { a: [16, 19], lab: [17.2, 20.5] },
  flats: { a: [16, 3.4], lab: [16.5, 3.7] }, tower: { a: [21.5, 3.4], lab: [22.1, 2.8] }, hostel: { a: [21.9, 9.8], lab: [22.4, 10.1] }, construction: { a: [16.2, 8.2], lab: [16.7, 8.6] },
  landtrade: { a: [15, 11.6], lab: [15.6, 11.1] }, buildsell: { a: [21, 13.3], lab: [21.4, 15.2] }, stocks: { a: [16.2, 13.3], lab: [16.7, 15.3] }, land: { a: [4, 5.4], lab: [4.3, 5.8] }, instalment: { a: [8, 4], lab: [8.6, 4.3] },
};
const SPARE = { lahore: [[18.6, 4.6], [22.6, 14.2]], village: [[8, 15.5], [1.5, 22]], north: [[6.5, 7.5], [1.5, 7.5]], port: [[13.5, 21.5]] };
function roadPts(a) { // L-shaped road to the treasury
  const [ax, ay] = a; return Math.abs(ax - C) > Math.abs(ay - C) ? [[ax, ay], [ax, C], [C, C]] : [[ax, ay], [C, ay], [C, C]];
}
const pathD = (g) => g.map((p, i) => `${i ? 'L' : 'M'}${P(p[0], p[1]).map((n) => n.toFixed(1)).join(',')}`).join(' ');

// ---------- per-unit model + sprite ----------
function model(u, range) {
  const s = unitSummary(u, range), db = S.db, m = { ...s };
  if (u.kind === 'livestock') m.herd = herd(db.livestock).total;
  if (u.kind === 'crops' || u.kind === 'batai') m.seasons = db.crops.seasons.filter((x) => x.unit === u.id).sort((a, b) => (a.status === 'harvested') - (b.status === 'harvested') || (b.year || 0) - (a.year || 0)).slice(0, 4);
  if (u.kind === 'flats') { const l = db.rentals.rentals.filter((r) => r.unit === u.id); m.frac = l.length ? l.filter((r) => r.status !== 'vacant').length / l.length : 0; m.count = l.length; }
  if (u.kind === 'hostel') { const h = S.hostels.find((x) => x.unit === u.id); m.frac = h ? H.occupancy(H.normalise(h.data)).pct / 100 : 0; }
  if (u.kind === 'tower') m.due = db.rentals.rentals.filter((r) => r.unit === u.id).some((r) => rentDues(r, addDays(today(), -400), addDays(today(), 30)).some((d) => !d.paid));
  if (u.kind === 'construction' || u.kind === 'buildsell') { const p = db.projects.projects.filter((x) => x.unit === u.id); m.pct = p.length ? sum(p, (x) => x.pct) / p.length : 0; m.sold = sum(p, (x) => x.unitsSold); m.projects = p.length; }
  if (u.kind === 'exports') m.sailing = db.exports.orders.some((o) => o.unit === u.id && o.status === 'shipped');
  if (u.kind === 'landtrade') { const costs = assetCosts(entries()); m.plots = db.assets.assets.filter((a) => a.unit === u.id).slice(0, 3).map((a) => ({ status: a.status, up: (a.valuations || []).length && Number(a.valuations[a.valuations.length - 1].value) > (costs[a.id] || 0) })); }
  if (u.kind === 'stocks') { const hs = holdings(db.stocks).filter((h) => h.qty > 0), c = sum(hs, (h) => h.cost); m.chg = c ? (sum(hs, (h) => h.value) - c) / c * 100 : null; }
  if (u.kind === 'instalment') { const as = db.assets.assets.filter((a) => a.unit === u.id); m.pct = instalmentProgress(sum(as, (a) => a.totalPrice), s.invested).pct; m.earning = as.some((a) => a.status === 'Earning'); }
  return m;
}
function sprite(u, m, spare) {
  switch (spare ? 'other' : u.kind) {
    case 'livestock': {
      let s = quad(2, 16, 4, 4, '#93b06e', 'stroke="#7f9b5d" stroke-width="1"') + quad(2.3, 17.6, 1.2, 0.9, '#7fa0a8', 'opacity=".8"') + fence(2, 16, 4, 4) + shadow(2.2, 16.2, 1.5, 1.3) + box(2.2, 16.2, 1.5, 1.3, 26, PAL.wood);
      const A = P(2.2, 17.5, 26), B = P(3.7, 17.5, 26), R1 = P(2.2, 16.85, 44), R2 = P(3.7, 16.85, 44), E = P(3.7, 16.2, 26), A0 = P(2.2, 16.2, 26);
      s += poly([A, B, R2, R1], '#8f4f3c') + poly([B, E, R2], '#a9805c') + poly([R1, R2, E, A0], '#7a4232', 'opacity=".9"');
      const n = m.herd ? clamp(Math.ceil(m.herd / 4), 3, 14) : 0;
      for (let i = 0; i < n; i++) { const gx = 2.6 + ((i * 53) % 30) / 10, gy = 17.9 + ((i * 29) % 18) / 10; const [x, y] = P(Math.min(gx, 5.6), Math.min(gy, 19.7)); s += sheep(x, y, 0.95); }
      return s + tree(5.6, 16.4, 1.1);
    }
    case 'crops': { const slots = [[0.4, 9.4], [2.1, 9.4], [0.4, 11.1], [2.1, 11.1]]; return slots.map(([x, y], i) => field(x, y, 1.6, 1.6, m.seasons[i] ? m.seasons[i].status : 'ploughed')).join('') + tree(3.9, 9.6, 0.9); }
    case 'batai': { const slots = [[7, 20.4], [8.6, 20.4], [7, 22], [8.6, 22]]; return slots.slice(0, Math.max(2, m.seasons.length)).map(([x, y], i) => { const se = m.seasons[i]; return field(x, y, 1.5, 1.5, se ? se.status : 'ploughed', se && se.kind !== 'theka' ? (se.pct || 50) : se ? 100 : 50); }).join(''); }
    case 'exports': return shadow(16.2, 17.4, 2, 1.4) + box(16.2, 17.4, 2, 1.4, 30, PAL.concrete) + box(16.15, 17.35, 2.1, 1.5, 5, { left: '#7d8a8f', right: '#6c787d', top: '#93a0a5' }, 30)
      + windows(16.2, 17.4, 2, 1.4, 30, { cols: 4, rows: 1, lit: litFn(0.5), side: 'left' }) + quad(18.4, 19.4, 2.6, 0.7, '#a58f6f', 'stroke="#806c50"') + [0, 1, 2].map((i) => box(17 + i * 0.45, 19.5, 0.4, 0.4, 11, [PAL.brick, { left: '#5a7fb0', right: '#4a6a95', top: '#7c9cc7' }, { left: '#4b8a7a', right: '#3d7365', top: '#69a595' }][i])).join('') + ship(21.6, 21, m.sailing);
    case 'flats': return shadow(15, 1.2, 2.2, 2) + building(15, 1.2, 2.2, 2, 4, PAL.cream, m.frac) + tree(14.3, 3, 0.9);
    case 'tower': return towerSprite(21.5, 1.9, m.due);
    case 'hostel': return shadow(20.6, 7.4, 2.6, 2.2) + building(20.6, 7.4, 2.6, 2.2, 4, PAL.brick, m.frac) + sign(23.5, 9.7, 'HOSTEL DE KHAS', '#1f4d3a');
    case 'construction': return construction(15.2, 6, 2, 2, 4, m.pct);
    case 'landtrade': return [[13.7, 9.2], [14.8, 9.2], [13.7, 10.3]].map(([x, y], i) => { const p = (m.plots || [])[i];
      return quad(x, y, 0.95, 0.95, p ? (p.up ? '#a9c084' : '#c2b894') : '#cfc8b4', `stroke="#fff" stroke-width="1.5" stroke-dasharray="${p ? '0' : '4 3'}"`) + (p && p.status === 'sold' ? sign(x + 0.5, y + 0.5, 'SOLD', '#b8473d') : p && p.status === 'for-sale' ? sign(x + 0.5, y + 0.5, 'FOR SALE', '#2f7d4f') : ''); }).join('');
    case 'buildsell': { const built = Math.round(clamp(m.pct || 0, 0, 100) / 100 * 3); return [0, 1, 2].map((i) => { const x = 19.3 + i * 1.25, y = 13.6;
      return i < built ? shadow(x, y, 1, 1.1) + building(x, y, 1, 1.1, 2, PAL.white, 0.5) + (i < (m.sold || 0) ? sign(x + 0.5, y + 1.3, 'SOLD', '#b8473d') : '') : quad(x, y, 1, 1.1, '#c9bfa6', 'stroke="#a8824f" stroke-dasharray="4 3"') + (m.projects ? line(P(x, y + 1.1), P(x, y + 1.1, 30), '#a8824f', 1.4) + line(P(x + 1, y + 1.1), P(x + 1, y + 1.1, 30), '#a8824f', 1.4) + line(P(x, y + 1.1, 30), P(x + 1, y + 1.1, 30), '#a8824f', 1.4) : ''); }).join(''); }
    case 'stocks': { const [x, y] = P(16.2, 15.1, 74), upc = m.chg == null || m.chg >= 0;
      return shadow(15.5, 13.7, 1.4, 1.4) + building(15.5, 13.7, 1.4, 1.4, 3, PAL.glass, 0.8) + `<rect x="${x - 34}" y="${y - 20}" width="68" height="18" rx="3" fill="#14201a"/><text class="w-tick" x="${x}" y="${y - 7}" text-anchor="middle" fill="${upc ? '#6fd08c' : '#f08a7c'}">PSX ${m.chg == null ? '—' : (upc ? '▲ ' : '▼ ') + Math.abs(m.chg).toFixed(1) + '%'}</text>`; }
    case 'land': return quad(2.9, 3.6, 1.8, 1.6, '#a9bd8a', 'stroke="#fff" stroke-width="1.5" stroke-dasharray="5 3"') + pine(3.1, 3.8, 0.9) + pine(4.5, 4, 0.8) + sign(3.8, 4.9, 'KHAS', '#1f4d3a');
    case 'instalment': { const tiers = 3, done = Math.ceil(clamp(m.pct || 0, 0, 100) / 100 * tiers), lit = m.earning ? 0.9 : 0; let s = quad(6.6, 1.6, 3, 2.4, '#9fb07f') + shadow(7, 2, 2.2, 1.6);
      for (let i = 0; i < tiers; i++) { const ins = i * 0.28, z = i * 24, g = building(7 + ins, 2 + ins, 2.2 - ins * 2, 1.6 - ins * 2, 1, PAL.white, lit, z); s += i < done ? g : `<g opacity=".22">${g}</g>`; }
      const [x, y] = P(8.1, 2.8, 24 * done + 6); return s + (done >= tiers ? `<polygon points="${x - 26},${y} ${x},${y - 18} ${x + 26},${y}" fill="#8f4f3c"/>` : '') + sign(9.3, 3.7, 'ZESORA', '#7a5a2a'); }
    default: { const [gx, gy] = spare; return shadow(gx, gy, 1.2, 1.2) + building(gx, gy, 1.2, 1.2, 2, PAL.cream, 0.5); }
  }
}

function scenery() {
  let s = '';
  // slab and regions
  s += poly([P(0, 24), P(24, 24), up(P(24, 24), -26), up(P(0, 24), -26)], '#8b7a5f') + poly([P(24, 24), P(24, 0), up(P(24, 0), -26), up(P(24, 24), -26)], '#75664f');
  s += quad(0, 0, 24, 24, 'url(#gGrass)');
  s += poly([P(0, 0), P(10.5, 0), P(10.5, 3), P(9.5, 6.5), P(5.5, 8.6), P(0, 9)], 'url(#gNorth)');
  s += poly([P(12.6, 0), P(24, 0), P(24, 15.6), P(20, 16.6), P(13.2, 16.6), P(12.8, 13)], '#d2cbb8') ;
  s += poly([P(24, 15.2), P(24, 24), P(14.6, 24), P(16.4, 22.2), P(19, 21.4), P(20.6, 19), P(22.4, 17.8)], 'url(#gSea)') + `<polyline class="shore" points="${pts([P(14.6, 24), P(16.4, 22.2), P(19, 21.4), P(20.6, 19), P(22.4, 17.8), P(24, 15.2)])}" fill="none" stroke="#f1ead6" stroke-width="5" stroke-linejoin="round" opacity=".8"/>`;
  s += poly([P(24, 24), P(24, 15.2), up(P(24, 15.2), -26), up(P(24, 24), -26)], '#5f8a9c') + poly([P(14.6, 24), P(24, 24), up(P(24, 24), -26), up(P(14.6, 24), -26)], '#6f9bad');
  [[18, 22.6], [21, 19.6], [22.6, 22.4], [20, 23.2]].forEach(([x, y], i) => { const [px, py] = P(x, y); s += `<path class="wave" data-i="${i}" d="M${px - 16},${py} q8,-5 16,0 t16,0" stroke="#fff" stroke-width="1.5" fill="none" opacity=".45"/>`; });
  // village soil, lahore blocks
  s += quad(0.2, 14.6, 10, 9, '#a9b77f', 'opacity=".5"') + quad(6.6, 20, 3.9, 3.9, '#b3a37f', 'opacity=".55"') + quad(0.1, 9.1, 4, 4, '#b3a37f', 'opacity=".55"');
  [[14, 0.6, 4.2, 2.7], [20.2, 7, 3.6, 2.9], [14.7, 5.6, 3.6, 2.5], [13.4, 8.9, 2.8, 2.7], [14.9, 13.3, 8.6, 2.7]].forEach(([x, y, w, d]) => (s += quad(x, y, w, d, '#c7bfa9', 'stroke="#b9b09a" stroke-width="1"')));
  return s;
}
function mountains() { return mountain(1.2, 1.2, 190, 150) + mountain(3.6, 0.6, 230, 190) + mountain(6.2, 0.5, 200, 160) + mountain(0.6, 3.4, 170, 120) + mountain(9, 0.8, 150, 105, false) + mountain(0.8, 6.4, 130, 80, false); }
const DECOR = () => [pine(1.6, 5.4), pine(2.4, 6.6, 0.9), pine(5.6, 2.6, 1.1), pine(6, 5.2), pine(5.2, 6.8, 0.8), pine(9.4, 2.2, 0.9), pine(0.6, 8, 0.8), pine(7.6, 6.4, 0.9), pine(10, 4.6, 0.8),
  tree(1, 15.2), tree(7.6, 14.4, 1.1), tree(9.4, 16.4), tree(1.2, 21.6, 1.1), tree(5, 22.6), tree(10.6, 14.6, 0.9), tree(6.4, 13.2, 0.9), tree(10.8, 9.4), tree(8.2, 10.6, 0.9), tree(13, 18.4), tree(14.6, 20.4, 0.9), tree(11, 22.6),
  tree(18.4, 2, 0.8), tree(23.2, 4.4, 0.8), tree(13.6, 5.4, 0.8), tree(23.3, 13.2, 0.8), tree(18.6, 10.4, 0.8), tree(18.4, 6.4, 0.8), tree(23.4, 6.4, 0.8), tree(13.4, 14.6, 0.8), tree(18, 14.4, 0.8)];
function treasury(chg) {
  const x0 = 11, y0 = 11; let s = shadow(x0 - 0.2, y0 - 0.2, 2.5, 2.5) + box(x0 - 0.35, y0 - 0.35, 2.7, 2.7, 6, PAL.stone) + box(x0 - 0.18, y0 - 0.18, 2.36, 2.36, 6, PAL.stone, 6) + box(x0, y0, 2, 2, 50, PAL.stone, 12);
  const col = (a, b, n) => { let o = ''; for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; o += `<rect x="${p[0] - 3}" y="${p[1] - 58}" width="6" height="44" fill="#faf7ef" stroke="#cfc7b3" stroke-width=".6"/>`; } return o; };
  s += poly([P(x0 + 0.1, y0 + 2, 16), P(x0 + 1.9, y0 + 2, 16), P(x0 + 1.9, y0 + 2, 56), P(x0 + 0.1, y0 + 2, 56)], '#3b4a44') + poly([P(x0 + 2, y0 + 1.9, 16), P(x0 + 2, y0 + 0.1, 16), P(x0 + 2, y0 + 0.1, 56), P(x0 + 2, y0 + 1.9, 56)], '#2f3d38');
  s += col(P(x0, y0 + 2.05), P(x0 + 2, y0 + 2.05), 5) + col(P(x0 + 2.05, y0 + 2), P(x0 + 2.05, y0), 5) + box(x0 - 0.1, y0 - 0.1, 2.2, 2.2, 8, PAL.stone, 62);
  const [cx, cy] = P(x0 + 1, y0 + 1, 70);
  s += `<ellipse cx="${cx}" cy="${cy}" rx="34" ry="17" fill="#e7e0d0"/><path d="M${cx - 30},${cy} a30,34 0 0 1 60,0 z" fill="#c9a24b"/><path d="M${cx},${cy - 34} a30,34 0 0 1 30,34 l-30,0 z" fill="#a8842f" opacity=".55"/>
    <line x1="${cx}" y1="${cy - 34}" x2="${cx}" y2="${cy - 70}" stroke="#6b5a3a" stroke-width="2"/><path class="flag" d="M${cx},${cy - 70} l34,5 l-34,13 z" fill="#1f4d3a"/><text x="${cx}" y="${cy + 31}" text-anchor="middle" class="w-khas">KHAS</text>`;
  return s;
}

// ---------- view ----------
const view = { period: 'year', k: 1, x: 0, y: 0, raf: 0, parts: [], open: null };
const motionOff = () => { try { if (localStorage.getItem('khas_motion') === 'off') return true; } catch { /* ignore */ } return window.matchMedia('(prefers-reduced-motion: reduce)').matches; };
export function stopWorld() { cancelAnimationFrame(view.raf); view.raf = 0; view.parts = []; if (window.gsap) window.gsap.killTweensOf('.world *'); }

export function renderWorld(main) {
  stopWorld();
  const range = periodRange(view.period), list = units(), used = {};
  const items = list.map((u) => {
    const region = (KINDS[u.kind] || KINDS.other).region; let spot = SPOTS[u.kind], spare = null;
    if (!spot || used[u.kind]) { const pool = SPARE[region] || SPARE.lahore, i = (used['s' + region] = (used['s' + region] || 0) + 1) - 1; if (i >= pool.length) return null; spare = pool[i]; spot = { a: [spare[0] + 0.6, spare[1] + 1.3], lab: [spare[0] + 0.8, spare[1] + 1.9] }; }
    used[u.kind] = true; return { u, spot, spare, m: model(u, range) };
  }).filter(Boolean);
  const maxIn = Math.max(...items.map((i) => i.m.income), 1), maxEx = Math.max(...items.map((i) => i.m.expense), 1);
  const roads = items.map((i) => `<path d="${pathD(roadPts(i.spot.a))}"/>`).join('');
  const sorted = [...items].sort((a, b) => (a.spot.a[0] + a.spot.a[1]) - (b.spot.a[0] + b.spot.a[1]));
  const label = (i) => { const [x, y] = P(i.spot.lab[0], i.spot.lab[1]), w = Math.max(i.u.name.length * 6.9, 76) + 22, net = i.m.net;
    return `<g class="wl" data-unit="${esc(i.u.id)}" transform="translate(${x.toFixed(1)},${(y + 6).toFixed(1)})"><rect x="${-w / 2}" y="0" width="${w}" height="37" rx="9"/><text y="15" text-anchor="middle" class="wl-n">${esc(i.u.name)}</text><text y="30" text-anchor="middle" class="wl-v">${net || i.m.income ? (net >= 0 ? '+' : '−') + moneyShort(Math.abs(net)).replace('Rs ', 'Rs ') : esc(i.m.headline || '—')}</text></g>`; };
  const stocksM = (items.find((i) => i.u.kind === 'stocks') || { m: {} }).m;
  const off = motionOff();

  main.innerHTML = `<div class="world${off ? ' still' : ''}" id="world">
    <svg id="wsvg" role="application" aria-label="KHAS World: interactive map of all businesses"><defs>
      <linearGradient id="gGrass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a3b67f"/><stop offset="1" stop-color="#8ea56c"/></linearGradient>
      <linearGradient id="gNorth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7f9478"/><stop offset="1" stop-color="#94a97c"/></linearGradient>
      <linearGradient id="gSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86b3c2"/><stop offset="1" stop-color="#6c9db0"/></linearGradient>
      <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe9ea"/><stop offset="1" stop-color="#f1eee3"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#gSky)"/>
      <g id="wroot"><g class="clouds">${[[230, 150, 1], [1250, 120, 1.2], [1420, 330, 0.8], [90, 420, 0.9]].map(([x, y, s]) => `<g class="cloud" transform="translate(${x},${y}) scale(${s})"><ellipse cx="0" cy="0" rx="46" ry="13" fill="#fff" opacity=".75"/><ellipse cx="-16" cy="-9" rx="22" ry="12" fill="#fff" opacity=".75"/><ellipse cx="14" cy="-11" rx="26" ry="14" fill="#fff" opacity=".75"/></g>`).join('')}</g>
        ${scenery()}${mountains()}
        <g class="roads" fill="none" stroke-linejoin="round" stroke-linecap="round"><g stroke="#8f8468" stroke-width="15" opacity=".5">${roads}</g><g stroke="#c9bd9f" stroke-width="12">${roads}</g><g stroke="#f4eedd" stroke-width="1.2" stroke-dasharray="7 7" opacity=".9">${roads}</g></g>
        <g id="flowPaths" fill="none" stroke="none">${items.map((i) => `<path id="rp-${esc(i.u.id)}" d="${pathD(roadPts(i.spot.a))}"/>`).join('')}</g>
        <g id="coins"></g>
        ${DECOR().join('')}
        ${sorted.filter((i) => i.spot.a[0] + i.spot.a[1] < 2 * C + 1).map((i) => `<g class="wu" data-unit="${esc(i.u.id)}" tabindex="0" role="button" aria-label="${esc(i.u.name)}">${sprite(i.u, i.m, i.spare)}</g>`).join('')}
        <g class="wt">${treasury(stocksM.chg)}</g>
        ${sorted.filter((i) => i.spot.a[0] + i.spot.a[1] >= 2 * C + 1).map((i) => `<g class="wu" data-unit="${esc(i.u.id)}" tabindex="0" role="button" aria-label="${esc(i.u.name)}">${sprite(i.u, i.m, i.spare)}</g>`).join('')}
        <g class="labels">${items.map(label).join('')}</g>
        ${[['NORTHERN AREAS', 4.6, 0.2], ['LAHORE', 19, -0.6], ['VILLAGE', -0.6, 18], ['PORT', 23.4, 21]].map(([t, gx, gy]) => { const [x, y] = P(gx, gy); return `<text class="w-region" x="${x}" y="${y}" text-anchor="middle">${t}</text>`; }).join('')}
      </g></svg>
    <div class="w-top"><div class="w-title"><b>KHAS World</b><span>${esc(range.label)} · tap a business</span></div>${seg('wper', [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']], view.period)}</div>
    <div class="w-zoom"><button class="iconbtn" data-z="in" aria-label="Zoom in">+</button><button class="iconbtn" data-z="out" aria-label="Zoom out">−</button><button class="iconbtn" data-z="fit" aria-label="Fit map">⤢</button></div>
    <div class="w-legend"><span><i class="coin"></i>Income flowing to KHAS</span><span><i class="coin out"></i>Expenses flowing out</span><span><i class="win"></i>Lit windows = occupied</span>
      <label class="check"><input type="checkbox" id="wMotion"${off ? ' checked' : ''}> Reduce motion</label></div>
    <div class="w-tip" id="wtip" hidden></div><aside class="w-drawer" id="wdrawer" hidden></aside></div>`;

  const wrap = $('#world', main), svg = $('#wsvg', main), root = $('#wroot', main);
  const apply = () => root.setAttribute('transform', `translate(${view.x.toFixed(1)},${view.y.toFixed(1)}) scale(${view.k.toFixed(4)})`);
  const fit = () => { const r = svg.getBoundingClientRect(); view.k = clamp(Math.min(r.width / W, r.height / (HGT - 40)), 0.5, 1.5); if (r.width < 700) view.k = clamp(r.height / 1250, 0.5, 0.9); view.x = r.width / 2 - (W / 2) * view.k; view.y = r.height / 2 - (HGT / 2 + 10) * view.k; apply(); };
  const zoomAt = (cx, cy, f) => { const k = clamp(view.k * f, 0.35, 3.2), r = k / view.k; view.x = cx - (cx - view.x) * r; view.y = cy - (cy - view.y) * r; view.k = k; apply(); };
  fit();
  // pan / pinch / wheel
  const ptrs = new Map(); let moved = 0, pinch = 0, downUnit = null;
  svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; const g = e.target.closest('[data-unit]'); downUnit = g ? g.dataset.unit : null; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  svg.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) { hover(e); return; }
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { view.x += e.clientX - prev[0]; view.y += e.clientY - prev[1]; moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]); apply(); }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), r = svg.getBoundingClientRect(); if (pinch) zoomAt((a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top, d / pinch); pinch = d; moved += 10; }
  });
  const end = (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); pinch = 0; if (e.type === 'pointerup' && moved < 7 && downUnit) openDrawer(downUnit); else if (e.type === 'pointerup' && moved < 7) closeDrawer(); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 0.89); }, { passive: false });
  svg.addEventListener('keydown', (e) => { const g = e.target.closest && e.target.closest('[data-unit]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDrawer(g.dataset.unit); } });
  $$('[data-z]', wrap).forEach((b) => (b.onclick = () => { const r = svg.getBoundingClientRect(); if (b.dataset.z === 'fit') fit(); else zoomAt(r.width / 2, r.height / 2, b.dataset.z === 'in' ? 1.25 : 0.8); }));
  $$('[data-seg=wper] button', wrap).forEach((b) => (b.onclick = () => { view.period = b.dataset.v; renderWorld(main); }));
  $('#wMotion', wrap).onchange = (e) => { try { localStorage.setItem('khas_motion', e.target.checked ? 'off' : 'on'); } catch { /* ignore */ } renderWorld(main); };

  const tip = $('#wtip', wrap);
  function hover(e) {
    const g = e.target.closest('[data-unit]'); if (!g || e.pointerType === 'touch') { tip.hidden = true; return; }
    const i = items.find((x) => x.u.id === g.dataset.unit), r = wrap.getBoundingClientRect();
    tip.innerHTML = `<b>${esc(i.u.name)}</b><span>${esc(i.m.headline || KINDS[i.u.kind].label)}</span><span>Net ${range.label}: ${money(i.m.net)}</span>`; tip.hidden = false;
    tip.style.left = clamp(e.clientX - r.left + 14, 8, r.width - 210) + 'px'; tip.style.top = clamp(e.clientY - r.top + 14, 8, r.height - 80) + 'px';
  }
  svg.addEventListener('pointerleave', () => (tip.hidden = true));

  const drawer = $('#wdrawer', wrap);
  function closeDrawer() { drawer.hidden = true; view.open = null; $$('.wu.sel,.wl.sel', wrap).forEach((n) => n.classList.remove('sel')); }
  function openDrawer(id) {
    const i = items.find((x) => x.u.id === id); if (!i) return; view.open = id; tip.hidden = true;
    $$('.wu,.wl', wrap).forEach((n) => n.classList.toggle('sel', n.dataset.unit === id));
    const months = monthsBack(today().slice(0, 7), 12), ms = monthly(entries(), accounts(), months, id), last = entries().filter((e) => e.unit === id).slice(0, 5);
    drawer.innerHTML = `<div class="wd-h"><div><span class="badge">${esc(KINDS[i.u.kind].label)}</span><h2>${esc(i.u.name)}</h2><p class="small muted">${esc(i.u.place || '')}</p></div><button class="iconbtn" data-x aria-label="Close">${icon('close')}</button></div>
      <div class="wd-k"><div><span>Income</span><b>${moneyShort(i.m.income)}</b></div><div><span>Expenses</span><b>${moneyShort(i.m.expense)}</b></div><div><span>Net</span><b class="${i.m.net < 0 ? 'neg' : 'pos'}">${moneyShort(i.m.net)}</b></div></div>
      <p class="small muted" style="margin:.2rem 0 .6rem">${esc(range.label)}${i.m.headline ? ' · ' + esc(i.m.headline) : ''}${i.m.value ? ' · worth ' + moneyShort(i.m.value) : ''}</p>
      <div class="wd-spark"><span class="small muted">Net, last 12 months</span>${spark(ms.map((x) => x.net), 250, 44)}</div>
      <h3>Latest entries</h3>${last.length ? `<ul class="wd-list">${last.map((e) => `<li data-e="${esc(e.id)}"><span>${esc(e.memo || e.type)}<small>${fmtDate(e.date)}</small></span><b class="${e.type === 'income' ? 'pos' : ''}">${e.type === 'income' ? '+' : ''}${moneyShort(e.amount)}</b></li>`).join('')}</ul>` : '<p class="small muted">No entries yet.</p>'}
      <div class="actions"><a class="btn" href="#/unit/${esc(id)}">Open business</a>${canWrite() ? '<button class="btn primary" data-add>Add entry</button>' : ''}</div>`;
    drawer.hidden = false;
    $('[data-x]', drawer).onclick = closeDrawer; const add = $('[data-add]', drawer); if (add) add.onclick = () => openEntry({ unit: id });
    $$('[data-e]', drawer).forEach((li) => (li.onclick = () => showEntry(li.dataset.e)));
  }
  if (view.open) openDrawer(view.open);
  if (off) return;

  // ---- money flow particles ----
  const coins = $('#coins', wrap), NS = 'http://www.w3.org/2000/svg';
  items.forEach((i) => {
    const path = document.getElementById('rp-' + i.u.id); if (!path) return; const len = path.getTotalLength();
    const mk = (n, out) => { for (let k = 0; k < n; k++) { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', out ? 3.4 : 4.6); c.setAttribute('class', out ? 'coin out' : 'coin'); coins.appendChild(c); view.parts.push({ c, path, len, t: k / n + (out ? 0.5 / n : 0), out, speed: (out ? 62 : 74) / len }); } };
    if (i.m.income > 0) mk(clamp(Math.round(1 + 5 * Math.sqrt(i.m.income / maxIn)), 1, 6), false);
    if (i.m.expense > 0) mk(clamp(Math.round(1 + 3 * Math.sqrt(i.m.expense / maxEx)), 1, 4), true);
  });
  let lastT = 0;
  const tick = (now) => {
    if (!document.getElementById('world')) { view.raf = 0; return; }
    const dt = Math.min(0.05, (now - (lastT || now)) / 1000); lastT = now;
    if (!document.hidden) for (const p of view.parts) { p.t = (p.t + dt * p.speed) % 1; const pt = p.path.getPointAtLength((p.out ? 1 - p.t : p.t) * p.len); p.c.setAttribute('cx', pt.x); p.c.setAttribute('cy', pt.y); p.c.setAttribute('opacity', Math.min(1, p.t * 8, (1 - p.t) * 8)); }
    view.raf = requestAnimationFrame(tick);
  };
  view.raf = requestAnimationFrame(tick);

  // ---- ambient animation (GSAP) ----
  const g = window.gsap; if (!g) return;
  $$('.sheep-in', wrap).forEach((n, i) => { g.to(n, { x: (i % 2 ? -1 : 1) * (10 + (i * 7) % 16), duration: 3 + (i * 1.3) % 4, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: (i * 0.7) % 3 }); g.to(n, { y: -2.5, duration: 0.45, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: i * 0.21 }); });
  $$('.tuft', wrap).forEach((n, i) => g.to(n, { rotation: 7, transformOrigin: '50% 100%', duration: 1.4 + (i % 5) * 0.15, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: (i % 7) * 0.12 }));
  $$('.ring', wrap).forEach((n) => g.fromTo(n, { attr: { r: 6 }, opacity: 0.9 }, { attr: { r: 46 }, opacity: 0, duration: 2.4, repeat: -1, ease: 'power1.out', delay: Number(n.dataset.i) * 0.8 }));
  g.to($$('.blink', wrap), { opacity: 0.15, duration: 0.7, repeat: -1, yoyo: true }); g.to($$('.glow', wrap), { opacity: 0.08, duration: 1.1, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  $$('.jib', wrap).forEach((n) => g.to(n, { rotation: 9, svgOrigin: n.dataset.o, duration: 5, repeat: -1, yoyo: true, ease: 'sine.inOut' }));
  $$('.hook', wrap).forEach((n) => g.to(n, { y: -22, duration: 3, repeat: -1, yoyo: true, ease: 'sine.inOut' })); $$('.hookline', wrap).forEach((n) => g.to(n, { attr: { y2: '-=22' }, duration: 3, repeat: -1, yoyo: true, ease: 'sine.inOut' }));
  $$('.ship-in', wrap).forEach((n) => g.to(n, { y: 2.5, rotation: 1.2, transformOrigin: '50% 50%', duration: 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut' }));
  $$('.ship.sailing .ship-in', wrap).forEach((n) => g.timeline({ repeat: -1, repeatDelay: 2 }).to(n, { x: 150, y: 76, opacity: 0, duration: 9, ease: 'power1.in', delay: 2 }).set(n, { x: -90, y: -44 }).to(n, { x: 0, y: 0, opacity: 1, duration: 6, ease: 'power1.out' }));
  $$('.smoke', wrap).forEach((n) => g.fromTo(n, { y: 0, opacity: 0.55, scale: 1 }, { y: -18, opacity: 0, scale: 2, transformOrigin: '50% 50%', duration: 2.4, repeat: -1 }));
  $$('.wave', wrap).forEach((n) => g.to(n, { x: 12, opacity: 0.1, duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: Number(n.dataset.i) * 0.5 }));
  $$('.cloud', wrap).forEach((n, i) => g.to(n, { x: '+=' + (60 + i * 25), duration: 40 + i * 9, repeat: -1, yoyo: true, ease: 'none' }));
  $$('.flag', wrap).forEach((n) => g.to(n, { skewY: 6, scaleX: 0.92, transformOrigin: '0% 50%', duration: 0.9, repeat: -1, yoyo: true, ease: 'sine.inOut' }));
  $$('.lit', wrap).forEach((n, i) => { if (i % 9 === 0) g.to(n, { opacity: 0.45, duration: 1.5 + (i % 4), repeat: -1, yoyo: true, delay: (i % 11) * 0.4 }); });
}
