import { describe, expect, it, vi } from 'vitest';
import {
  InvalidUrlError,
  categoryBySlug,
  categoryName,
  duplicateCheck,
  extractMetadata,
  findNearDuplicates,
  isCategorySlug,
  isFormatCategory,
  isPrivateHostname,
  matchesQuery,
  needsNetworkRedirect,
  normalizeUrl,
  prepareLink,
  registrableDomain,
  resolveRedirects,
  strippedTrackingParamNames,
  suggestCategory,
  unwrapKnownRedirects,
} from '../src/index';

describe('casos extra de normalización', () => {
  it('cubre hash-bang, puertos, hosts y reglas que faltaban', () => {
    expect(normalizeUrl('https://example.com/#!/dash?utm_source=x')).toBe(
      'https://example.com/#!/dash',
    );
    expect(normalizeUrl('https://example.com:443/a')).toBe('https://example.com/a');
    expect(normalizeUrl('http://example.com:443/a')).toBe('https://example.com/a');
    expect(normalizeUrl('https://youtube.com/watch?v=abc&list=PL1&feature=share')).toBe(
      'https://youtube.com/watch?list=PL1&v=abc',
    );
    expect(normalizeUrl('https://github.com/vercel/next.js/issues')).toBe(
      'https://github.com/vercel/next.js',
    );
    expect(normalizeUrl('https://github.com/vercel/next.js/blob/canary')).toBe(
      'https://github.com/vercel/next.js',
    );
    expect(normalizeUrl('https://github.com/vercel/next.js/blob/canary/readme.rst')).toBe(
      'https://github.com/vercel/next.js',
    );
    expect(normalizeUrl('https://www.amazon.co.uk/nombre/dp/b08n5wrwnw')).toBe(
      'https://amazon.co.uk/dp/B08N5WRWNW',
    );
    expect(normalizeUrl('https://blog.medium.com/post?source=rss')).toBe(
      'https://blog.medium.com/post',
    );
    expect(normalizeUrl('https://example.com/a?b=2&b=1')).toBe('https://example.com/a?b=1&b=2');
    expect(normalizeUrl('https://example.com/%ZZ')).toBe('https://example.com/%25ZZ');
    expect(normalizeUrl(`https://www.m.example.com/${'a'.repeat(20)}`)).toContain(
      'https://example.com/',
    );
  });

  it('rechaza URLs vacías, enormes o ilegibles', () => {
    expect(() => normalizeUrl('   ')).toThrow(InvalidUrlError);
    expect(() => normalizeUrl(`https://example.com/${'a'.repeat(5000)}`)).toThrow(InvalidUrlError);
    expect(() => normalizeUrl('http://')).toThrow(InvalidUrlError);
    expect(strippedTrackingParamNames('%%%')).toEqual([]);
  });

  it('desenvuelve el resto de wrappers', () => {
    expect(
      unwrapKnownRedirects('https://www.google.com/url?url=https%3A%2F%2Fexample.com%2Fz'),
    ).toBe('https://example.com/z');
    expect(
      unwrapKnownRedirects('https://lm.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Fq'),
    ).toBe('https://example.com/q');
    expect(unwrapKnownRedirects('https://tracking.tldrnewsletter.com/CL0/%/1/x')).toBe('%');
    expect(unwrapKnownRedirects('%%%')).toBe('%%%');
    expect(needsNetworkRedirect('https://tracking.tldrnewsletter.com/short')).toBe(true);
    expect(needsNetworkRedirect('https://www.lnkd.in/abc')).toBe(true);
    expect(needsNetworkRedirect('%%%')).toBe(false);
  });
});

describe('dominio, categorías y búsqueda', () => {
  it('resuelve IPs y categorías auxiliares', () => {
    expect(registrableDomain('8.8.8.8')).toBe('8.8.8.8');
    expect(registrableDomain('[::1]')).toBe('::1');
    expect(isCategorySlug('ia')).toBe(true);
    expect(isCategorySlug('nope')).toBe(false);
    expect(categoryBySlug('diseno')?.name).toBe('Diseño');
    expect(categoryBySlug('nope')).toBeUndefined();
    expect(categoryName('projects')).toBe('Projects');
    expect(isFormatCategory('ia')).toBe(false);
    expect(isFormatCategory('tutoriales')).toBe(true);
  });

  it('aplica la categoría por defecto y etiquetas de diseño', () => {
    const fallback = suggestCategory({
      url: 'https://example.com/x',
      defaultCategory: 'articulos',
    });
    expect(fallback.category).toBe('articulos');
    const designRepo = suggestCategory({
      url: 'https://github.com/acme/ui',
      title: 'A design system for products',
    });
    expect(designRepo.category).toBe('projects');
    expect(designRepo.tags).toContain('diseno');
    expect(suggestCategory({ url: 'esto no es una url' }).category).toBe('webpages');
    const published = suggestCategory({
      url: 'https://example.com/tool',
      ogType: 'website',
      articlePublishedTime: '2026-01-01',
    });
    expect(published.confidence).toBe(0);
  });

  it('busca en nota y descripción y acepta una consulta vacía', () => {
    const fields = {
      title: 'Angular',
      domain: 'example.com',
      tags: [],
      note: 'pendiente',
      description: 'guia',
    };
    expect(matchesQuery(fields, '   ')).toBe(true);
    expect(matchesQuery(fields, '...')).toBe(true);
    expect(matchesQuery(fields, 'pendiente')).toBe(true);
    expect(matchesQuery(fields, 'angularjs')).toBe(true);
  });
});

describe('prepareLink y metadatos', () => {
  it('recorta descripción, ignora imágenes inseguras y un canonical roto', async () => {
    const prepared = await prepareLink({
      url: 'https://example.com/post',
      description: `  ${'d'.repeat(50)}  `,
      source: 'import',
      defaultCategory: 'ia',
      html: [
        '<meta property="og:image" content="javascript:alert(1)">',
        '<meta property="og:description" content="Visible">',
        '<link rel="canonical" href="http://%">',
        '<meta name="description" content="segunda">',
      ].join(''),
    });
    expect(prepared.source).toBe('import');
    expect(prepared.description).toBe('Visible');
    expect(prepared.imageUrl).toBeNull();
    expect(prepared.canonicalUrl).toBeNull();
    expect(prepared.suggestion.category).toBeTruthy();
  });

  it('descarta una imagen demasiado larga y decodifica entidades numéricas', async () => {
    const longImage = `https://cdn.example.com/${'a'.repeat(2100)}.png`;
    const prepared = await prepareLink({
      url: 'https://example.com/img',
      html: `<meta property="og:image" content="${longImage}"><title>&#65;lfa</title>`,
    });
    expect(prepared.imageUrl).toBeNull();
    expect(prepared.title).toBe('Alfa');
    const meta = extractMetadata(
      '<meta property="og:image" content="http://[">',
      'https://example.com/',
    );
    expect(meta.imageUrl).toBe('http://[');
  });
});

describe('duplicados con umbrales y resolve', () => {
  it('deriva el dominio y usa el umbral de posible', () => {
    const existing = [
      {
        id: '1',
        title: 'Cómo construir un agente con TypeScript',
        normalizedUrl: 'https://blog.example.com/a',
        domain: 'example.com',
        category: 'tutoriales' as const,
        canonicalUrl: null,
        createdAt: new Date('2026-10-01'),
      },
    ];
    const possible = findNearDuplicates(
      {
        title: 'Cómo construir un agente con TypeScript y notas',
        normalizedUrl: 'https://blog.example.com/b',
        canonicalUrl: null,
      },
      existing,
      { probable: 0.99, possible: 0.2 },
    );
    expect(possible.level === 'possible' || possible.level === 'probable').toBe(true);

    const none = duplicateCheck(
      {
        id: 'otro',
        title: 'Receta de pan de masa madre',
        normalizedUrl: 'https://otro.test/pan',
        canonicalUrl: null,
        domain: 'otro.test',
      },
      existing,
    );
    expect(none.level).toBe('none');

    const broken = findNearDuplicates(
      { title: 'Titulo suficientemente largo', normalizedUrl: 'no-es-url', canonicalUrl: null },
      existing,
    );
    expect(broken.level).toBe('none');
  });

  it('cubre errores de red, 403, tope de saltos y HTML grande', async () => {
    expect(isPrivateHostname('0.0.0.0')).toBe(true);
    expect(isPrivateHostname('fe80::1')).toBe(true);
    expect(isPrivateHostname('fd00::1')).toBe(true);
    expect(isPrivateHostname('8.8.8.8')).toBe(false);
    expect(isPrivateHostname('::')).toBe(true);

    await expect(resolveRedirects('ftp://example.com/a')).rejects.toBeInstanceOf(InvalidUrlError);

    const boom = vi.fn(async () => {
      throw new Error('red');
    });
    await expect(
      resolveRedirects('https://example.com/a', { fetch: boom as typeof fetch }),
    ).rejects.toThrow('red');

    const forbidden = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 403 });
      return new Response('texto', { status: 200, headers: { 'content-type': 'text/plain' } });
    });
    const plain = await resolveRedirects('https://example.com/a', {
      fetch: forbidden as typeof fetch,
    });
    expect(plain.html).toBeUndefined();

    const noLocation = vi.fn(async () => new Response(null, { status: 302 }));
    const stayed = await resolveRedirects('https://example.com/a', {
      fetch: noLocation as typeof fetch,
    });
    expect(stayed.hops).toBe(0);

    const loop = vi.fn(async (input: RequestInfo | URL) => {
      const current = String(input);
      const next = current.endsWith('/9') ? 'https://example.com/done' : `${current}9`;
      return new Response(null, { status: 302, headers: { location: next.replace(/9{2,}/, '9') } });
    });
    const capped = await resolveRedirects('https://example.com/r', {
      fetch: loop as typeof fetch,
      maxRedirects: 1,
    });
    expect(capped.hops).toBeGreaterThanOrEqual(1);

    const huge = `<html><title>x</title>${'a'.repeat(600 * 1024)}</html>`;
    const big = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 405 });
      return new Response(huge, { status: 200, headers: { 'content-type': 'text/html' } });
    });
    const limited = await resolveRedirects('https://example.com/big', {
      fetch: big as typeof fetch,
    });
    expect(limited.html?.length).toBeLessThanOrEqual(512 * 1024);
  });
});
