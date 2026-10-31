import { useEffect, useState, useSyncExternalStore } from 'react';
import ProductArt from './ProductArt.jsx';
import { imagesVersion, markBroken, photosOf, subscribeImages } from '../../lib/imageHealth.js';
import s from './Media.module.css';

/** Re-renders when a photo fails, so the next one that works takes its place. */
export const useImageHealth = () => useSyncExternalStore(subscribeImages, imagesVersion);

/** A product's photos that can still be shown (the variant's own first); empty when none works. */
export function usePhotos(product) {
  useImageHealth();
  return photosOf(product);
}

/** Shown when none of a product's photos loads: neutral, same size as the photo it stands in for. */
export function PhotoPlaceholder({ name, className }) {
  return (
    <span className={`${className || ''} ${s.placeholder}`} role="img" aria-label={`${name}: photo not available`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5L5 20" /></svg>
    </span>
  );
}

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
  const shots = usePhotos(product);
  if (product.img) {
    if (!shots.length) return <PhotoPlaceholder name={product.name} className={className} />;
    const i = view % shots.length;
    const url = shots[i];
    // Keyed by address: a late error from a photo no longer shown only marks that photo, never the one now chosen.
    return <img key={url} className={className} src={url} alt={i ? `${product.name}, photo ${i + 1}` : product.name} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => markBroken(url)} />;
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
