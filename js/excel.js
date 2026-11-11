// Excel import / export (SheetJS, loaded on demand). Same approach as the hostel app's excel.js.
let loading = null;
function load() {
  if (window.XLSX) return Promise.resolve();
  if (!loading) loading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = res; s.onerror = () => { loading = null; rej(new Error('Could not load the Excel library. Check your internet connection.')); };
    document.head.appendChild(s);
  });
  return loading;
}
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Accepts Date, Excel serial number, "2026-11-01", "1/11/2026" (day first) -> "YYYY-MM-DD" or null.
function toDate(v) {
  if (v === '' || v == null) return null;
  if (v instanceof Date && !isNaN(v)) return iso(v);
  if (typeof v === 'number') { const p = window.XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : null; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}
const toNum = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? null : n; };

// Read the first sheet into objects keyed by simplified header names ("Amount (PKR)" -> "amountpkr").
async function readRows(file) {
  await load();
  const wb = window.XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }).map((r) => {
    const o = {};
    Object.entries(r).forEach(([k, v]) => (o[k.toLowerCase().replace(/[^a-z]/g, '')] = typeof v === 'string' ? v.trim() : v));
    return o;
  }).filter((r) => Object.values(r).some((v) => v !== ''));
}
const pick = (row, ...prefixes) => { for (const p of prefixes) { const k = Object.keys(row).find((x) => x.startsWith(p)); if (k) return row[k]; } return ''; };

async function download(sheets, filename) {
  await load();
  const wb = window.XLSX.utils.book_new();
  sheets.forEach(({ name, rows, widths }) => {
    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    window.XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  window.XLSX.writeFile(wb, filename);
}

export const TEMPLATES = {
  entries: { name: 'Entries', widths: [18, 12, 24, 26, 14, 20, 20, 30], rows: [['Date (YYYY-MM-DD)', 'Type (Income/Expense)', 'Business', 'Category', 'Amount (PKR)', 'Account', 'Person', 'Notes'],
    ['2026-11-05', 'Income', 'Rental Flats', 'Rent income', 45000, 'Cash in hand', 'Ali Khan', 'Flat 2 rent November'], ['2026-11-07', 'Expense', 'Dumba Farm', 'Feed & fodder', 18000, 'Cash in hand', '', 'Wanda and chara']] },
  herd: { name: 'Herd events', widths: [18, 26, 16, 10, 14, 14, 30], rows: [['Date (YYYY-MM-DD)', 'Event (Birth/Death/Purchase/Sale)', 'Group (Ewe/Ram/Lamb)', 'Count', 'Weight (kg)', 'Amount (PKR)', 'Notes'],
    ['2026-10-02', 'Birth', 'Lamb', 4, '', '', ''], ['2026-10-20', 'Sale', 'Ram', 2, 110, 190000, 'Sold at mandi']] },
  flats: { name: 'Flats', widths: [18, 22, 14, 18, 18, 10, 14], rows: [['Flat', 'Tenant', 'Monthly Rent (PKR)', 'Start (YYYY-MM-DD)', 'Lease End (YYYY-MM-DD)', 'Due Day', 'Deposit (PKR)'],
    ['Flat 1', 'Ali Khan', 45000, '2026-01-01', '2026-12-31', 5, 90000]] },
  trades: { name: 'Stock trades', widths: [18, 12, 10, 10, 12, 12], rows: [['Date (YYYY-MM-DD)', 'Side (Buy/Sell)', 'Symbol', 'Shares', 'Price', 'Fees (PKR)'], ['2026-09-10', 'Buy', 'LUCK', 100, 950.5, 420]] },
};
export const Excel = { load, readRows, toDate, toNum, pick, download, template: (k) => download([TEMPLATES[k]], `khas-${k}-template.xlsx`) };
