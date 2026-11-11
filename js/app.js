// KHAS: app shell. Login, navigation and routing. Static site; data lives in private GitHub repos.
import { S, connect, loadAll, onChange, isOwner, pendingCount, clearLocal, canWrite } from './store.js';
import { allDues } from './calc.js';
import { esc, today, addDays } from './util.js';
import { $, $$, icon, toast, killCharts } from './ui.js';
import { renderWorld, stopWorld } from './world.js';
import { renderOverview, renderInvestments } from './views/overview.js';
import { renderUnits, renderUnit } from './views/units.js';
import { renderLedger, renderReports, renderParties } from './views/books.js';
import { renderCalendar, renderApprovals, renderSettings, renderStaff } from './views/admin.js';
import { openEntry } from './views/entry.js';
import { demoFiles, DEMO_USERS } from './demo.js';

const $app = document.getElementById('app'), AUTH_KEY = 'khas_auth';

// ---------- sign-in: users.json holds each login's GitHub tokens, AES-GCM encrypted with its password ----------
const b64bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function unlock(rec, password, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64bytes(rec.salt), iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64bytes(rec.iv) }, key, b64bytes(rec.ct))));
}
// The decrypted token is kept only for this browser tab (sessionStorage) and is cleared on sign out.
function loadAuth() { try { const a = JSON.parse(sessionStorage.getItem(AUTH_KEY)); return a && a.token ? a : null; } catch { return null; } }
function logout() { try { sessionStorage.removeItem(AUTH_KEY); } catch { /* ignore */ } clearLocal(); location.hash = ''; location.reload(); }

const MARK = '<svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" fill="currentColor"/><path d="M12 10v20M12 21l12-11M17 17l11 13" stroke="var(--mark-ink)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

function renderLogin(error = '') {
  $app.innerHTML = `<div class="login-wrap">
    <div class="login-art"><div class="brand">${MARK}<div><b>KHAS</b><span>Family business system</span></div></div>
      <div><h1>Every business,<br>every rupee,<br>one place.</h1><p>Farm, crops, flats, hostels, land, exports and investments, with complete books behind them.</p></div>
      <p class="small">Private system · authorised family and staff only</p></div>
    <div class="login-form"><form id="loginForm" autocomplete="on"><h2>Sign in</h2><p class="muted" style="margin:0 0 .6rem">Use the username and password you were given.</p>
      ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
      <label>Username <input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></label>
      <label>Password <input name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn primary block" id="loginBtn">Sign in</button>
      <button type="button" class="linkbtn" id="demoLink">Look around with demo data</button></form></div></div>`;
  $('#demoLink').onclick = () => startDemo();
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target), btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const res = await fetch('users.json?t=' + Date.now(), { cache: 'no-store' }).catch(() => fetch('users.json'));
      if (!res.ok) throw new Error('Logins have not been set up yet. Run tools/create_logins.py first.');
      const db = await res.json(), username = String(f.get('username')).trim().toLowerCase(), rec = (db.users || []).find((u) => u.username.toLowerCase() === username);
      let payload; try { if (!rec) throw 0; payload = await unlock(rec, f.get('password'), db.iterations); } catch { throw new Error('Incorrect username or password.'); }
      const auth = { username: rec.username, role: rec.role, name: rec.name || rec.username, ...payload, users: db.users.map((u) => ({ username: u.username, role: u.role, name: u.name || u.username })) };
      await connect(auth);
      try { sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch { /* private mode */ }
      await boot();
    } catch (err) { renderLogin(/Invalid token|401/.test(err.message) ? "This login's access has expired. Ask an owner to renew it." : err.message); }
  };
}

async function startDemo(role = 'owner') {
  const u = DEMO_USERS.find((x) => x.role === role) || DEMO_USERS[2];
  await connect({ username: role === 'owner' ? 'taha' : u.username, role, name: role === 'owner' ? 'Taha Khurram' : u.name, token: 'demo', users: DEMO_USERS }, demoFiles());
  if (!/^#\/\w/.test(location.hash)) location.hash = role === 'owner' ? '#/world' : '#/staff';
  await boot();
}

async function boot() {
  $app.innerHTML = `<div class="loading">${MARK}<p class="muted">Loading KHAS…</p></div>`;
  try { S.userList = S.auth.users || []; await loadAll(); route(); }
  catch (err) {
    if (/401|Invalid token/i.test(err.message)) { try { sessionStorage.removeItem(AUTH_KEY); } catch { /* ignore */ } return renderLogin("This login's access has expired. Ask an owner to renew it."); }
    $app.innerHTML = `<div class="loading"><p class="error">${esc(err.message)}</p><div class="actions" style="justify-content:center"><button class="btn" id="retry">Try again</button><button class="btn" id="out">Sign out</button></div></div>`;
    $('#retry').onclick = boot; $('#out').onclick = logout;
  }
}

// ---------- shell ----------
const NAV = [['world', 'KHAS World', 'world'], ['overview', 'Overview', 'overview'], ['units', 'Businesses', 'units'], ['ledger', 'Ledger', 'ledger'], ['reports', 'Reports', 'reports'], ['invest', 'Investments', 'invest'], ['calendar', 'Calendar', 'calendar'], ['parties', 'People', 'parties'], ['approvals', 'Approvals', 'approvals'], ['settings', 'Settings', 'settings']];
const MOBILE = ['world', 'overview', 'ledger'];
function badgeFor(id) {
  if (id === 'approvals') return pendingCount();
  if (id === 'calendar') return allDues(S.db, addDays(today(), -120), today()).filter((d) => !d.paid).length;
  return 0;
}
function shell(active, wide) {
  const owner = isOwner(), a = S.auth, bd = (id) => { const n = owner ? badgeFor(id) : 0; return n ? `<span class="count">${n}</span>` : ''; };
  const banner = S.demo ? '<div class="banner">Demo data. Nothing here is real and nothing is saved. <button class="linkbtn" id="exitDemo">Exit demo</button></div>'
    : S.offline ? `<div class="banner warn">You are offline. Showing the last copy${S.snapshotAt ? ' from ' + new Date(S.snapshotAt).toLocaleString('en-GB') : ''}. Changes cannot be saved.</div>` : '';
  $app.innerHTML = `<div class="shell${owner ? '' : ' staff'}">
    <aside class="side noprint"><a class="brand" href="#/${owner ? 'world' : 'staff'}">${MARK}<div><b>KHAS</b><span>${owner ? 'Family business system' : 'Staff entry'}</span></div></a>
      <nav class="nav" aria-label="Main">${owner ? NAV.map(([id, label, ic]) => `<a href="#/${id}" class="${id === active ? 'active' : ''}">${icon(ic)}<span>${label}</span>${bd(id)}</a>`).join('') : `<a href="#/staff" class="active">${icon('ledger')}<span>My entries</span></a>`}</nav>
      <div class="side-foot"><div class="user"><div class="avatar">${esc((a.name || a.username).split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase())}</div><div><b>${esc(a.name || a.username)}</b><span>${owner ? 'Owner' : 'Staff'}</span></div></div>
        <button class="btn sm block" id="refresh">${icon('refresh')} Refresh data</button><button class="btn sm block" id="logout">${icon('logout')} Sign out</button></div></aside>
    <div class="content">${banner}<main id="main" class="${wide ? 'wide' : ''}"></main></div>
    ${owner ? `<nav class="tabbar noprint" aria-label="Main">${MOBILE.slice(0, 2).map((id) => { const n = NAV.find((x) => x[0] === id); return `<a href="#/${id}" class="${id === active ? 'active' : ''}">${icon(n[2])}<span>${id === 'world' ? 'World' : n[1]}</span></a>`; }).join('')}
      <button class="fab" id="fab" aria-label="Add entry">${icon('plus')}</button>
      <a href="#/ledger" class="${active === 'ledger' ? 'active' : ''}">${icon('ledger')}<span>Ledger</span></a><a href="#/more" class="${!MOBILE.includes(active) ? 'active' : ''}">${icon('more')}<span>More</span>${pendingCount() ? '<span class="count">' + pendingCount() + '</span>' : ''}</a></nav>` : `<div class="tabbar noprint staffbar"><span>${esc(a.name || a.username)}</span><button class="btn sm" id="logout2">Sign out</button></div>`}</div>`;
  $('#logout').onclick = logout; const l2 = $('#logout2'); if (l2) l2.onclick = logout;
  $('#refresh').onclick = async (e) => { e.currentTarget.disabled = true; if (S.demo) { toast('Demo data does not change'); route(); return; } try { await loadAll(); toast('Up to date'); } catch (err) { toast(err.message, true); } route(); };
  const fab = $('#fab'); if (fab) fab.onclick = () => openEntry({});
  const ex = $('#exitDemo'); if (ex) ex.onclick = () => { location.hash = ''; location.reload(); };
  return $('#main');
}

function renderMore(main) {
  main.innerHTML = `<div class="page-h"><div><h1>More</h1></div></div><div class="grid more-grid">${NAV.filter(([id]) => !MOBILE.includes(id)).map(([id, label, ic]) => `<a class="card more-card" href="#/${id}">${icon(ic)}<b>${label}</b>${badgeFor(id) ? `<span class="count">${badgeFor(id)}</span>` : ''}</a>`).join('')}</div>
    <div class="section"><button class="btn block" id="mOut">${icon('logout')} Sign out (${esc(S.auth.name || S.auth.username)})</button></div>`;
  $('#mOut', main).onclick = logout;
}

let scrollKey = '';
function route() {
  if (!S.auth) return renderLogin();
  killCharts(); stopWorld();
  const [path, query] = (location.hash.replace(/^#\/?/, '') || (isOwner() ? 'world' : 'staff')).split('?'), parts = path.split('/'), params = Object.fromEntries(new URLSearchParams(query || ''));
  if (!isOwner()) { renderStaff(shell('staff')); return; }
  const page = parts[0], active = page === 'unit' ? 'units' : NAV.some((n) => n[0] === page) ? page : page === 'more' ? 'more' : 'world';
  const y = scrollKey === location.hash ? window.scrollY : 0; scrollKey = location.hash;
  const main = shell(active, page === 'world' || active === 'world' && page !== 'more');
  const hooks = { startDemo: () => startDemo('owner') };
  ({ world: () => renderWorld(main), overview: () => renderOverview(main), units: () => renderUnits(main), unit: () => renderUnit(main, parts[1]), ledger: () => renderLedger(main, query != null ? params : {}), reports: () => renderReports(main, parts[1], params),
    invest: () => renderInvestments(main), calendar: () => renderCalendar(main), parties: () => renderParties(main), approvals: () => renderApprovals(main), settings: () => renderSettings(main, hooks), more: () => renderMore(main) }[page] || (() => renderWorld(main)))();
  window.scrollTo(0, y);
}
window.addEventListener('hashchange', route);
let pendingRender = 0;
onChange(() => { if (!S.auth || !$('#main')) return; clearTimeout(pendingRender); pendingRender = setTimeout(route, 30); }); // re-draw the current page after any save

// ---------- start ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
(async () => {
  const demo = /[?&#]demo(=(\w+))?/.exec(location.search + location.hash);
  if (demo) return startDemo(demo[2] === 'staff' ? 'staff' : 'owner');
  const saved = loadAuth();
  if (!saved) return renderLogin();
  try { await connect(saved); await boot(); } catch (err) { renderLogin(/Invalid token|401/.test(err.message) ? "This login's access has expired. Ask an owner to renew it." : ''); }
})();
