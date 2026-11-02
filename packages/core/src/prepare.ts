import type { CategorySlug } from './categories';
import { registrableDomain } from './domain';
import { suggestCategory, type CategorySuggestion } from './categorize';
import { linkIdFor } from './link-id';
import { extractMetadata } from './metadata';
import { normalizeUrl } from './normalize';
import { buildKeywords } from './similarity';
import { stripInvisible } from './text';

export type LinkSource = 'tldr' | 'manual' | 'import';
export type MetaStatus = 'ok' | 'pending' | 'failed';

export interface PreparedLink {
  id: string;
  url: string;
  normalizedUrl: string;
  canonicalUrl: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  domain: string;
  keywords: string[];
  suggestion: CategorySuggestion;
  source: LinkSource;
  metaStatus: MetaStatus;
  ogType: string | null;
  articlePublishedTime: string | null;
}

export function detectSource(originalUrl: string): Exclude<LinkSource, 'import'> {
  if (/tldrnewsletter\.com/i.test(originalUrl) || /[?&#]utm_source=tldr/i.test(originalUrl))
    return 'tldr';
  return 'manual';
}

function clip(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function safeImage(value: string | undefined): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return value;
  } catch {
    return null;
  }
}

export async function prepareLink(input: {
  url: string;
  title?: string;
  description?: string;
  html?: string;
  source?: LinkSource;
  defaultCategory?: CategorySlug;
}): Promise<PreparedLink> {
  const original = stripInvisible(input.url.trim());
  let normalizedUrl = normalizeUrl(original);
  const metadata = input.html ? extractMetadata(input.html, normalizedUrl) : {};
  let canonicalUrl: string | null = null;
  if (metadata.canonicalUrl) {
    try {
      const canonicalNormalized = normalizeUrl(metadata.canonicalUrl);
      const sameDomain =
        registrableDomain(new URL(canonicalNormalized).hostname) ===
        registrableDomain(new URL(normalizedUrl).hostname);
      if (sameDomain) {
        canonicalUrl = canonicalNormalized;
        normalizedUrl = canonicalNormalized;
      }
    } catch {
      canonicalUrl = null;
    }
  }

  const title = (metadata.title || input.title || normalizedUrl).trim().slice(0, 500);
  const description = clip(metadata.description || input.description, 1000);
  const imageUrl = safeImage(metadata.imageUrl);
  const domain = registrableDomain(new URL(normalizedUrl).hostname);
  const suggestionInput = {
    url: normalizedUrl,
    title,
    ...(description ? { description } : {}),
    ...(metadata.ogType ? { ogType: metadata.ogType } : {}),
    ...(metadata.articlePublishedTime
      ? { articlePublishedTime: metadata.articlePublishedTime }
      : {}),
    ...(input.defaultCategory ? { defaultCategory: input.defaultCategory } : {}),
  };
  const suggestion = suggestCategory(suggestionInput);
  let metaStatus: MetaStatus = 'pending';
  if (input.html !== undefined) {
    metaStatus = metadata.title || metadata.description || metadata.canonicalUrl ? 'ok' : 'failed';
  }

  return {
    id: await linkIdFor(normalizedUrl),
    url: original.slice(0, 2048),
    normalizedUrl,
    canonicalUrl,
    title,
    description,
    imageUrl,
    domain,
    keywords: buildKeywords(title),
    suggestion,
    source: input.source ?? detectSource(original),
    metaStatus,
    ogType: metadata.ogType ?? null,
    articlePublishedTime: metadata.articlePublishedTime ?? null,
  };
}
