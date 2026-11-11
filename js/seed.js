// Default chart of accounts and the 13 KHAS business units. Used when the data repo is empty.
export const SCHEMA_VERSION = 1;

const A = (id, name, type, extra = {}) => ({ id, name, type, system: true, ...extra });
export const ACCOUNTS = [
  A('cash', 'Cash in hand', 'asset', { group: 'cash', cashlike: true }),
  A('hostel-cash', 'Hostel cash (held at hostel)', 'asset', { group: 'cash', cashlike: true }),
  A('receivables', 'Receivables (owed to us)', 'asset', { group: 'receivable' }),
  A('loans-given', 'Loans given', 'asset', { group: 'receivable' }),
  A('land', 'Land & plots', 'asset', { group: 'fixed' }),
  A('buildings', 'Buildings & flats', 'asset', { group: 'fixed' }),
  A('cip', 'Construction in progress', 'asset', { group: 'fixed' }),
  A('property-instalments', 'Property under instalment', 'asset', { group: 'fixed' }),
  A('stocks', 'Stocks (PSX)', 'asset', { group: 'investment' }),
  A('other-assets', 'Other assets', 'asset', { group: 'fixed' }),
  A('payables', 'Payables (we owe)', 'liability'),
  A('deposits', 'Security deposits held', 'liability'),
  A('loans-taken', 'Loans taken', 'liability'),
  A('capital', "Owners' capital", 'equity'),
  A('drawings', "Owners' drawings", 'equity'),
  A('opening-equity', 'Opening balances', 'equity'),
  A('inc-rent', 'Rent income', 'income'),
  A('inc-tower', 'Tower rent', 'income'),
  A('inc-livestock', 'Livestock sales (Dumba)', 'income'),
  A('inc-crops', 'Crop sales', 'income'),
  A('inc-batai', 'Batai / Theka income', 'income'),
  A('inc-export', 'Export sales', 'income'),
  A('inc-dividends', 'Dividends', 'income'),
  A('inc-returns', 'Investment returns', 'income'),
  A('inc-gain', 'Gain on sale of assets', 'income'),
  A('inc-other', 'Other income', 'income'),
  A('exp-feed', 'Feed & fodder', 'expense'),
  A('exp-vet', 'Vet & medicine', 'expense'),
  A('exp-livestock', 'Livestock purchases', 'expense'),
  A('exp-labour', 'Salaries & labour', 'expense'),
  A('exp-seed', 'Seed', 'expense'),
  A('exp-fertiliser', 'Fertiliser & pesticide', 'expense'),
  A('exp-water', 'Water & irrigation', 'expense'),
  A('exp-machinery', 'Machinery & fuel', 'expense'),
  A('exp-maintenance', 'Repairs & maintenance', 'expense'),
  A('exp-utilities', 'Electricity, gas & internet', 'expense'),
  A('exp-materials', 'Raw material & production', 'expense'),
  A('exp-freight', 'Freight & shipping', 'expense'),
  A('exp-commission', 'Brokerage & commission', 'expense'),
  A('exp-taxes', 'Taxes & government fees', 'expense'),
  A('exp-food', 'Food', 'expense'),
  A('exp-rent', 'Rent paid', 'expense'),
  A('exp-loss', 'Loss on sale of assets', 'expense'),
  A('exp-other', 'Other expenses', 'expense'),
];

// kind drives the unit page and the map sprite; region places it on the KHAS World.
export const KINDS = {
  livestock: { label: 'Operating', region: 'village' },
  crops: { label: 'Operating', region: 'village' },
  batai: { label: 'Partnership', region: 'village' },
  exports: { label: 'Trading', region: 'port' },
  flats: { label: 'Rental', region: 'lahore' },
  tower: { label: 'Rental', region: 'lahore' },
  hostel: { label: 'Rental', region: 'lahore' },
  construction: { label: 'Construction', region: 'lahore' },
  landtrade: { label: 'Investment', region: 'lahore' },
  buildsell: { label: 'Development', region: 'lahore' },
  stocks: { label: 'Investment', region: 'lahore' },
  land: { label: 'Asset', region: 'north' },
  instalment: { label: 'Instalment', region: 'north' },
  other: { label: 'Other', region: 'lahore' },
};

export const UNITS = [
  { id: 'dumba-farm', name: 'Dumba Farm', kind: 'livestock', place: 'Village' },
  { id: 'crops', name: 'Crops (own farming)', kind: 'crops', place: 'Village' },
  { id: 'batai', name: 'Land on Batai / Theka', kind: 'batai', place: 'Village' },
  { id: 'exports', name: 'Textile Exports', kind: 'exports', place: 'Mops & kitchen towels' },
  { id: 'flats', name: 'Rental Flats', kind: 'flats', place: 'Lahore' },
  { id: 'tower-plot', name: 'Cell Tower Plot', kind: 'tower', place: 'Lahore' },
  { id: 'hostel-de-khas', name: 'Hostel De Khas', kind: 'hostel', place: 'Ali Town, Lahore', hostelId: 'hostel-de-khas' },
  { id: 'hostel-2', name: 'Hostel 2', kind: 'construction', place: 'Ali Town, Lahore' },
  { id: 'land-trading', name: 'Land Trading', kind: 'landtrade', place: 'Buy & sell plots' },
  { id: 'build-sell', name: 'Build & Sell', kind: 'buildsell', place: 'Houses, flats, hostels' },
  { id: 'stocks', name: 'Stocks (PSX)', kind: 'stocks', place: 'Pakistan Stock Exchange' },
  { id: 'nathia-gali', name: 'Nathia Gali Land', kind: 'land', place: 'Nathia Gali' },
  { id: 'zesora', name: 'Zesora Resort', kind: 'instalment', place: 'Khanuspur · 2 apartments' },
];

// Hostel app expense category -> KHAS expense account
export const HOSTEL_CAT = {
  Electricity: 'exp-utilities', Internet: 'exp-utilities', Water: 'exp-utilities', Gas: 'exp-utilities',
  Salaries: 'exp-labour', Maintenance: 'exp-maintenance', Cleaning: 'exp-maintenance', Food: 'exp-food', Rent: 'exp-rent', Other: 'exp-other',
};

// Every data file with its empty shape.
export const FILES = {
  meta: () => ({ schemaVersion: SCHEMA_VERSION, ledgerYears: [], lockThrough: '', herdValue: { ewe: 0, ram: 0, lamb: 0 }, staffAccount: 'cash' }),
  units: () => ({ units: UNITS.map((u) => ({ ...u })) }),
  accounts: () => ({ accounts: ACCOUNTS.map((a) => ({ ...a })) }),
  parties: () => ({ parties: [] }),
  assets: () => ({ assets: [] }),
  schedules: () => ({ schedules: [] }),
  rentals: () => ({ rentals: [] }),
  livestock: () => ({ opening: { ewe: 0, ram: 0, lamb: 0 }, events: [] }),
  crops: () => ({ seasons: [] }),
  exports: () => ({ orders: [] }),
  stocks: () => ({ trades: [], prices: {} }),
  projects: () => ({ projects: [] }),
};

export function migrate(name, data) {
  // v1 is the first schema. Future versions: transform `data` here based on meta.schemaVersion.
  const base = FILES[name] ? FILES[name]() : {};
  return { ...base, ...data };
}
