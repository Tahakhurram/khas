// Data layer. Owners: khas-data (everything) + khas-inbox (staff submissions) + hostel-data (read only).
// Staff: khas-inbox only. Demo mode keeps everything in memory and never saves.
import { gh } from './github.js';
import { FILES, migrate } from './seed.js';
import { hostelEntries } from './calc.js';
import { validate, isLocked, totals, monthly } from './engine.js';
import { uid, today, monthsBack, addDays } from './util.js';

export const S = {
  auth: null,          // { username, name, role:'owner'|'staff', token, hostelToken, owner, repos }
  db: {},              // meta, units, accounts, parties, assets, schedules, rentals, livestock, crops, exports, stocks, projects
  ledger: {},          // year -> { entries: [] }
  hostels: [],         // [{ hostelId, unit, name, data }]
  hostelError: '',
  inbox: { config: { assign: {}, units: [], categories: { income: [], expense: [] } }, subs: {}, views: {} },
  demo: false, offline: false,
};
const shas = {};
let data = null, inbox = null, hostel = null, cache = null;
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const changed = () => { cache = null; listeners.forEach((f) => f()); saveSnapshotSoon(); };

export const isOwner = () => S.auth && S.auth.role === 'owner';
export const canWrite = () => !S.offline;
const who = () => `[${S.auth.username}]`;

// ---------- memory backend (demo) ----------
function memoryRepo(files = {}) {
  return {
    repo: 'demo', files,
    async check() { return { canWrite: true }; },
    async read(p) { return files[p] ? { data: JSON.parse(JSON.stringify(files[p])), sha: 'm' } : null; },
    async list(p) { return Object.keys(files).filter((k) => k.startsWith(p + '/')).map((k) => k.slice(p.length + 1)); },
    async write(p, d) { files[p] = JSON.parse(JSON.stringify(d)); return 'm'; },
    async writeBinary(p, b) { files[p] = b; return 'm'; },
    async readBinary(p) { return files[p] || null; },
  };
}

// ---------- boot ----------
export async function connect(auth, demoFiles) {
  S.auth = auth; S.demo = !!demoFiles; S.offline = false;
  if (demoFiles) { data = memoryRepo(demoFiles.data); inbox = memoryRepo(demoFiles.inbox); hostel = memoryRepo(demoFiles.hostel); return; }
  const r = auth.repos || {};
  inbox = gh({ owner: auth.owner, repo: r.inbox, token: auth.token });
  if (auth.role === 'owner') {
    data = gh({ owner: auth.owner, repo: r.data, token: auth.token });
    hostel = r.hostel ? gh({ owner: auth.owner, repo: r.hostel, token: auth.hostelToken || auth.token }) : null;
  }
  // A network failure here is fine: loadAll() then falls back to the offline copy.
  try { await (auth.role === 'owner' ? data : inbox).check(); } catch (e) { if (!(e instanceof TypeError)) throw e; }
}

async function loadFile(name) {
  const r = await data.read(`${name}.json`);
  S.db[name] = migrate(name, r ? r.data : {}); shas[name] = r ? r.sha : null;
}
async function loadYear(y) {
  const r = await data.read(`ledger/${y}.json`);
  S.ledger[y] = r ? r.data : { entries: [] }; shas['ledger/' + y] = r ? r.sha : null;
}
async function loadHostels() {
  S.hostels = []; S.hostelError = '';
  if (!hostel) return;
  try {
    const m = await hostel.read('hostels.json'); if (!m) return;
    const linked = S.db.units.units.filter((u) => u.hostelId);
    await Promise.all(m.data.hostels.map(async (h) => {
      const u = linked.find((x) => x.hostelId === h.id); if (!u) return;
      const r = await hostel.read(`hostels/${h.id}.json`);
      if (r) S.hostels.push({ hostelId: h.id, unit: u.id, name: h.name, data: r.data });
    }));
    S.hostelList = m.data.hostels;
  } catch (e) { S.hostelError = e.message; }
}
async function loadInbox() {
  const c = await inbox.read('config.json');
  if (c) { S.inbox.config = { assign: {}, units: [], categories: { income: [], expense: [] }, ...c.data }; shas['inbox/config'] = c.sha; }
  const users = isOwner() ? (await inbox.list('submissions')).map((f) => f.replace(/\.json$/, '')) : [S.auth.username];
  await Promise.all(users.map(async (u) => {
    const r = await inbox.read(`submissions/${u}.json`);
    S.inbox.subs[u] = r ? r.data.items || [] : []; shas['inbox/subs/' + u] = r ? r.sha : null;
  }));
  if (!isOwner()) {
    await Promise.all((S.inbox.config.assign[S.auth.username] || []).map(async (unit) => {
      const r = await inbox.read(`staff-view/${unit}.json`); if (r) S.inbox.views[unit] = r.data;
    }));
  }
}

export async function loadAll() {
  try {
    if (isOwner()) {
      await Promise.all(Object.keys(FILES).map(loadFile));
      const years = (await data.list('ledger')).map((f) => f.replace(/\.json$/, '')).filter((y) => /^\d{4}$/.test(y));
      S.ledger = {}; await Promise.all(years.map(loadYear));
      await Promise.all([loadHostels(), loadInbox()]);
    } else await loadInbox();
    cache = null; saveSnapshotSoon();
  } catch (err) {
    if (err instanceof TypeError && await loadSnapshot()) { S.offline = true; cache = null; return; } // no network: show last copy, read only
    throw err;
  }
}

// ---------- reading ----------
// All entries: saved ones plus the live hostel feed (virtual, never saved).
export function entries() {
  if (!cache) {
    const real = Object.values(S.ledger).flatMap((y) => y.entries);
    cache = real.concat(hostelEntries(S.hostels)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.at || '').localeCompare(a.at || '')));
  }
  return cache;
}
export const accounts = () => S.db.accounts.accounts;
export const units = (all) => S.db.units.units.filter((u) => all || !u.archived);
export const unit = (id) => S.db.units.units.find((u) => u.id === id);
export const account = (id) => accounts().find((a) => a.id === id);
export const party = (id) => S.db.parties.parties.find((p) => p.id === id);
export const accName = (id) => (account(id) || {}).name || id;
export const unitName = (id) => (unit(id) || {}).name || (id ? id : '—');
export const partyName = (id) => (party(id) || {}).name || '';
export const cashAccounts = () => accounts().filter((a) => a.cashlike && !a.archived);
export const findEntry = (id) => entries().find((e) => e.id === id);

// ---------- writing ----------
export async function save(name, message) {
  if (!canWrite()) throw new Error('You are offline. Changes cannot be saved.');
  try { shas[name] = await data.write(`${name}.json`, S.db[name], shas[name], `${who()} ${message}`); changed(); }
  catch (err) { if (err.conflict) await loadFile(name); changed(); throw err; }
}
async function saveYear(y, message) {
  try { shas['ledger/' + y] = await data.write(`ledger/${y}.json`, S.ledger[y], shas['ledger/' + y], `${who()} ${message}`); }
  catch (err) { if (err.conflict) await loadYear(y); changed(); throw err; }
}
function check(e) {
  const err = validate(e, accounts()); if (err) throw new Error(err);
  if (isLocked(e.date, S.db.meta.lockThrough)) throw new Error(`The books are locked up to ${S.db.meta.lockThrough}. Use a later date, or unlock the period in Settings.`);
}
// Add one or more entries (grouped by year so each year file is saved once).
export async function addEntries(list, message) {
  if (!canWrite()) throw new Error('You are offline. Changes cannot be saved.');
  const years = new Set();
  for (const e of list) {
    e.id = e.id || uid(); e.by = e.by || S.auth.username; e.at = e.at || new Date().toISOString(); e.amount = Math.round(Number(e.amount) || 0);
    Object.keys(e).forEach((k) => (e[k] === '' || e[k] == null) && delete e[k]);
    check(e);
  }
  for (const e of list) { const y = e.date.slice(0, 4); (S.ledger[y] = S.ledger[y] || { entries: [] }).entries.push(e); years.add(y); }
  try { for (const y of years) await saveYear(y, message || `Add ${list.length} entr${list.length > 1 ? 'ies' : 'y'}`); }
  catch (err) { for (const e of list) { const led = S.ledger[e.date.slice(0, 4)]; if (led) led.entries = led.entries.filter((x) => x.id !== e.id); } throw err; }
  changed(); list.forEach((e) => publishStaffView(e.unit));
  return list;
}
export const addEntry = async (e, message) => (await addEntries([e], message || `Add ${e.type}: ${e.memo || ''}`.trim()))[0];
export async function deleteEntry(id) {
  const e = findEntry(id); if (!e || e.virtual) throw new Error('This entry cannot be deleted here.');
  if (isLocked(e.date, S.db.meta.lockThrough)) throw new Error('This entry is in a locked period. Add a reversing entry instead.');
  const y = e.date.slice(0, 4), before = S.ledger[y].entries;
  S.ledger[y].entries = before.filter((x) => x.id !== id);
  try { await saveYear(y, `Delete entry: ${e.memo || e.type}`); } catch (err) { if (!err.conflict) S.ledger[y].entries = before; throw err; }
  changed(); publishStaffView(e.unit);
}
export async function updateEntry(id, next) {
  const old = findEntry(id); if (!old || old.virtual) throw new Error('This entry cannot be edited here.');
  if (isLocked(old.date, S.db.meta.lockThrough)) throw new Error('This entry is in a locked period. Add a reversing entry instead.');
  const e = { ...next, id, by: old.by, at: old.at, editedBy: S.auth.username, editedAt: new Date().toISOString() };
  Object.keys(e).forEach((k) => (e[k] === '' || e[k] == null) && delete e[k]);
  check(e);
  const y0 = old.date.slice(0, 4), y1 = e.date.slice(0, 4);
  S.ledger[y0].entries = S.ledger[y0].entries.filter((x) => x.id !== id);
  (S.ledger[y1] = S.ledger[y1] || { entries: [] }).entries.push(e);
  await saveYear(y1, `Edit entry: ${e.memo || e.type}`); if (y0 !== y1) await saveYear(y0, 'Move entry to another year');
  changed(); publishStaffView(e.unit); if (old.unit !== e.unit) publishStaffView(old.unit);
  return e;
}

// ---------- attachments (receipt photos) ----------
export async function saveAttachment(base64) {
  const id = uid(), repo = isOwner() ? data : inbox;
  await repo.writeBinary(`attachments/${id}.jpg`, base64, `${who()} Add receipt photo`);
  return id;
}
export async function readAttachment(id, fromInbox) {
  const b = await (fromInbox || !isOwner() ? inbox : data).readBinary(`attachments/${id}.jpg`);
  return b ? 'data:image/jpeg;base64,' + b : null;
}

// ---------- staff inbox ----------
export const assignedUnits = (username = S.auth.username) => S.inbox.config.assign[username] || [];
export const allSubmissions = () => Object.entries(S.inbox.subs).flatMap(([u, items]) => items.map((i) => ({ ...i, by: i.by || u }))).sort((a, b) => (a.at < b.at ? 1 : -1));
export const pendingCount = () => (isOwner() ? allSubmissions().filter((s) => s.status === 'pending').length : 0);
async function saveSubs(user, message) {
  const k = 'inbox/subs/' + user;
  try { shas[k] = await inbox.write(`submissions/${user}.json`, { items: S.inbox.subs[user] }, shas[k], `${who()} ${message}`); }
  catch (err) { if (err.conflict) { const r = await inbox.read(`submissions/${user}.json`); S.inbox.subs[user] = r ? r.data.items : []; shas[k] = r ? r.sha : null; } changed(); throw err; }
  changed();
}
export async function submit(sub) {
  const u = S.auth.username; sub.id = uid(); sub.by = u; sub.at = new Date().toISOString(); sub.status = 'pending';
  (S.inbox.subs[u] = S.inbox.subs[u] || []).unshift(sub);
  try { await saveSubs(u, `Submit ${sub.kind}: ${sub.memo || ''}`); } catch (err) { if (!err.conflict) S.inbox.subs[u] = S.inbox.subs[u].filter((x) => x.id !== sub.id); throw err; }
}
export async function withdraw(id) {
  const u = S.auth.username, before = S.inbox.subs[u];
  S.inbox.subs[u] = before.filter((x) => !(x.id === id && x.status === 'pending'));
  try { await saveSubs(u, 'Withdraw a submission'); } catch (err) { if (!err.conflict) S.inbox.subs[u] = before; throw err; }
}
// Owner decision. Approving posts the entry to the ledger first, then marks the submission.
export async function decide(sub, approve, { account: acc, reason } = {}) {
  const item = (S.inbox.subs[sub.by] || []).find((x) => x.id === sub.id);
  if (!item || item.status !== 'pending') throw new Error('This submission has already been handled.');
  if (approve) {
    const lines = sub.kind === 'income' ? [{ acc, dr: sub.amount, cr: 0 }, { acc: sub.category, dr: 0, cr: sub.amount }] : [{ acc: sub.category, dr: sub.amount, cr: 0 }, { acc, dr: 0, cr: sub.amount }];
    const e = await addEntry({ date: sub.date, type: sub.kind, unit: sub.unit, amount: sub.amount, memo: sub.memo, method: sub.method, lines, by: sub.by, approvedBy: S.auth.username, submission: sub.id, inboxAttach: sub.attach, partyText: sub.partyName }, `Approve ${sub.by}'s ${sub.kind}: ${sub.memo || ''}`);
    item.entryId = e.id;
  }
  item.status = approve ? 'approved' : 'rejected'; item.decidedBy = S.auth.username; item.decidedAt = new Date().toISOString(); if (reason) item.reason = reason;
  await saveSubs(sub.by, `${approve ? 'Approve' : 'Reject'} a submission`);
}
// What staff need to fill the form: unit names and category names only.
export async function saveInboxConfig(assign) {
  const cat = (t) => accounts().filter((a) => a.type === t && !a.archived && !['inc-gain', 'exp-loss'].includes(a.id)).map((a) => ({ id: a.id, name: a.name }));
  const cfg = { assign, units: units().map((u) => ({ id: u.id, name: u.name, kind: u.kind })), categories: { income: cat('income'), expense: cat('expense') } };
  shas['inbox/config'] = await inbox.write('config.json', cfg, shas['inbox/config'], `${who()} Update staff access`);
  S.inbox.config = cfg; changed();
  new Set(Object.values(assign).flat()).forEach(publishStaffView);
}
// A trimmed copy of one assigned unit for staff: last 90 days of entries and a few basic numbers. No balances, no other units.
const viewShas = {};
export async function publishStaffView(unitId) {
  if (!isOwner() || !unitId || S.demo || !Object.values(S.inbox.config.assign).some((a) => a.includes(unitId))) return;
  try {
    const from = addDays(today(), -90), es = entries().filter((e) => e.unit === unitId && e.date >= from && ['income', 'expense'].includes(e.type));
    const m = monthly(entries(), accounts(), monthsBack(today().slice(0, 7), 1), unitId)[0];
    const view = {
      unit: unitId, updated: new Date().toISOString(), month: { income: m.income, expense: m.expense },
      entries: es.slice(0, 200).map((e) => ({ date: e.date, type: e.type, amount: e.amount, memo: e.memo || '', by: e.by })),
    };
    const path = `staff-view/${unitId}.json`;
    if (!(unitId in viewShas)) { const r = await inbox.read(path); viewShas[unitId] = r ? r.sha : null; }
    viewShas[unitId] = await inbox.write(path, view, viewShas[unitId], `${who()} Update staff view`);
  } catch { delete viewShas[unitId]; /* best effort: the next save retries */ }
}

// ---------- offline snapshot (encrypted with a key derived from the login's token) ----------
const snapKey = () => 'khas_snap_' + S.auth.username;
async function aesKey() {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('khas-snapshot:' + S.auth.token));
  return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const toB64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let snapTimer = null;
function saveSnapshotSoon() {
  if (S.demo || S.offline || !S.auth) return;
  clearTimeout(snapTimer);
  snapTimer = setTimeout(async () => {
    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const pt = new TextEncoder().encode(JSON.stringify({ db: S.db, ledger: S.ledger, hostels: S.hostels, inbox: S.inbox, at: new Date().toISOString() }));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), pt);
      localStorage.setItem(snapKey(), JSON.stringify({ iv: toB64(iv), ct: toB64(ct) }));
    } catch { /* storage full or unavailable: offline viewing just won't work */ }
  }, 1500);
}
async function loadSnapshot() {
  try {
    const raw = JSON.parse(localStorage.getItem(snapKey())); if (!raw) return false;
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(raw.iv) }, await aesKey(), fromB64(raw.ct));
    const snap = JSON.parse(new TextDecoder().decode(pt));
    S.db = snap.db; S.ledger = snap.ledger; S.hostels = snap.hostels || []; S.inbox = snap.inbox; S.snapshotAt = snap.at;
    return true;
  } catch { return false; }
}
export function clearLocal() { try { Object.keys(localStorage).filter((k) => k.startsWith('khas_snap_')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } }

// Quick headline numbers used by several screens.
export const quick = (opts) => totals(entries(), accounts(), opts);
