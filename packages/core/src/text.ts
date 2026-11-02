export function stripInvisible(value: string): string {
  return value
    .replaceAll('\u200B', '')
    .replaceAll('\uFEFF', '')
    .replaceAll('\u200C', '')
    .replaceAll('\u200D', '')
    .replaceAll('\u2060', '');
}

export function unaccent(value: string): string {
  return value.normalize('NFD').replace(/\p{M}+/gu, '');
}

export function slugifyTag(input: string): string | null {
  const slug = unaccent(input.trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return /^[a-z0-9-]{1,32}$/.test(slug) ? slug : null;
}
