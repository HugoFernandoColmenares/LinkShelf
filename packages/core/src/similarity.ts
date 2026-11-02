import { registrableDomain } from './domain';
import type { CategorySlug } from './categories';
import { unaccent } from './text';

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'from',
  'by',
  'at',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'this',
  'that',
  'it',
  'its',
  'if',
  'but',
  'not',
  'you',
  'your',
  'we',
  'our',
  'they',
  'their',
  'how',
  'what',
  'when',
  'where',
  'who',
  'why',
  'into',
  'over',
  'than',
  'then',
  'too',
  'very',
  'can',
  'just',
  'about',
  'via',
  'de',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'y',
  'o',
  'en',
  'con',
  'por',
  'para',
  'del',
  'al',
  'que',
  'es',
  'se',
  'su',
  'sus',
  'lo',
  'como',
  'mas',
  'ya',
  'si',
  'no',
  'este',
  'esta',
  'esto',
  'hay',
  'son',
  'fue',
  'ser',
]);

const GENERIC_TITLES = new Set([
  'home',
  'github',
  'untitled',
  'inicio',
  'index',
  'welcome',
  'sin titulo',
  'documento sin titulo',
]);

export function normTitle(title: string): string {
  let text = unaccent(title.toLowerCase());
  text = text.replace(/\s+[|·]\s+.+$/u, '');
  text = text.replace(/\s+-\s+(youtube|github|medium|dev\.to|substack|linkedin|twitter|x)$/i, '');
  text = text.replace(/[^\p{L}\p{N}\s]+/gu, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function wordTrigrams(word: string): Set<string> {
  const padded = `  ${word} `;
  const grams = new Set<string>();
  for (let index = 0; index <= padded.length - 3; index += 1) {
    grams.add(padded.slice(index, index + 3));
  }
  return grams;
}

function trigrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (const word of text.split(' ')) {
    if (!word) continue;
    for (const gram of wordTrigrams(word)) grams.add(gram);
  }
  return grams;
}

export function titleSimilarity(a: string, b: string): number {
  const left = normTitle(a);
  const right = normTitle(b);
  if (left.length < 8 || right.length < 8) return 0;
  if (GENERIC_TITLES.has(left) || GENERIC_TITLES.has(right)) return 0;
  if (left === right) return 1;
  const leftGrams = trigrams(left);
  const rightGrams = trigrams(right);
  if (leftGrams.size === 0 || rightGrams.size === 0) return 0;
  let intersection = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) intersection += 1;
  }
  const union = leftGrams.size + rightGrams.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function buildKeywords(title: string): string[] {
  const normalized = unaccent(title.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = normalized
    .split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  const keywords: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    if (keywords.length >= 60 || seen.has(value)) return;
    seen.add(value);
    keywords.push(value);
  };
  for (const token of tokens) push(token);
  for (const token of tokens.slice(0, 8)) {
    const padded = `  ${token}`;
    for (let index = 0; index <= padded.length - 3; index += 1) {
      push(padded.slice(index, index + 3));
      if (keywords.length >= 60) return keywords;
    }
  }
  return keywords;
}

export interface LinkSummary {
  id: string;
  title: string;
  normalizedUrl: string;
  domain: string;
  category: CategorySlug | null;
  canonicalUrl: string | null;
  createdAt: Date | null;
}

export interface DuplicateMatch {
  id: string;
  title: string;
  domain: string;
  category: CategorySlug | null;
  createdAt: Date | null;
  score: number;
  reason: 'same-id' | 'same-canonical' | 'similar-title' | 'same-path';
}

export interface DuplicateCheck {
  level: 'none' | 'possible' | 'probable' | 'exact';
  matches: DuplicateMatch[];
}

export interface DuplicateThresholds {
  probable: number;
  possible: number;
}

export const DEFAULT_THRESHOLDS: DuplicateThresholds = { probable: 0.8, possible: 0.6 };

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function toMatch(
  item: LinkSummary,
  score: number,
  reason: DuplicateMatch['reason'],
): DuplicateMatch {
  return {
    id: item.id,
    title: item.title,
    domain: item.domain,
    category: item.category,
    createdAt: item.createdAt,
    score,
    reason,
  };
}

export function findNearDuplicates(
  candidate: {
    id?: string;
    title: string;
    normalizedUrl: string;
    canonicalUrl?: string | null;
    domain?: string;
  },
  existing: readonly LinkSummary[],
  thresholds: DuplicateThresholds = DEFAULT_THRESHOLDS,
): { level: 'none' | 'possible' | 'probable'; matches: DuplicateMatch[] } {
  let domain = candidate.domain;
  if (!domain) {
    try {
      domain = registrableDomain(new URL(candidate.normalizedUrl).hostname);
    } catch {
      domain = '';
    }
  }
  const candidatePath = pathOf(candidate.normalizedUrl);
  const matches: DuplicateMatch[] = [];
  for (const item of existing) {
    if (item.normalizedUrl === candidate.normalizedUrl) continue;
    if (candidate.id && item.id === candidate.id) continue;
    if (item.domain !== domain) continue;

    let score = 0;
    let reason: DuplicateMatch['reason'] | null = null;
    let level: 'none' | 'possible' | 'probable' = 'none';

    if (
      candidate.canonicalUrl &&
      item.canonicalUrl &&
      candidate.canonicalUrl === item.canonicalUrl
    ) {
      score = 0.95;
      reason = 'same-canonical';
      level = 'probable';
    }

    const similarity = titleSimilarity(candidate.title, item.title);
    if (similarity >= thresholds.probable && similarity >= score) {
      score = similarity;
      reason = 'similar-title';
      level = 'probable';
    } else if (similarity >= thresholds.possible && level !== 'probable') {
      score = similarity * 0.9;
      reason = 'similar-title';
      level = 'possible';
    }

    const samePath =
      candidatePath !== '/' && candidatePath !== '' && candidatePath === pathOf(item.normalizedUrl);
    if (samePath && level !== 'probable') {
      score = Math.max(score, similarity * 0.9, thresholds.possible);
      reason = reason ?? 'same-path';
      level = 'possible';
    }

    if (level !== 'none' && reason) matches.push(toMatch(item, score, reason));
  }

  matches.sort((a, b) => b.score - a.score);
  const level = matches.some(
    (match) => match.score >= thresholds.probable || match.reason === 'same-canonical',
  )
    ? 'probable'
    : matches.length > 0
      ? 'possible'
      : 'none';
  return { level, matches };
}

export function duplicateCheck(
  candidate: {
    id: string;
    title: string;
    normalizedUrl: string;
    canonicalUrl: string | null;
    domain: string;
  },
  existing: readonly LinkSummary[],
  thresholds: DuplicateThresholds = DEFAULT_THRESHOLDS,
): DuplicateCheck {
  const exact = existing.find(
    (item) => item.id === candidate.id || item.normalizedUrl === candidate.normalizedUrl,
  );
  if (exact) {
    return { level: 'exact', matches: [toMatch(exact, 1, 'same-id')] };
  }
  return findNearDuplicates(candidate, existing, thresholds);
}
