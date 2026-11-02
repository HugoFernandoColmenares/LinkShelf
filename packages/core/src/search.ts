import { unaccent } from './text';

export function damerauLevenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
  for (let i = 0; i < rows; i += 1) matrix[i]![0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const deletion = matrix[i - 1]![j]! + 1;
      const insertion = matrix[i]![j - 1]! + 1;
      const substitution = matrix[i - 1]![j - 1]! + cost;
      let best = Math.min(deletion, insertion, substitution);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, matrix[i - 2]![j - 2]! + 1);
      }
      matrix[i]![j] = best;
    }
  }
  return matrix[a.length]![b.length]!;
}

export function matchesQuery(
  fields: {
    title: string;
    domain: string;
    tags: readonly string[];
    note?: string | null;
    description?: string | null;
  },
  query: string,
): boolean {
  const needle = unaccent(query.toLowerCase()).trim();
  if (!needle) return true;
  const haystack = unaccent(
    [
      fields.title,
      fields.domain,
      fields.tags.join(' '),
      fields.note ?? '',
      fields.description ?? '',
    ]
      .join(' ')
      .toLowerCase(),
  );
  if (haystack.includes(needle)) return true;
  const words = haystack.split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
  const needles = needle.split(/[^a-z0-9]+/).filter(Boolean);
  if (needles.length === 0) return true;
  return needles.every((part) =>
    words.some((word) => {
      if (word.includes(part) || part.includes(word)) return true;
      return part.length >= 5 && word.length >= 5 && damerauLevenshtein(part, word) <= 1;
    }),
  );
}
