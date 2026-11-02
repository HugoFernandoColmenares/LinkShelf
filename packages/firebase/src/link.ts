import type { CategorySlug, LinkSource, MetaStatus } from '@linkshelf/core';
import { z } from 'zod';

export interface Link {
  id: string;
  url: string;
  normalizedUrl: string;
  canonicalUrl: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  domain: string;
  category: CategorySlug;
  suggestedCategory: CategorySlug | null;
  tags: string[];
  keywords: string[];
  status: 'unread' | 'read';
  favorite: boolean;
  source: LinkSource;
  metaStatus: MetaStatus;
  note: string | null;
  importBatchId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const categorySchema = z.enum(['articulos', 'tutoriales', 'projects', 'webpages', 'ia', 'diseno']);

const linkSchema = z.object({
  url: z.string(),
  normalizedUrl: z.string(),
  canonicalUrl: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  domain: z.string(),
  category: categorySchema,
  suggestedCategory: categorySchema.nullable().optional(),
  tags: z.array(z.string()),
  keywords: z.array(z.string()),
  status: z.enum(['unread', 'read']),
  favorite: z.boolean(),
  source: z.enum(['tldr', 'manual', 'import']),
  metaStatus: z.enum(['ok', 'pending', 'failed']),
  note: z.string().nullable().optional(),
  importBatchId: z.string().nullable().optional(),
});

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date ? date : null;
  }
  return null;
}

export function parseLink(id: string, data: unknown): Link {
  const record = typeof data === 'object' && data !== null ? data : {};
  const parsed = linkSchema.parse(record);
  const raw = record as { createdAt?: unknown; updatedAt?: unknown };
  return {
    id,
    url: parsed.url,
    normalizedUrl: parsed.normalizedUrl,
    canonicalUrl: parsed.canonicalUrl ?? null,
    title: parsed.title,
    description: parsed.description ?? null,
    imageUrl: parsed.imageUrl ?? null,
    domain: parsed.domain,
    category: parsed.category,
    suggestedCategory: parsed.suggestedCategory ?? null,
    tags: parsed.tags,
    keywords: parsed.keywords,
    status: parsed.status,
    favorite: parsed.favorite,
    source: parsed.source,
    metaStatus: parsed.metaStatus,
    note: parsed.note ?? null,
    importBatchId: parsed.importBatchId ?? null,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

export type LinkPatch = Partial<
  Pick<
    Link,
    | 'title'
    | 'category'
    | 'tags'
    | 'status'
    | 'favorite'
    | 'note'
    | 'description'
    | 'imageUrl'
    | 'metaStatus'
    | 'canonicalUrl'
  >
>;
