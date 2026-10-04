/* DMD World category tree. Names follow the store's menu; `ids` are the WooCommerce category ids
   (see dmdCatalog.js) used to list products. URLs: /product-category/<group>/<sub>/... */
import { CATS } from './dmdCatalog.js';
const COUNT = Object.fromEntries(CATS.map((c) => [c[0], c[4]]));
const slugify = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const n = (name, ids, children = [], extra = {}) => ({ name, slug: slugify(name), ids: ids || [], children, ...extra });
const games = (all, nw, used) => n('Games', [all], [n('New', [nw]), n('Used', [used])]);
const U = 'https://dmdworld.store/wp-content/uploads/';

export const DMD_GROUPS = [
  n('PC Parts', [393], [n('Chair and Table', [413]), n('Monitors', [412]), n('Hard Disk and Flash', [924], [n('Hard Disk', [961]), n('Flash Memory', [])])], { art: { t: 'monitor', a: '#1f6feb' }, blurb: 'Chairs, tables, monitors and storage', img: `${U}2025/11/computer-parts-icons-black-vector.jpg` }),
  n('PlayStation', [295], [
    n('PS5', [300], [games(338, 293, 339), n('Accessories', [294]), n('Consoles', [304]), n('Repair Parts', [])]),
    n('PS4', [299], [games(336, 291, 337), n('Accessories', [292]), n('Consoles', [334])]),
    n('PS3', [290]), n('PS2', [289]), n('PS Cards', [352]),
  ], { art: { t: 'console-ps5', a: '#1f6feb' }, blurb: 'Consoles, new and used games, accessories and PS cards', img: `${U}2025/01/sony-ps5-console-new-playstation-5-console-slim-jp-edition-2023-2-x-dualsense-wireless-controllers-34142729961604_1200x1200.webp` }),
  n('Nintendo Switch', [296], [games(340, 297, 341), n('Consoles', [342]), n('Accessories', [298])], { art: { t: 'console-switch', a: '#e60012' }, blurb: 'New and used games, consoles, accessories', img: `${U}2025/01/Nintendo-Switch-Gaming-Console-with-Neon-Blue-and-Neon-Red-Joy-Con_69c973cc-1051-4940-b367-c717ebff38af.d1e17f8ce95a56079d3440e8a267898b.webp` }),
  n('Xbox', [286], [n('Xbox 360', [305]), n('Xbox One', [306]), n('Xbox Series', [307, 404])], { art: { t: 'console-xbox', a: '#2e9a63' }, blurb: 'Xbox 360, One and Series' }),
  n('Tablets', [433], [], { art: { t: 'laptop', a: '#1f6feb' }, blurb: 'Tablets for work, play and kids' }),
  n('Laptops', [415], [n('Laptop Bags', [416]), n('Laptop Coolers', [418]), n('Laptops', [423])], { art: { t: 'laptop', a: '#1f6feb' }, blurb: 'Laptops, bags and coolers', img: `${U}2025/01/Microsoft-Surface-Laptop-4-15-Touch-Screen-Intel-Core-i7-16GB-512GB-Solid-State-Drive-Latest-Model-Platinum_9b3000c9-30ff-423c-9b64-97bbbf9c894a.4c8c707ebf8fa9989ae27863682bf815-scaled.webp` }),
  n('Marvo', [547], [n('Chairs and Tables', [597]), n('Headphones', [600]), n('Keyboards', [549]), n('Mouse', [548]), n('Mouse Pads', [595]), n('Speakers and Microphones', [596])], { brand: true, art: { t: 'keyboard', a: '#1f6feb' }, img: `${U}2025/01/de84c498-aedb-4158-bae5-9196172cb369.jpg` }),
  n('Onikuma', [860], [n('Headphones', [862]), n('Mouse', [917])], { brand: true, art: { t: 'headset', a: '#1f6feb' }, img: `${U}2025/11/Onikuma_logo.webp` }),
  n('HyperX', [911], [n('Headphones', [420]), n('Keyboards', [436]), n('Mouse', [912]), n('Mouse Pads', [913])], { brand: true, art: { t: 'headset', a: '#ff5d4d' }, img: `${U}2025/11/hyperx-logo-png_seeklogo-425410.png` }),
  n('Logitech', [1000], [n('Headsets', [1004]), n('Keyboards', [1002]), n('Mouse', [1001]), n('Webcams', [1003])], { brand: true, art: { t: 'mouse', a: '#1f6feb' } }),
  n('Moxom', [850], [n('Accessories', [856]), n('Cables and Adapters', [857]), n('Headphones', [854]), n('Power Banks', [853]), n('Razor Shave', [855]), n('Sockets', [858]), n('Speakers', [852])], { brand: true, art: { t: 'dongle', a: '#1f6feb' }, img: `${U}2025/11/5ceddc82d2.webp` }),
  n('Megavolt', [774], [n('Chairs', [987]), n('Controllers', [989]), n('Monitors', [988]), n('UPS', [991])], { brand: true, art: { t: 'dongle', a: '#f5b84a' } }),
  n('Razer', [904], [n('Accessories', [919]), n('Chairs', [918]), n('Speakers', [426]), n('Headphones', [383]), n('Keyboards', [381]), n('Mouse', [382]), n('Mouse Pads', [392])], { brand: true, art: { t: 'mouse', a: '#2e9a63' }, img: `${U}2025/11/razer-logo-png_seeklogo-494802.png` }),
  n('E-Yooso', [920], [], { brand: true, art: { t: 'keyboard', a: '#1f6feb' }, img: `${U}2025/11/Sa699eda660894d77b8596c9abc0c3d9bm.avif` }),
  n('Fantech', [893], [n('Keyboards', [894]), n('Tables and Chairs', [897]), n('Headphones', [896]), n('Mouse', [895])], { brand: true, art: { t: 'mouse', a: '#1f6feb' }, img: `${U}2025/06/fantech.jpg` }),
  n('Xiaomi', [946], [], { brand: true, art: { t: 'speaker', a: '#ff6900' } }),
  n('Other', [], [
    n('Retro Games & Consoles', [323]), n('Gadgets', [282]), n('Electronic Toys', [363]), n('Action Figures', [369]), n('Phone Accessories', [287]),
    n('AirPods', [321]), n('Speakers', [285]), n('Computer Accessories', [281]), n('Network Products', [349]), n('Smart Watches', [322]),
  ], { art: { t: 'light', a: '#1f6feb' }, blurb: 'Gadgets, toys, phone, computer and network accessories' }),
];

// Mega-menu sections: how the groups are bucketed in the left column.
export const MENU_SECTIONS = [
  { label: 'Shop by category', slugs: ['pc-parts', 'playstation', 'nintendo-switch', 'xbox', 'tablets', 'laptops', 'other'] },
  { label: 'Shop by brand', slugs: ['marvo', 'onikuma', 'hyperx', 'logitech', 'moxom', 'megavolt', 'razer', 'e-yooso', 'fantech', 'xiaomi'] },
];

export const NEW_OFFERS = n('New Offers', [996], [], { art: { t: 'light', a: '#ff5d4d' }, blurb: 'The latest discounts across the store' });

// Give every node its full id set (own + descendants) and its URL path.
const prep = (node, path = []) => {
  node.path = [...path, node.slug];
  node.allIds = [...node.ids, ...node.children.flatMap((c) => prep(c, node.path).allIds)];
  node.count = node.ids.reduce((a, id) => a + (COUNT[id] || 0), 0) || node.children.reduce((a, c) => a + c.count, 0);
  return node;
};
DMD_GROUPS.forEach((g) => prep(g));
prep(NEW_OFFERS);

/** Counts follow the products the storefront can actually list, so "N products" always matches the page. */
export function recountMenu(products) {
  const walk = (node) => {
    const ids = new Set(node.allIds);
    node.count = products.reduce((a, p) => a + (p.cats.some((c) => ids.has(c)) ? 1 : 0), 0);
    node.children.forEach(walk);
  };
  DMD_GROUPS.forEach(walk);
  walk(NEW_OFFERS);
}

export const groupBySlug = Object.fromEntries(DMD_GROUPS.map((g) => [g.slug, g]));
export const catUrl = (...path) => `/product-category/${path.join('/')}`;
export const BRAND_GROUPS = DMD_GROUPS.filter((g) => g.brand);

/** Resolve /product-category/a/b/c to [nodes], or null. */
export function resolvePath(path) {
  const parts = (path || '').split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'new-offers') return [NEW_OFFERS];
  const out = []; let level = DMD_GROUPS;
  for (const p of parts) { const f = level.find((x) => x.slug === p); if (!f) return null; out.push(f); level = f.children || []; }
  return out;
}
export const CONTACT = { phone: '+961 70 903 900', tel: '+96170903900', email: 'INFO@DMDWORLD.STORE' };
