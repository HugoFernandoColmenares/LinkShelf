export interface PageMetadata {
  title?: string;
  description?: string;
  imageUrl?: string;
  canonicalUrl?: string;
  ogType?: string;
  siteName?: string;
  articlePublishedTime?: string;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const code = Number(digits);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2];
}

function absolutize(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

export function extractMetadata(html: string, baseUrl: string): PageMetadata {
  const meta: PageMetadata = {};
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = (attribute(tag, 'property') ?? attribute(tag, 'name') ?? '').toLowerCase();
    const content = attribute(tag, 'content');
    if (!key || !content) continue;
    const value = decodeEntities(content);
    if (key === 'og:title' && !meta.title) meta.title = value;
    else if ((key === 'og:description' || key === 'description') && !meta.description)
      meta.description = value;
    else if (key === 'og:image' && !meta.imageUrl) meta.imageUrl = absolutize(value, baseUrl);
    else if (key === 'og:url' && !meta.canonicalUrl) meta.canonicalUrl = absolutize(value, baseUrl);
    else if (key === 'og:type' && !meta.ogType) meta.ogType = value;
    else if (key === 'og:site_name' && !meta.siteName) meta.siteName = value;
    else if (key === 'article:published_time' && !meta.articlePublishedTime)
      meta.articlePublishedTime = value;
  }
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const link of links) {
    const rel = (attribute(link, 'rel') ?? '').toLowerCase();
    if (!rel.split(/\s+/).includes('canonical')) continue;
    const href = attribute(link, 'href');
    if (href) meta.canonicalUrl = absolutize(decodeEntities(href), baseUrl);
  }
  if (!meta.title) {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    if (title) meta.title = decodeEntities(title);
  }
  return meta;
}
