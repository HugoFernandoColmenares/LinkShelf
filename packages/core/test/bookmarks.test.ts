import { describe, expect, it } from 'vitest';
import {
  draftBookmarkImport,
  flattenBookmarkNodes,
  parseBookmarkHtml,
  suggestFolderCategory,
} from '../src/bookmarks';
import { normalizeUrl } from '../src/index';

const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3>Barra de favoritos</H3>
  <DL><p>
    <DT><H3>Artículos</H3>
    <DL><p>
      <DT><A HREF="https://www.Example.com/post/?utm_source=tldrnewsletter&utm_medium=email">Guía</A>
      <DT><A HREF="https://example.com/post?fbclid=abc">Otra vez</A>
    </DL><p>
    <DT><H3>IA</H3>
    <DL><p>
      <DT><A HREF="https://openai.com/index/gpt?utm_campaign=launch">OpenAI</A>
      <DT><A HREF="javascript:alert(1)">Malo</A>
    </DL><p>
  </DL><p>
</DL><p>`;

describe('parseBookmarkHtml', () => {
  it('lee carpetas de un HTML Netscape y conserva la URL original', () => {
    const parsed = parseBookmarkHtml(html);
    expect(parsed).toHaveLength(4);
    expect(parsed[0]).toMatchObject({
      title: 'Guía',
      folders: ['Barra de favoritos', 'Artículos'],
    });
    expect(parsed[0]?.url).toContain('utm_source=tldrnewsletter');
    expect(parsed[2]?.folders).toEqual(['Barra de favoritos', 'IA']);
  });
});

describe('suggestFolderCategory', () => {
  it('ignora la barra del navegador y usa la carpeta interna', () => {
    expect(suggestFolderCategory(['Barra de favoritos', 'Artículos'])).toBe('articulos');
    expect(suggestFolderCategory(['Bookmarks bar', 'Design'])).toBe('diseno');
    expect(suggestFolderCategory(['Other bookmarks'])).toBeNull();
  });
});

describe('draftBookmarkImport', () => {
  it('quita utm, colapsa duplicados exactos y marca URLs ilegibles', async () => {
    const drafts = await draftBookmarkImport(parseBookmarkHtml(html), []);
    expect(drafts[0]?.status).toBe('new');
    expect(drafts[0]?.normalizedUrl).toBe(normalizeUrl(drafts[0]?.url ?? ''));
    expect(drafts[0]?.normalizedUrl).toBe('https://example.com/post');
    expect(drafts[0]?.suggestedCategory).toBe('articulos');
    expect(drafts[1]?.status).toBe('exact');
    expect(drafts[1]?.id).toBe(drafts[0]?.id);
    expect(drafts[2]?.suggestedCategory).toBe('ia');
    expect(drafts[2]?.normalizedUrl).not.toContain('utm_');
    expect(drafts[3]?.status).toBe('invalid');
  });

  it('marca como exacto un enlace que ya está en la colección', async () => {
    const first = await draftBookmarkImport(parseBookmarkHtml(html), []);
    const existingId = first[0]?.id ?? '';
    const again = await draftBookmarkImport(parseBookmarkHtml(html).slice(0, 1), [
      {
        id: existingId,
        title: 'Ya guardado',
        normalizedUrl: 'https://example.com/post',
        domain: 'example.com',
        category: 'webpages',
        canonicalUrl: null,
        createdAt: null,
      },
    ]);
    expect(again[0]?.status).toBe('exact');
    expect(again[0]?.duplicateTitle).toBe('Ya guardado');
  });
});

describe('flattenBookmarkNodes', () => {
  it('recorre el árbol de chrome.bookmarks', () => {
    const flat = flattenBookmarkNodes([
      {
        title: '',
        children: [
          {
            title: 'Bookmarks bar',
            children: [
              { title: 'Proyectos', children: [{ title: 'Repo', url: 'https://github.com/a/b' }] },
            ],
          },
        ],
      },
    ]);
    expect(flat).toEqual([
      {
        title: 'Repo',
        url: 'https://github.com/a/b',
        folders: ['Bookmarks bar', 'Proyectos'],
      },
    ]);
    expect(suggestFolderCategory(flat[0]?.folders ?? [])).toBe('projects');
  });
});
