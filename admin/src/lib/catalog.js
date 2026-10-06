/* Laravel's catalog answers → the shapes the admin screens show. Brands are their own records (not categories);
   a brand's product lines are top-level categories that belong to it, labelled "Brand · Line" in pickers. */
import { useMemo } from 'react';
import { useApi } from './hooks.js';

/** Availability → the stock meter's level. */
export const LEVEL = { in_stock: 'ok', low_stock: 'low', out_of_stock: 'out' };
export const levelOf = (p) => (!p.track_stock ? 'untracked' : LEVEL[p.availability] || 'ok');

export function categoryFromApi(c, brandName) {
  return {
    id: c.id, name: c.name, slug: c.slug, parent: c.parent_id || 0, brandId: c.brand_id ?? null, brandName: c.brand_id ? brandName(c.brand_id) : null,
    label: c.brand_id && !c.parent_id ? `${brandName(c.brand_id) || 'Brand'} · ${c.name}` : c.name,
    count: c.products_count ?? 0, image: c.image_url || '', description: c.description || '', icon: c.icon || '', accent: c.accent_color || '',
    isVisible: c.is_visible !== false, onStorefront: !!c.on_storefront, position: c.position ?? 0, path: c.path || '', children: c.children_count ?? 0,
  };
}

export function productFromApi(p) {
  return {
    ...p, image: p.image || p.images?.[0]?.url || null, level: levelOf(p), featured: !!p.is_featured,
    categoryNames: (p.categories || []).map((c) => c.name), brandName: p.brand?.name || null,
  };
}

/** Categories (mapped) and brands for pickers and filters, loaded once per screen. */
export function useCatalogLists() {
  const cats = useApi('/categories', { live: false });
  const brands = useApi('/brands', { live: false });
  return useMemo(() => {
    const brandList = brands.data?.data || [];
    const name = (id) => brandList.find((b) => b.id === id)?.name || null;
    return {
      ready: !!cats.data && !!brands.data,
      categories: (cats.data?.data || []).map((c) => categoryFromApi(c, name)),
      brands: brandList,
      error: cats.error || brands.error,
    };
  }, [cats.data, brands.data, cats.error, brands.error]);
}
