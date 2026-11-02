import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  InvalidUrlError,
  isTrackingParam,
  linkIdFor,
  needsNetworkRedirect,
  normalizeUrl,
  registrableDomain,
  strippedTrackingParamNames,
  unwrapKnownRedirects,
} from '../src/index';

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/urls.json', import.meta.url), 'utf8'),
) as Array<{
  input: string;
  expected: string;
}>;

describe('normalizeUrl', () => {
  it.each(fixtures)('$input → $expected', ({ input, expected }) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it('es idempotente en los ejemplos', () => {
    for (const fixture of fixtures) {
      const once = normalizeUrl(fixture.input);
      expect(normalizeUrl(once)).toBe(once);
    }
  });

  it('quita index.php, www2, mobile y el punto final del host', () => {
    expect(normalizeUrl('https://www2.Example.com./docs/index.php')).toBe(
      'https://example.com/docs',
    );
    expect(normalizeUrl('https://mobile.example.com/a/default.aspx')).toBe('https://example.com/a');
  });

  it('decodifica %7E y ordena la query sin vacíos', () => {
    expect(normalizeUrl('https://example.com/%7Euser?b=&a=1')).toBe(
      'https://example.com/~user?a=1',
    );
  });

  it('conserva http solo en la lista corta', () => {
    expect(normalizeUrl('http://neverssl.com/path')).toBe('http://neverssl.com/path');
    expect(normalizeUrl('http://example.com/path')).toBe('https://example.com/path');
  });

  it('conserva un puerto no estándar y quita credenciales', () => {
    expect(normalizeUrl('https://user:secret@example.com:8443/a')).toBe(
      'https://example.com:8443/a',
    );
  });

  it('quita source y src solo cuando el valor es de rastreo', () => {
    expect(normalizeUrl('https://example.com/a?source=newsletter&src=email&keep=1')).toBe(
      'https://example.com/a?keep=1',
    );
    expect(normalizeUrl('https://example.com/a?source=docs')).toBe(
      'https://example.com/a?source=docs',
    );
  });

  it('quita s y t solo en Twitter/X y respeta la lista blanca', () => {
    expect(normalizeUrl('https://x.com/user/status/1?s=20&t=abc&lang=es')).toBe(
      'https://x.com/user/status/1?lang=es',
    );
    expect(normalizeUrl('https://news.ycombinator.com/item?id=1&utm_source=tldr')).toBe(
      'https://news.ycombinator.com/item?id=1',
    );
    expect(normalizeUrl('https://www.google.com/search?q=linkshelf&gclid=abc')).toBe(
      'https://google.com/search?q=linkshelf',
    );
  });

  it('aplica reglas de DOI, Amazon, Medium, arXiv y GitHub', () => {
    expect(normalizeUrl('https://dx.doi.org/10.1038/NATURE12373')).toBe(
      'https://doi.org/10.1038/nature12373',
    );
    expect(
      normalizeUrl('https://www.amazon.com/Nombre-largo/dp/b08n5wrwnw/ref=sr_1_1?keywords=x'),
    ).toBe('https://amazon.com/dp/B08N5WRWNW');
    expect(normalizeUrl('https://medium.com/blog/post?source=twitter')).toBe(
      'https://medium.com/blog/post',
    );
    expect(normalizeUrl('https://arxiv.org/abs/2401.01234v2')).toBe(
      'https://arxiv.org/abs/2401.01234',
    );
    expect(normalizeUrl('https://github.com/Vercel/AI/tree/main#readme')).toBe(
      'https://github.com/vercel/ai',
    );
    expect(normalizeUrl('https://github.com/vercel/next.js/stargazers')).toBe(
      'https://github.com/vercel/next.js',
    );
    expect(normalizeUrl('https://github.com/vercel/next.js/blob/canary/packages/foo.ts')).toBe(
      'https://github.com/vercel/next.js/blob/canary/packages/foo.ts',
    );
  });

  it('antepone https si falta el esquema y rechaza lo que no es http(s)', () => {
    expect(normalizeUrl('example.com/docs')).toBe('https://example.com/docs');
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow(InvalidUrlError);
    expect(() => normalizeUrl('ftp://example.com/a')).toThrow(InvalidUrlError);
    expect(() => normalizeUrl('   ')).toThrow(InvalidUrlError);
  });

  it('cuenta los parámetros de rastreo que se van a quitar', () => {
    expect(
      strippedTrackingParamNames('https://example.com/a?utm_source=x&utm_medium=y&id=1'),
    ).toEqual(['utm_source', 'utm_medium']);
  });
});

describe('unwrapKnownRedirects', () => {
  it('desenvuelve Facebook y Reddit además de TLDR', () => {
    expect(
      unwrapKnownRedirects('https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Fa'),
    ).toBe('https://example.com/a');
    expect(
      unwrapKnownRedirects('https://out.reddit.com/out?url=https%3A%2F%2Fexample.com%2Fb'),
    ).toBe('https://example.com/b');
  });

  it('marca los atajos que necesitan red', () => {
    expect(needsNetworkRedirect('https://t.co/abc')).toBe(true);
    expect(needsNetworkRedirect('https://lnkd.in/abc')).toBe(true);
    expect(needsNetworkRedirect('https://links.tldrnewsletter.com/abc')).toBe(true);
    expect(needsNetworkRedirect('https://example.com/a')).toBe(false);
  });
});

describe('registrableDomain', () => {
  it('reduce al dominio registrable', () => {
    expect(registrableDomain('blog.example.com')).toBe('example.com');
    expect(registrableDomain('www.github.com')).toBe('github.com');
    expect(registrableDomain('news.bbc.co.uk')).toBe('bbc.co.uk');
    expect(registrableDomain('foo.github.io')).toBe('foo.github.io');
  });
});

describe('isTrackingParam', () => {
  it('reconoce prefijos y excepciones', () => {
    expect(isTrackingParam('utm_campaign', 'x', 'example.com')).toBe(true);
    expect(isTrackingParam('v', 'abc', 'youtube.com', '/watch')).toBe(false);
    expect(isTrackingParam('fbclid', 'x', 'example.com')).toBe(true);
  });
});

describe('linkIdFor', () => {
  it('produce SHA-256 hex estable', async () => {
    const id = await linkIdFor('https://example.com/post');
    expect(id).toBe('061128ccde4ce4703519b9b2e51c036d85b137886dedcd2908fd11da004ab8c7');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('colapsa variantes de la misma URL, incluido el wrapper de TLDR', async () => {
    const variants = [
      'https://www.example.com/post',
      'https://example.com/post/',
      'https://example.com/post?utm_source=tldrnewsletter',
      'http://example.com/post#intro',
      'https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fexample.com%2Fpost%3Futm_source%3Dtldrai/1/abc/sig',
    ];
    const ids = await Promise.all(variants.map(async (value) => linkIdFor(normalizeUrl(value))));
    expect(new Set(ids).size).toBe(1);
  });
});

describe('propiedades', () => {
  it('normalizar es idempotente y no deja utm_', () => {
    fc.assert(
      fc.property(fc.webUrl({ withFragments: true, withQueryParameters: true }), (raw) => {
        let once: string;
        try {
          once = normalizeUrl(raw);
        } catch (error) {
          if (error instanceof InvalidUrlError) return;
          throw error;
        }
        expect(normalizeUrl(once)).toBe(once);
        const parsed = new URL(once);
        expect(parsed.protocol === 'https:' || parsed.protocol === 'http:').toBe(true);
        for (const key of parsed.searchParams.keys()) {
          expect(key.toLowerCase().startsWith('utm_')).toBe(false);
        }
        expect(linkIdShape(once)).toBe(true);
      }),
      { numRuns: 40 },
    );
  });
});

function linkIdShape(value: string): boolean {
  return /^https?:\/\//.test(value);
}
