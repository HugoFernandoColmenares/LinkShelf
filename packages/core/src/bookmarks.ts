import { isCategorySlug, type CategorySlug } from './categories';
import { InvalidUrlError } from './errors';
import { prepareLink } from './prepare';
import { duplicateCheck, type LinkSummary } from './similarity';
import { unaccent } from './text';

export interface ParsedBookmark {
  url: string;
  title: string;
  folders: string[];
}

export interface BookmarkNode {
  title?: string;
  url?: string;
  children?: readonly BookmarkNode[];
}

export type BookmarkDraftStatus = 'new' | 'exact' | 'probable' | 'possible' | 'invalid';

export interface BookmarkDraft {
  url: string;
  title: string;
  folders: string[];
  folderKey: string;
  status: BookmarkDraftStatus;
  normalizedUrl: string | null;
  id: string | null;
  domain: string | null;
  duplicateTitle: string | null;
  suggestedCategory: CategorySlug;
  reason: string | null;
}

const FOLDER_ALIASES: Record<string, CategorySlug> = {
  articulos: 'articulos',
  articulo: 'articulos',
  articles: 'articulos',
  article: 'articulos',
  papers: 'articulos',
  tutoriales: 'tutoriales',
  tutorial: 'tutoriales',
  tutorials: 'tutoriales',
  guias: 'tutoriales',
  projects: 'projects',
  project: 'projects',
  proyectos: 'projects',
  proyecto: 'projects',
  repos: 'projects',
  repositorios: 'projects',
  webpages: 'webpages',
  webpage: 'webpages',
  webs: 'webpages',
  sitios: 'webpages',
  paginas: 'webpages',
  ia: 'ia',
  ai: 'ia',
  'inteligencia artificial': 'ia',
  'artificial intelligence': 'ia',
  diseno: 'diseno',
  design: 'diseno',
  ux: 'diseno',
};

const GENERIC_FOLDERS = new Set([
  'bookmarks',
  'bookmarks bar',
  'bookmark bar',
  'barra de favoritos',
  'barra de marcadores',
  'other bookmarks',
  'otros favoritos',
  'otros marcadores',
  'mobile bookmarks',
  'marcadores moviles',
  'favoritos del movil',
  'bookmarks menu',
  'menu marcadores',
  'toolbar',
  'unsorted',
  'sin clasificar',
]);

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function folderLabel(name: string): string {
  return unaccent(name.toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Propone una categoría de LinkShelf a partir de los nombres de carpeta del navegador. */
export function suggestFolderCategory(folders: readonly string[]): CategorySlug | null {
  for (let index = folders.length - 1; index >= 0; index -= 1) {
    const label = folderLabel(folders[index] ?? '');
    if (!label || GENERIC_FOLDERS.has(label)) continue;
    const slug = FOLDER_ALIASES[label];
    if (slug && isCategorySlug(slug)) return slug;
  }
  return null;
}

export function folderKey(folders: readonly string[]): string {
  return folders.length > 0 ? folders.join(' / ') : '(sin carpeta)';
}

/**
 * Lee un HTML de favoritos/marcadores en formato Netscape.
 * Lo exportan Chrome, Edge, Brave (Favoritos) y Firefox (Marcadores).
 */
export function parseBookmarkHtml(html: string): ParsedBookmark[] {
  const bookmarks: ParsedBookmark[] = [];
  const stack: string[] = [];
  const pattern = /<H3\b[^>]*>([\s\S]*?)<\/H3>|<A\b([^>]*)>([\s\S]*?)<\/A>|<\/DL\b/gi;
  for (const match of html.matchAll(pattern)) {
    if (match[1] !== undefined) {
      const name = decodeHtml(match[1]);
      if (name) stack.push(name);
      continue;
    }
    if (match[2] !== undefined) {
      const href = /\bHREF\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(match[2]);
      const url = decodeHtml(href?.[1] ?? href?.[2] ?? '');
      if (!url) continue;
      const title = decodeHtml(match[3] ?? '') || url;
      bookmarks.push({ url, title, folders: [...stack] });
      continue;
    }
    stack.pop();
  }
  return bookmarks;
}

export function flattenBookmarkNodes(
  nodes: readonly BookmarkNode[],
  folders: readonly string[] = [],
): ParsedBookmark[] {
  const bookmarks: ParsedBookmark[] = [];
  for (const node of nodes) {
    const title = (node.title ?? '').trim();
    if (node.url)
      bookmarks.push({ url: node.url, title: title || node.url, folders: [...folders] });
    if (node.children) {
      const next = title && !node.url ? [...folders, title] : folders;
      bookmarks.push(...flattenBookmarkNodes(node.children, next));
    }
  }
  return bookmarks;
}

export async function draftBookmarkImport(
  bookmarks: readonly ParsedBookmark[],
  existing: readonly LinkSummary[],
): Promise<BookmarkDraft[]> {
  const seen = new Set<string>(existing.map((item) => item.id));
  const titles = new Map(existing.map((item) => [item.id, item.title]));
  const drafts: BookmarkDraft[] = [];

  for (const bookmark of bookmarks) {
    const folders = bookmark.folders;
    const key = folderKey(folders);
    try {
      const prepared = await prepareLink({
        url: bookmark.url,
        title: bookmark.title,
        source: 'import',
      });
      if (seen.has(prepared.id)) {
        drafts.push({
          url: bookmark.url,
          title: prepared.title,
          folders,
          folderKey: key,
          status: 'exact',
          normalizedUrl: prepared.normalizedUrl,
          id: prepared.id,
          domain: prepared.domain,
          duplicateTitle: titles.get(prepared.id) ?? prepared.title,
          suggestedCategory: suggestFolderCategory(folders) ?? prepared.suggestion.category,
          reason: 'Misma URL normalizada',
        });
        continue;
      }
      const duplicate = duplicateCheck(
        {
          id: prepared.id,
          title: prepared.title,
          normalizedUrl: prepared.normalizedUrl,
          canonicalUrl: prepared.canonicalUrl,
          domain: prepared.domain,
        },
        existing,
      );
      const status: BookmarkDraftStatus =
        duplicate.level === 'none'
          ? 'new'
          : duplicate.level === 'exact'
            ? 'exact'
            : duplicate.level;
      drafts.push({
        url: bookmark.url,
        title: prepared.title,
        folders,
        folderKey: key,
        status,
        normalizedUrl: prepared.normalizedUrl,
        id: prepared.id,
        domain: prepared.domain,
        duplicateTitle: duplicate.matches[0]?.title ?? null,
        suggestedCategory: suggestFolderCategory(folders) ?? prepared.suggestion.category,
        reason: duplicate.matches[0]?.reason ?? null,
      });
      seen.add(prepared.id);
      titles.set(prepared.id, prepared.title);
    } catch (error) {
      drafts.push({
        url: bookmark.url,
        title: bookmark.title,
        folders,
        folderKey: key,
        status: 'invalid',
        normalizedUrl: null,
        id: null,
        domain: null,
        duplicateTitle: null,
        suggestedCategory: suggestFolderCategory(folders) ?? 'webpages',
        reason: error instanceof InvalidUrlError ? error.message : 'URL ilegible',
      });
    }
  }
  return drafts;
}
