# KHAS

Private family business system: one place for every KHAS business, with complete books behind it and an animated map on top. A static site on GitHub Pages. No server, no database, no paid services.

## What is in it

- **KHAS World**: an isometric map of every business. Sheep count follows the herd, windows light up with occupancy, the crane builds Hostel 2 as its % complete rises, the tower glows before its yearly rent is due, coins flow along the roads in proportion to income and expenses. Tap a business for its numbers.
- **Books**: double entry behind simple forms (income, expense, transfer, asset purchase and sale, instalments, loans, deposits, drawings, journal). Profit & loss, balance sheet, cash book, day book, trial balance, receivables ageing, instalments and dues. Excel export and print-to-PDF for every report.
- **Business pages**: Dumba herd, crop seasons, Batai / Theka agreements, export orders, flats and tenants, tower contract, hostels (live from the hostel app), construction and build-and-sell projects, stocks, land and the Zesora instalment plan.
- **Calendar**, **People** (who owes whom), **Investments and returns**, **Approvals**, Excel **import / export**.

## How it works

| Repo | Visibility | Holds |
|---|---|---|
| `khas` (this one) | public, for free GitHub Pages | the app code and `users.json` (encrypted tokens only) |
| `khas-data` | **private** | all the books and records, as JSON. Every save is a commit tagged with the username, so the history is the audit log. |
| `khas-inbox` | **private** | entries sent in by staff, waiting for approval, plus the small read-only views staff are allowed to see |
| `hostel-data` | private, existing | read by KHAS, never written |

- **Sign-in**: username and password. `users.json` holds each login's GitHub tokens encrypted with its password (PBKDF2-SHA256, 600k iterations, then AES-256-GCM), decrypted in the browser. The decrypted token is kept for the browser tab only and cleared on sign out.
- **Owners** (khurram, asma, taha, khizer, owner5, owner6) see and edit everything.
- **Staff** (staff1, staff2) hold a token that can open `khas-inbox` only. They add income and expenses for the businesses an owner ticks for them (Settings → Staff access) and see the last 90 days of approved entries for those businesses. Nothing reaches the books until an owner approves it. Both staff logins share one token, so each can technically read the other's inbox files; neither can read `khas-data`.
- **Hostel feed**: KHAS reads `hostels.json` and `hostels/<id>.json` and turns them into monthly income and expense lines marked "Live from Hostel app". They are calculated on the fly with the hostel app's own formulas (`js/hostel-calc.js`, keep in sync with `hostel-management-system/js/app.js`) and are never saved, so nothing is entered twice. Rent collects in the account "Hostel cash (held at hostel)"; record a Transfer when it is banked.
- **Offline**: installable as an app (Add to Home Screen). With no network it opens the last loaded copy, read-only. That copy is stored encrypted on the device.
- **Demo**: "Look around with demo data" on the sign-in page (or Settings → Books) shows made-up numbers. Nothing is saved.

## One-time setup

1. On GitHub create three repos under your account: `khas` (public), `khas-data` (private), `khas-inbox` (private). Add a README to the two private ones so they are not empty.
2. Push this folder to `khas` and turn on Pages: Settings → Pages → Deploy from branch → `main` / root. The app is then at `https://<your-username>.github.io/khas/`.
3. Create three fine-grained tokens (GitHub → Settings → Developer settings → Fine-grained tokens). A fine-grained token has one permission level for all its repos, which is why there are three:
   | Token | Repository access | Permission |
   |---|---|---|
   | Owner | `khas-data` and `khas-inbox` | Contents: Read and write |
   | Hostel | `hostel-data` only | Contents: Read-only |
   | Staff | `khas-inbox` only | Contents: Read and write |
4. In your own terminal (not through an AI assistant) run:
   ```
   pip3 install cryptography openpyxl
   python3 tools/create_logins.py
   ```
   It checks each token reaches exactly what it should (and that the staff token cannot open `khas-data`), creates the 8 logins with random passwords, writes `users.json`, and uploads `credentials/credentials.xlsx` to the private `khas-data` repo. Passwords are never printed. If your GitHub username is not `Tahakhurram`, change `GH_OWNER` at the top of the script first.
5. Sign in. On first use: Settings → Accounts (add your bank accounts), Settings → Books (opening balances), then each business page (flats, assets, herd and so on).

To lock someone out at once, revoke their token on GitHub. To replace passwords or an expired token, run the script again.

## Adding real data later

- One at a time: the **Add entry** button (the round + on a phone).
- In bulk: Settings → Import / Export. Download a template, fill it in Excel, upload, check the preview, import.
- Assets you already own: on the business page, Assets → Add, and fill "Already paid before KHAS".
- A full Excel backup of everything is one click under Settings → Import / Export.

## Things to know

- Money is whole rupees. Numbers use Pakistani grouping (12,50,000) and lakh / crore short forms.
- Instalments paid (Zesora) and construction costs recorded as "Asset purchase" build up the asset's cost; they are not expenses in profit & loss.
- A valuation ("Update value") changes net worth but is not income. The balance sheet is at cost; net worth at current value is shown beside it.
- Livestock purchases are treated as an expense. The herd adds to net worth through the value per head set in Settings → Books.
- Locking a period (Settings → Books) stops entries on or before that date being added, changed or deleted. Use "Reverse" on an entry instead.
- Stock prices are typed in by hand on the Stocks page.

## Tests

Serve the folder (`python3 -m http.server`) and open `/tests/`. It checks that every entry type balances, the reports tie out, Batai splits, instalment progress, rent and schedule dates, number formatting, that the hostel feed matches the hostel app's formulas, and the data layer end to end on the in-memory demo backend.

## Files

```
index.html  css/style.css  sw.js  manifest.webmanifest
js/app.js          login, navigation, routing
js/store.js        loading and saving (GitHub or in-memory demo), staff inbox, offline copy
js/github.js       GitHub Contents API client
js/engine.js       accounting engine (pure functions)
js/calc.js         herd, stocks, Batai, rent dues, schedules, hostel feed
js/hostel-calc.js  hostel formulas shared with the hostel app
js/world.js        the KHAS World map
js/views/          screens
js/demo.js         demo data
tools/create_logins.py
tests/
```
