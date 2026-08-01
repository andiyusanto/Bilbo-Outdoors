import { Product } from '../types';

export const DEFAULT_CATEGORY_ORDER: string[] = [
  'TENT & SHELTER',
  'SLEEPING SYSTEM',
  'CARRIER & BACKPACK',
  'COOKING GEAR',
  'LIGHTING & POWER',
  'HIKING ESSENTIALS',
  'CAMP SUPPORT',
  'APPAREL & PERSONAL GEAR',
];

// Default-order categories that currently have >=1 product, followed by any
// admin-added categories not in the default list, alphabetically. No 'ALL'
// entry included - callers that need it prepend it themselves.
export function getDistinctCategories(products: Product[]): string[] {
  const present = new Set(products.map((p) => p.category));
  const known = DEFAULT_CATEGORY_ORDER.filter((c) => present.has(c));
  const extra = [...present]
    .filter((c) => !DEFAULT_CATEGORY_ORDER.includes(c))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...extra];
}

// Distinct non-empty values for an optional catalog attribute (varian/size/color),
// alphabetical - unlike categories, these have no canonical preset order.
export function getDistinctValues(products: Product[], field: 'varian' | 'size' | 'color'): string[] {
  const values = new Set(products.map((p) => p[field]).filter((v): v is string => !!v));
  return [...values].sort((a, b) => a.localeCompare(b));
}
