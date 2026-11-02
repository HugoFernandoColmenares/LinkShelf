import { describe, expect, it, vi } from 'vitest';
import {
  InvalidUrlError,
  ResolveTimeoutError,
  extractMetadata,
  isPrivateHostname,
  prepareLink,
  resolveRedirects,
} from '../src/index';

function response(status: number, headers: Record<string, string> = {}, body = ''): Response {
  return new Response(body, { status, headers });
}

describe('resolveRedirects', () => {
  it('sigue una cadena de tres redirecciones', async () => {
    const routes: Record<string, Response> = {
      'https://a.example/1': response(302, { location: 'https://a.example/2' }),
      'https://a.example/2': response(302, { location: 'https://a.example/3' }),
      'https://a.example/3': response(302, { location: 'https://b.example/final' }),
      'https://b.example/final': response(200, { 'content-type': 'text/plain' }, 'ok'),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const key = String(input);
      const found = routes[key];
      if (!found) throw new Error(`sin ruta ${key}`);
      return found;
    });
    const result = await resolveRedirects('https://a.example/1', {
      fetch: fetchMock as typeof fetch,
    });
    expect(result.hops).toBe(3);
    expect(result.finalUrl).toBe('https://b.example/final');
    expect(result.html).toBeUndefined();
  });

  it('reintenta con GET cuando HEAD responde 405 y lee el HTML', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return response(405);
      return response(
        200,
        { 'content-type': 'text/html; charset=utf-8' },
        '<html><title>Hola</title></html>',
      );
    });
    const result = await resolveRedirects('https://example.com/a', {
      fetch: fetchMock as typeof fetch,
    });
    expect(result.hops).toBe(0);
    expect(result.html).toContain('Hola');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('traduce un abort a timeout', async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    await expect(
      resolveRedirects('https://example.com/lento', {
        timeoutMs: 15,
        fetch: fetchMock as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(ResolveTimeoutError);
  });

  it('rechaza hosts privados y redirecciones hacia la red local', async () => {
    const fetchMock = vi.fn();
    await expect(
      resolveRedirects('http://127.0.0.1/admin', { fetch: fetchMock as typeof fetch }),
    ).rejects.toBeInstanceOf(InvalidUrlError);
    await expect(
      resolveRedirects('http://localhost/x', { fetch: fetchMock as typeof fetch }),
    ).rejects.toBeInstanceOf(InvalidUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isPrivateHostname('192.168.1.20')).toBe(true);
    expect(isPrivateHostname('10.1.1.1')).toBe(true);
    expect(isPrivateHostname('172.16.0.1')).toBe(true);
    expect(isPrivateHostname('169.254.1.1')).toBe(true);
    expect(isPrivateHostname('printer.local')).toBe(true);
    expect(isPrivateHostname('[::1]')).toBe(true);
    expect(isPrivateHostname('example.com')).toBe(false);

    const redirect = vi.fn(async () => response(302, { location: 'http://192.168.0.5/secret' }));
    await expect(
      resolveRedirects('https://example.com/out', { fetch: redirect as typeof fetch }),
    ).rejects.toBeInstanceOf(InvalidUrlError);
  });

  it('rechaza puertos que no son 80 ni 443', async () => {
    await expect(resolveRedirects('https://example.com:8443/a')).rejects.toBeInstanceOf(
      InvalidUrlError,
    );
  });
});

describe('extractMetadata y prepareLink', () => {
  it('lee title, og y canonical', () => {
    const meta = extractMetadata(
      `<html><head>
        <title>Titulo plano</title>
        <meta property="og:title" content="Título &amp; OG">
        <meta name="description" content="Descripción breve">
        <meta property="og:image" content="/img.png">
        <meta property="og:type" content="article">
        <meta property="og:site_name" content="Blog">
        <meta property="article:published_time" content="2026-10-01">
        <link rel="canonical" href="https://blog.example.com/post">
      </head></html>`,
      'https://blog.example.com/otro',
    );
    expect(meta.title).toBe('Título & OG');
    expect(meta.description).toBe('Descripción breve');
    expect(meta.imageUrl).toBe('https://blog.example.com/img.png');
    expect(meta.canonicalUrl).toBe('https://blog.example.com/post');
    expect(meta.ogType).toBe('article');
    expect(meta.siteName).toBe('Blog');
  });

  it('prepara un enlace pendiente desde la web y uno con metadatos', async () => {
    const pending = await prepareLink({
      url: 'https://www.example.com/post/?utm_source=tldrnewsletter',
      title: 'Desde la web',
    });
    expect(pending.normalizedUrl).toBe('https://example.com/post');
    expect(pending.source).toBe('tldr');
    expect(pending.metaStatus).toBe('pending');
    expect(pending.title).toBe('Desde la web');
    expect(pending.domain).toBe('example.com');
    expect(pending.id).toMatch(/^[0-9a-f]{64}$/);

    const ready = await prepareLink({
      url: 'https://blog.example.com/alias?utm_source=rss',
      html: '<link rel="canonical" href="https://blog.example.com/real"><meta property="og:title" content="Real">',
    });
    expect(ready.normalizedUrl).toBe('https://blog.example.com/real');
    expect(ready.canonicalUrl).toBe('https://blog.example.com/real');
    expect(ready.title).toBe('Real');
    expect(ready.metaStatus).toBe('ok');
    expect(ready.source).toBe('manual');
  });

  it('ignora un canonical de otro dominio y marca failed si el HTML no aporta nada', async () => {
    const other = await prepareLink({
      url: 'https://example.com/a',
      html: '<link rel="canonical" href="https://otro.test/a"><title>Queda</title>',
    });
    expect(other.normalizedUrl).toBe('https://example.com/a');
    expect(other.canonicalUrl).toBeNull();
    expect(other.metaStatus).toBe('ok');

    const failed = await prepareLink({ url: 'https://example.com/vacio', html: '<html></html>' });
    expect(failed.metaStatus).toBe('failed');
    expect(failed.title).toBe('https://example.com/vacio');
  });
});
