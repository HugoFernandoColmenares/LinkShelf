import {
  CATEGORY_PRECEDENCE,
  categoryBySlug,
  isFormatCategory,
  type CategorySlug,
} from './categories';
import { stripHostPrefixes } from './domain';
import { unaccent } from './text';

export interface CategoryContext {
  url: string;
  title?: string;
  description?: string;
  ogType?: string | null;
  articlePublishedTime?: string | null;
  defaultCategory?: CategorySlug;
}

export interface CategorySuggestion {
  category: CategorySlug;
  tags: string[];
  confidence: number;
  lowConfidence: boolean;
  reasons: string[];
}

interface Matcher {
  hosts?: readonly string[];
  pathRegex?: RegExp;
  keywords?: readonly string[];
  ogType?: readonly string[];
  requireNoPublishedTime?: boolean;
}

interface Rule {
  id: string;
  category?: CategorySlug;
  tags?: readonly string[];
  weight: number;
  match: Matcher;
  reason: string;
}

const RULES: readonly Rule[] = [
  {
    id: 'host-github-repo',
    category: 'projects',
    weight: 1,
    reason: 'github.com → Projects',
    match: {
      hosts: ['github.com', 'gitlab.com', 'codeberg.org'],
      pathRegex: /^\/[^/]+\/[^/]+/,
    },
  },
  {
    id: 'host-arxiv-doi',
    category: 'articulos',
    weight: 1,
    reason: 'paper → Artículos',
    match: {
      hosts: [
        'arxiv.org',
        'doi.org',
        'nature.com',
        '*.nature.com',
        'science.org',
        'pubmed.ncbi.nlm.nih.gov',
        'researchgate.net',
        'acm.org',
        'ieee.org',
        'biorxiv.org',
      ],
    },
  },
  {
    id: 'path-pdf-paper',
    category: 'articulos',
    weight: 0.6,
    reason: 'PDF con abstract → Artículos',
    match: { pathRegex: /\.pdf$/i, keywords: ['abstract'] },
  },
  {
    id: 'kw-tutorial',
    category: 'tutoriales',
    tags: ['tutorial'],
    weight: 0.6,
    reason: 'palabras de tutorial → Tutoriales',
    match: {
      keywords: [
        'paso a paso',
        'step by step',
        'how to',
        'como hacer',
        'tutorial',
        'guide to',
        'getting started',
        'build a',
        'crea un',
      ],
    },
  },
  {
    id: 'host-tutorial',
    category: 'tutoriales',
    weight: 0.5,
    reason: 'sitio de tutoriales → Tutoriales',
    match: { hosts: ['freecodecamp.org', 'css-tricks.com', 'egghead.io'] },
  },
  {
    id: 'host-webdev-learn',
    category: 'tutoriales',
    weight: 0.5,
    reason: 'web.dev/learn → Tutoriales',
    match: { hosts: ['web.dev'], pathRegex: /^\/learn/ },
  },
  {
    id: 'host-ai',
    category: 'ia',
    weight: 0.8,
    reason: 'sitio de IA → IA',
    match: {
      hosts: [
        'openai.com',
        'anthropic.com',
        'huggingface.co',
        'deepmind.google',
        'ai.meta.com',
        'mistral.ai',
        'x.ai',
      ],
    },
  },
  {
    id: 'kw-ai',
    category: 'ia',
    tags: ['ia'],
    weight: 0.5,
    reason: 'términos de IA',
    match: {
      keywords: [
        'llm',
        'gpt',
        'chatgpt',
        'inteligencia artificial',
        'artificial intelligence',
        'machine learning',
        'ai agent',
        'agente',
        'agent',
        'agents',
        'rag',
        'transformer',
        'diffusion',
        'prompt',
        'ai',
      ],
    },
  },
  {
    id: 'host-design',
    category: 'diseno',
    weight: 0.8,
    reason: 'sitio de diseño → Diseño',
    match: { hosts: ['smashingmagazine.com', 'nngroup.com', 'uxdesign.cc', 'alistapart.com'] },
  },
  {
    id: 'host-figma-blog',
    category: 'diseno',
    weight: 0.8,
    reason: 'figma.com/blog → Diseño',
    match: { hosts: ['figma.com'], pathRegex: /^\/blog/ },
  },
  {
    id: 'host-fonts-knowledge',
    category: 'diseno',
    weight: 0.8,
    reason: 'fonts.google.com/knowledge → Diseño',
    match: { hosts: ['fonts.google.com'], pathRegex: /^\/knowledge/ },
  },
  {
    id: 'kw-design',
    category: 'diseno',
    tags: ['diseno'],
    weight: 0.5,
    reason: 'términos de diseño',
    match: {
      keywords: [
        'ux',
        'ui design',
        'tipografia',
        'typography',
        'color palette',
        'diseno',
        'design system',
        'accesibilidad',
      ],
    },
  },
  {
    id: 'host-webpages',
    category: 'webpages',
    weight: 0.7,
    reason: 'sitio interactivo → WebPages',
    match: {
      hosts: [
        'uiverse.io',
        'neal.fun',
        'codepen.io',
        'itch.io',
        'excalidraw.com',
        '*.vercel.app',
        '*.netlify.app',
        '*.github.io',
      ],
    },
  },
  {
    id: 'og-website',
    category: 'webpages',
    weight: 0.3,
    reason: 'og:type website → WebPages',
    match: { ogType: ['website'], requireNoPublishedTime: true },
  },
];

function hostMatches(host: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === pattern || host.endsWith(`.${pattern}`);
}

function keywordText(host: string, path: string, title: string, description: string): string {
  return unaccent(`${title} ${description} ${host} ${path}`.toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasKeyword(text: string, keyword: string): boolean {
  const normalized = unaccent(keyword.toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!normalized) return false;
  if (normalized.includes(' ')) return text.includes(normalized);
  if (normalized.length <= 3) return new RegExp(`(?:^|\\s)${normalized}(?:\\s|$)`).test(text);
  return text.includes(normalized);
}

function ruleMatches(
  rule: Rule,
  host: string,
  path: string,
  text: string,
  ctx: CategoryContext,
): boolean {
  const { match } = rule;
  if (match.hosts && !match.hosts.some((pattern) => hostMatches(host, pattern))) return false;
  if (match.pathRegex && !match.pathRegex.test(path)) return false;
  if (match.keywords && !match.keywords.some((keyword) => hasKeyword(text, keyword))) return false;
  if (match.ogType && (!ctx.ogType || !match.ogType.includes(ctx.ogType))) return false;
  if (match.requireNoPublishedTime && ctx.articlePublishedTime) return false;
  return true;
}

function emptyScores(): Record<CategorySlug, number> {
  return { articulos: 0, tutoriales: 0, projects: 0, webpages: 0, ia: 0, diseno: 0 };
}

export function suggestCategory(ctx: CategoryContext): CategorySuggestion {
  let host = '';
  let path = '/';
  try {
    const url = new URL(ctx.url);
    host = stripHostPrefixes(url.hostname);
    path = url.pathname || '/';
  } catch {
    host = '';
  }
  const text = keywordText(host, path, ctx.title ?? '', ctx.description ?? '');
  const scores = emptyScores();
  const tags = new Set<string>();
  const reasons: string[] = [];

  for (const rule of RULES) {
    if (!ruleMatches(rule, host, path, text, ctx)) continue;
    if (rule.category) scores[rule.category] += rule.weight;
    for (const tag of rule.tags ?? []) tags.add(tag);
    reasons.push(rule.reason);
  }

  if (ctx.ogType === 'article') {
    scores.webpages = Math.max(0, scores.webpages - 0.2);
    reasons.push('og:type article reduce WebPages');
  }

  let best: CategorySlug | null = null;
  let bestScore = 0;
  for (const slug of CATEGORY_PRECEDENCE) {
    const score = scores[slug];
    if (score > bestScore) {
      bestScore = score;
      best = slug;
    }
  }

  const lowConfidence = bestScore < 0.4;
  const fallback = ctx.defaultCategory ?? 'webpages';
  const category = lowConfidence ? fallback : (best ?? fallback);
  if (lowConfidence) reasons.push('Confianza baja: se usa la categoría por defecto');

  if (isFormatCategory(category)) {
    if (scores.ia >= 0.4) tags.add('ia');
    if (scores.diseno >= 0.4) tags.add('diseno');
  }

  return {
    category,
    tags: [...tags],
    confidence: Math.min(1, bestScore),
    lowConfidence,
    reasons,
  };
}

export function categoryName(slug: CategorySlug): string {
  return categoryBySlug(slug)?.name ?? slug;
}
