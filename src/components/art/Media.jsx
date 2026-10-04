import { useEffect, useState } from 'react';
import ProductArt from './ProductArt.jsx';

/* Real photography drop-in.
   Put photos in /public/images and list them in /public/images/manifest.json:
   { "hero": "hero.jpg", "products": { "<product-id>": ["a.jpg","b.jpg"] }, "categories": { "<slug>": "x.jpg" } }
   Anything listed replaces the generated render automatically; everything else falls back to it. */
let manifestPromise;
export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch('/images/manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  }
  return manifestPromise;
}
export function useManifest() {
  const [m, setM] = useState({});
  useEffect(() => { let on = true; loadManifest().then((x) => on && setM(x || {})); return () => { on = false; }; }, []);
  return m;
}
const src = (f) => (f.startsWith('http') || f.startsWith('/') ? f : `/images/${f}`);

export function ProductImage({ product, color, view = 0, className, eager }) {
  const m = useManifest();
  if (product.img) {
    const shots = product.gallery?.length ? product.gallery : [product.img];
    return <img className={className} src={shots[view % shots.length]} alt={view ? `${product.name}, photo ${(view % shots.length) + 1}` : product.name} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" />;
  }
  const photos = m.products?.[product.id];
  const photo = photos && (Array.isArray(photos) ? photos[view % photos.length] : photos);
  if (photo) return <img className={className} src={src(photo)} alt={`${product.name}`} loading={eager ? 'eager' : 'lazy'} decoding="async" />;
  return <ProductArt className={className} art={product.art} color={color} wired={product.conn === 'Wired'} view={view} title={`${product.name}`} />;
}

export function CategoryImage({ category, className }) {
  const m = useManifest();
  const photo = m.categories?.[category.slug];
  if (photo) return <img className={className} src={src(photo)} alt={category.name} loading="lazy" decoding="async" />;
  return <ProductArt className={className} art={category.art} title={category.name} />;
}
