// Static catalog metadata: colors, platforms, brands, categories.

export const COLORS = {
  black:   { label: 'Black',        hex: '#1b1e26', family: 'Black' },
  carbon:  { label: 'Carbon Black', hex: '#1d2027', family: 'Black' },
  midnight:{ label: 'Midnight Black', hex: '#15171d', family: 'Black' },
  white:   { label: 'White',        hex: '#e7eaf0', family: 'White' },
  arctic:  { label: 'Arctic White', hex: '#e9edf3', family: 'White' },
  grey:    { label: 'Grey',         hex: '#6c7482', family: 'Grey' },
  red:     { label: 'Red',          hex: '#c8323a', family: 'Red' },
  cosmic:  { label: 'Cosmic Red',   hex: '#b3262f', family: 'Red' },
  pulse:   { label: 'Pulse Red',    hex: '#c9373a', family: 'Red' },
  blue:    { label: 'Blue',         hex: '#2f66d8', family: 'Blue' },
  shock:   { label: 'Shock Blue',   hex: '#2c8fd9', family: 'Blue' },
  green:   { label: 'Green',        hex: '#2e9a63', family: 'Green' },
  pink:    { label: 'Pink',         hex: '#d9689d', family: 'Pink' },
  purple:  { label: 'Purple',       hex: '#7456cf', family: 'Purple' },
};
export const COLOR_FAMILIES = ['Black', 'White', 'Grey', 'Red', 'Blue', 'Green', 'Pink', 'Purple'];
export const FAMILY_HEX = { Black: '#1b1e26', White: '#e7eaf0', Grey: '#6c7482', Red: '#c8323a', Blue: '#2f66d8', Green: '#2e9a63', Pink: '#d9689d', Purple: '#7456cf' };

// ─── Compatibility keys (what a product works with) ───────────────────────────
export const COMPAT = {
  ps5:           { label: 'PS5',            short: 'PS5',      family: 'playstation' },
  ps4:           { label: 'PS4',            short: 'PS4',      family: 'playstation' },
  'xbox-series': { label: 'Xbox Series X|S', short: 'Series X|S', family: 'xbox' },
  'xbox-one':    { label: 'Xbox One',       short: 'Xbox One', family: 'xbox' },
  'xbox-360':    { label: 'Xbox 360',       short: '360',      family: 'xbox' },
  switch:        { label: 'Nintendo Switch', short: 'Switch',  family: 'nintendo' },
  pc:            { label: 'PC',             short: 'PC',       family: 'pc' },
  mobile:        { label: 'Mobile',         short: 'Mobile',   family: 'mobile' },
};
export const COMPAT_ORDER = ['ps5', 'ps4', 'xbox-series', 'xbox-one', 'xbox-360', 'switch', 'pc', 'mobile'];

// ─── Shop by platform: platform → generation → product sub-types ──────────────
// `types` are product-type slugs matched against products on that platform.
const sub = (slug, name, types) => ({ slug, name, types });
const S = {
  consoles: sub('consoles', 'Consoles', ['consoles']),
  controllers: sub('controllers', 'Controllers', ['controllers']),
  headsets: sub('headsets', 'Headsets', ['headsets']),
  games: sub('games', 'Games', ['games']),
  accessories: sub('accessories', 'Accessories', ['console-accessories', 'other-accessories']),
  charging: sub('charging-stations', 'Charging Stations', ['charging-stations']),
  storage: sub('storage', 'Storage', ['storage']),
};
export const PLATFORM_TREE = [
  { slug: 'playstation', name: 'PlayStation', accent: '#2f6bff', blurb: 'Consoles, DualSense controllers, headsets and games for PS5 and PS4.',
    gens: [
      { slug: 'ps5', name: 'PS5', compat: 'ps5', subs: [S.consoles, S.controllers, S.headsets, S.games, S.accessories, S.charging, S.storage] },
      { slug: 'ps4', name: 'PS4', compat: 'ps4', subs: [S.consoles, S.controllers, S.games, S.accessories] },
    ] },
  { slug: 'xbox', name: 'Xbox', accent: '#2fb36a', blurb: 'Series X|S consoles, Elite controllers, headsets, games and storage.',
    gens: [
      { slug: 'xbox-series', name: 'Xbox Series X|S', compat: 'xbox-series', subs: [S.consoles, S.controllers, S.headsets, S.games, S.accessories] },
      { slug: 'xbox-one', name: 'Xbox One', compat: 'xbox-one', subs: [S.consoles, S.controllers, S.games, S.accessories] },
      { slug: 'xbox-360', name: 'Xbox 360', compat: 'xbox-360', subs: [S.consoles, S.controllers, S.games, S.accessories] },
    ] },
  { slug: 'nintendo', name: 'Nintendo', accent: '#ff4a4a', blurb: 'Switch consoles, Pro Controllers, Joy-Con and first-party games.',
    gens: [
      { slug: 'switch', name: 'Nintendo Switch', compat: 'switch', subs: [S.consoles, S.controllers, S.games, S.accessories] },
    ] },
  { slug: 'pc', name: 'PC Gaming', accent: '#8a6bff', blurb: 'Everything for a serious rig: displays, peripherals, components and laptops.', gens: [], compat: 'pc',
    subs: [
      sub('gaming-chairs', 'Gaming Chairs', ['gaming-chairs']), sub('desks', 'Desks', ['gaming-desks']),
      sub('monitors', 'Monitors', ['monitors']), sub('keyboards', 'Keyboards', ['keyboards']), sub('mice', 'Mice', ['gaming-mice']),
      sub('headsets', 'Headsets', ['headsets']), sub('microphones', 'Microphones', ['microphones']), sub('speakers', 'Speakers', ['speakers']),
      sub('pc-components', 'PC Components', ['pc-components']), sub('storage', 'Storage', ['storage']),
      sub('gaming-laptops', 'Gaming Laptops', ['gaming-laptops']), sub('gaming-pcs', 'Gaming PCs', ['gaming-pcs']),
    ] },
];
export const platformBySlug = Object.fromEntries(PLATFORM_TREE.map((p) => [p.slug, p]));
// Short key lists used by older code paths / quick chips
export const PLATFORM_FAMILIES = ['playstation', 'xbox', 'nintendo', 'pc'];

// ─── Brands ────────────────────────────────────────────────────────────────────
export const BRANDS = [
  { slug: 'razer',        name: 'Razer',              mark: { text: 'RAZER', weight: 800, track: 0.22 },                           line: 'For gamers. By gamers.' },
  { slug: 'logitech-g',   name: 'Logitech G',         mark: { text: 'logitech', sup: 'G', weight: 600, case: 'lower', track: -0.02 }, line: 'Esports-grade mice, keyboards & wheels' },
  { slug: 'steelseries',  name: 'SteelSeries',        mark: { text: 'STEELSERIES', weight: 700, track: 0.12, size: 0.8 },          line: 'Audio & peripherals built to win' },
  { slug: 'hyperx',       name: 'HyperX',             mark: { text: 'HyperX', weight: 800, italic: true, track: -0.01 },            line: 'Headsets, mics & keyboards' },
  { slug: 'corsair',      name: 'Corsair',            mark: { text: 'CORSAIR', weight: 700, track: 0.2 },                          line: 'High-performance PC gear' },
  { slug: 'asus-rog',     name: 'ASUS ROG',           mark: { text: 'ROG', sub: 'REPUBLIC OF GAMERS', weight: 800, track: 0.08 },  line: 'Flagship displays, laptops & peripherals' },
  { slug: 'msi',          name: 'MSI',                mark: { text: 'MSI', weight: 800, track: 0.14 },                            line: 'Monitors, laptops & components' },
  { slug: 'secretlab',    name: 'Secretlab',          mark: { text: 'SECRETLAB', weight: 600, track: 0.2, size: 0.84 },            line: 'Award-winning chairs & desks' },
  { slug: 'dxracer',      name: 'DXRacer',            mark: { text: 'DXRACER', weight: 800, italic: true, track: 0.1 },            line: 'The original racing-style seating' },
  { slug: 'sony',         name: 'Sony / PlayStation', mark: { text: 'PlayStation', weight: 600, track: -0.01 },                    line: 'Consoles, DualSense & PS5 accessories' },
  { slug: 'xbox',         name: 'Microsoft / Xbox',   mark: { text: 'XBOX', weight: 800, track: 0.16 },                           line: 'Consoles, controllers & headsets' },
  { slug: 'nintendo',     name: 'Nintendo',           mark: { text: 'Nintendo', weight: 700, track: 0 },                           line: 'Switch consoles, controllers & games' },
  { slug: 'thrustmaster', name: 'Thrustmaster',       mark: { text: 'THRUSTMASTER', weight: 700, track: 0.08, size: 0.72 },        line: 'Racing wheels, pedals & shifters' },
  { slug: 'turtle-beach', name: 'Turtle Beach',       mark: { text: 'TURTLE BEACH', weight: 700, track: 0.1, size: 0.76 },         line: 'Console-first headsets & controllers' },
  { slug: 'fantech',      name: 'Fantech',            mark: { text: 'FANTECH', weight: 800, track: 0.12 },                         line: 'Great-value gaming peripherals' },
  { slug: 'marvo',        name: 'Marvo',              mark: { text: 'MARVO', weight: 800, track: 0.18 },                           line: 'Budget-friendly keyboards, mice & audio' },
  { slug: 'onikuma',      name: 'Onikuma',            mark: { text: 'ONIKUMA', weight: 700, track: 0.14 },                         line: 'Affordable headsets with big sound' },
];
export const brandBySlug = Object.fromEntries(BRANDS.map((b) => [b.slug, b]));

// ─── Shop by product type ──────────────────────────────────────────────────────
// primary: shown on /categories "Shop by category" (the 17 customer-facing types).
const T = (slug, name, group, art, tagline, blurb, primary = true) => ({ slug, name, group, art, tagline, blurb, primary });
export const CATEGORIES = [
  T('gaming-chairs', 'Gaming Chairs', 'Furniture', { t: 'chair', c: 'black', a: '#3d8bff' }, 'Premium chairs for every setup', 'Ergonomic seating built for long sessions.'),
  T('gaming-desks', 'Gaming Desks', 'Furniture', { t: 'desk', c: 'black', a: '#3d8bff' }, 'Steel-frame, standing & wide-top', 'Desks with cable management that keep a setup clean.'),
  T('controllers', 'Controllers', 'Controllers', { t: 'pad-xbox', c: 'carbon', a: '#3d8bff' }, 'PlayStation · Xbox · PC · Nintendo', 'DualSense, Elite, Pro and esports controllers for every platform.'),
  T('headsets', 'Headsets', 'Audio & Voice', { t: 'headset', c: 'black', a: '#3d8bff' }, 'Wireless · Wired · Console · PC', 'Wireless, wired and console-ready gaming audio.'),
  T('keyboards', 'Keyboards', 'Peripherals', { t: 'keyboard', c: 'black', a: '#3d8bff' }, 'Mechanical · Optical · Magnetic', 'Full-size, TKL and compact boards across every switch type.'),
  T('gaming-mice', 'Gaming Mice', 'Peripherals', { t: 'mouse', c: 'black', a: '#3d8bff' }, 'Lightweight · Wireless · Esports', 'Precision sensors in shells down to 54 g.'),
  T('mouse-pads', 'Mouse Pads', 'Peripherals', { t: 'pad-mat', c: 'black', a: '#3d8bff' }, 'Control · Speed · XXL desk mats', 'Cloth, hard and extended desk mats.'),
  T('monitors', 'Monitors', 'Displays', { t: 'monitor', c: 'black', a: '#3d8bff' }, 'OLED · IPS · Ultrawide', 'High-refresh panels from 1080p to 4K.'),
  T('microphones', 'Microphones', 'Audio & Voice', { t: 'mic', c: 'black', a: '#3d8bff' }, 'USB · Dynamic · Streaming', 'Studio-quality voice for streams and squads.'),
  T('speakers', 'Speakers', 'Audio & Voice', { t: 'speaker', c: 'black', a: '#3d8bff' }, 'Desktop · RGB · Surround', 'Desktop speakers tuned for games.'),
  T('racing-sim-gear', 'Racing / Sim Gear', 'Sim', { t: 'wheel', c: 'black', a: '#ff5d4d' }, 'Wheels · Pedals · Shifters', 'Force-feedback wheels, pedals and shifters.'),
  T('pc-accessories', 'PC Accessories', 'PC', { t: 'webcam', c: 'black', a: '#3d8bff' }, 'Webcams · Stands · Adapters', 'Streaming, stands and desk-friendly add-ons.'),
  T('console-accessories', 'Console Accessories', 'Console', { t: 'remote', c: 'white', a: '#3d8bff' }, 'Remotes · Cases · Handhelds', 'Official and third-party add-ons for your console.'),
  T('gaming-pcs', 'Gaming PCs', 'PC', { t: 'tower', c: 'black', a: '#3d8bff' }, 'Prebuilt desktops, ready to play', 'Prebuilt rigs from entry 1080p to 4K.'),
  T('gaming-laptops', 'Laptops', 'PC', { t: 'laptop', c: 'black', a: '#3d8bff' }, 'Thin & light · Desktop replacement', 'RTX-class laptops for play anywhere.'),
  T('full-gaming-setups', 'Full Gaming Setups', 'Setups', { t: 'setup', c: 'black', a: '#3d8bff' }, 'Curated bundles, ready to ship', 'Complete setups, saved as a bundle.'),
  T('other-accessories', 'Other Accessories', 'Accessories', { t: 'light', c: 'black', a: '#3d8bff' }, 'Lighting · Arms · Bags', 'Lighting, monitor arms and carry gear.'),
  // platform-led types (also reachable from platform pages)
  T('consoles', 'Consoles', 'Console', { t: 'console-ps5', c: 'white', a: '#2f6bff' }, 'PS5 · Xbox · Switch', 'Current-generation and classic consoles.', false),
  T('games', 'Games', 'Console', { t: 'game', c: 'black', a: '#2f6bff' }, 'PS5 · Xbox · Switch · PC', 'First-party hits and multiplatform favourites.', false),
  T('charging-stations', 'Charging Stations', 'Console', { t: 'dock', c: 'white', a: '#2f6bff' }, 'Controller docks & power', 'Charging docks and rechargeable packs.', false),
  T('storage', 'Storage', 'PC', { t: 'ssd', c: 'black', a: '#3d8bff' }, 'NVMe SSDs & expansion cards', 'Heatsinked SSDs and console expansion storage.', false),
  T('pc-components', 'PC Components', 'PC', { t: 'gpu', c: 'black', a: '#3d8bff' }, 'GPUs · RAM · PSUs · Cooling', 'Build or upgrade your PC.', false),
];
export const categoryBySlug = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c]));
export const PRIMARY_CATEGORIES = CATEGORIES.filter((c) => c.primary);

// Types that are not tied to a platform (chairs, desks, mats...) — "universal".
export const UNIVERSAL_TYPES = ['gaming-chairs', 'gaming-desks', 'full-gaming-setups', 'other-accessories', 'mouse-pads'];

// Dynamic filter sets per product type (price, rating & availability always appended).
export const FILTERS_BY_TYPE = {
  controllers: ['platform', 'brand', 'conn', 'color'],
  headsets: ['platform', 'brand', 'conn', 'connection', 'mic'],
  'gaming-chairs': ['brand', 'material', 'color', 'maxKg'],
  monitors: ['brand', 'size', 'res', 'hz', 'panel'],
  keyboards: ['brand', 'layout', 'conn', 'color'],
  'gaming-mice': ['brand', 'weight', 'conn', 'color'],
  'gaming-desks': ['brand', 'color'],
  microphones: ['platform', 'brand', 'conn'],
  consoles: ['platform', 'brand', 'storage'],
  games: ['platform', 'brand', 'genre'],
  'gaming-laptops': ['brand', 'screen', 'gpu'],
  'gaming-pcs': ['brand', 'gpu'],
  default: ['platform', 'brand', 'conn', 'color'],
};
export const FACET_LABELS = {
  type: 'Product type',
  platform: 'Platform', brand: 'Brand / Platform', conn: 'Wired / Wireless', color: 'Color', connection: 'Connection', mic: 'Microphone',
  material: 'Material', maxKg: 'Maximum weight', size: 'Screen size', res: 'Resolution', hz: 'Refresh rate', panel: 'Panel type',
  layout: 'Layout', weight: 'Weight', storage: 'Storage', genre: 'Genre', screen: 'Screen', gpu: 'Graphics',
};
