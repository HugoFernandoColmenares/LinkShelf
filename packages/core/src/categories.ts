export const CATEGORIES = [
  { slug: 'articulos', name: 'Artículos', icon: 'science', order: 1, color: '#0369a1' },
  { slug: 'tutoriales', name: 'Tutoriales', icon: 'school', order: 2, color: '#7c3aed' },
  { slug: 'projects', name: 'Projects', icon: 'code', order: 3, color: '#0f766e' },
  { slug: 'webpages', name: 'WebPages', icon: 'language', order: 4, color: '#c2410c' },
  { slug: 'ia', name: 'IA', icon: 'smart_toy', order: 5, color: '#6d28d9' },
  { slug: 'diseno', name: 'Diseño', icon: 'palette', order: 6, color: '#be185d' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_SLUGS: readonly CategorySlug[] = CATEGORIES.map((category) => category.slug);

const FORMAT_CATEGORIES = new Set<CategorySlug>([
  'projects',
  'articulos',
  'tutoriales',
  'webpages',
]);

export function isCategorySlug(value: string): value is CategorySlug {
  return (CATEGORY_SLUGS as readonly string[]).includes(value);
}

export function categoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}

export function isFormatCategory(slug: CategorySlug): boolean {
  return FORMAT_CATEGORIES.has(slug);
}

/** Orden de precedencia cuando dos categorías empatan. */
export const CATEGORY_PRECEDENCE: readonly CategorySlug[] = [
  'projects',
  'articulos',
  'tutoriales',
  'webpages',
  'ia',
  'diseno',
];
