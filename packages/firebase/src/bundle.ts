import {
  LINK_ID_PATTERN,
  linkIdFor,
  type CategorySlug,
  type LinkSource,
  type MetaStatus,
} from '@linkshelf/core';
import { z } from 'zod';
import type { Link } from './link';

const categorySchema = z.enum(['articulos', 'tutoriales', 'projects', 'webpages', 'ia', 'diseno']);

export interface StoredLink {
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
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LinkBundle {
  format: 'linkshelf-links';
  version: 1;
  exportedAt: string;
  links: StoredLink[];
}

export interface BundleImportResult {
  created: number;
  updated: number;
  skipped: number;
}

const httpUrl = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^https?:\/\/.+/);

const storedLinkSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/),
  url: httpUrl,
  normalizedUrl: httpUrl,
  canonicalUrl: z.string().max(2048).nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(1000).nullable().optional(),
  imageUrl: z.string().max(2048).nullable().optional(),
  domain: z.string().min(1).max(253),
  category: categorySchema,
  suggestedCategory: categorySchema.nullable().optional(),
  tags: z.array(z.string().max(80)).max(10),
  keywords: z.array(z.string().max(500)).max(60),
  status: z.enum(['unread', 'read']),
  favorite: z.boolean(),
  source: z.enum(['tldr', 'manual', 'import']),
  metaStatus: z.enum(['ok', 'pending', 'failed']),
  note: z.string().max(2000).nullable().optional(),
  importBatchId: z.string().max(80).nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

const envelopeSchema = z.object({
  format: z.literal('linkshelf-links'),
  version: z.literal(1),
  exportedAt: z.string().optional(),
  links: z.array(z.unknown()).max(5000),
});

function dateToIso(value: Date | null): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

export function linkToStored(link: Link): StoredLink {
  return {
    id: link.id,
    url: link.url,
    normalizedUrl: link.normalizedUrl,
    canonicalUrl: link.canonicalUrl,
    title: link.title,
    description: link.description,
    imageUrl: link.imageUrl,
    domain: link.domain,
    category: link.category,
    suggestedCategory: link.suggestedCategory,
    tags: link.tags,
    keywords: link.keywords,
    status: link.status,
    favorite: link.favorite,
    source: link.source,
    metaStatus: link.metaStatus,
    note: link.note,
    importBatchId: link.importBatchId,
    createdAt: dateToIso(link.createdAt),
    updatedAt: dateToIso(link.updatedAt),
  };
}

export function parseStoredLink(input: unknown): StoredLink | null {
  const parsed = storedLinkSchema.safeParse(input);
  if (!parsed.success) return null;
  const link = parsed.data;
  return {
    id: link.id,
    url: link.url,
    normalizedUrl: link.normalizedUrl,
    canonicalUrl: link.canonicalUrl ?? null,
    title: link.title,
    description: link.description ?? null,
    imageUrl: link.imageUrl ?? null,
    domain: link.domain,
    category: link.category,
    suggestedCategory: link.suggestedCategory ?? null,
    tags: link.tags,
    keywords: link.keywords,
    status: link.status,
    favorite: link.favorite,
    source: link.source,
    metaStatus: link.metaStatus,
    note: link.note ?? null,
    importBatchId: link.importBatchId ?? null,
    createdAt: link.createdAt ?? null,
    updatedAt: link.updatedAt ?? null,
  };
}

export function parseBundleEnvelope(input: unknown): { exportedAt: string; links: unknown[] } {
  const parsed = envelopeSchema.safeParse(input);
  if (!parsed.success) throw new Error('El archivo no es un JSON de LinkShelf.');
  return {
    exportedAt: parsed.data.exportedAt ?? new Date().toISOString(),
    links: parsed.data.links,
  };
}

export function bundleFromLinks(
  links: readonly Link[],
  exportedAt = new Date().toISOString(),
): LinkBundle {
  return {
    format: 'linkshelf-links',
    version: 1,
    exportedAt,
    links: links.map(linkToStored),
  };
}

export async function storedIdMatches(link: StoredLink): Promise<boolean> {
  if (!LINK_ID_PATTERN.test(link.id)) return false;
  return (await linkIdFor(link.normalizedUrl)) === link.id;
}
