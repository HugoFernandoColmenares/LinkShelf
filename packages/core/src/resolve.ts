import { InvalidUrlError, ResolveTimeoutError } from './errors';

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local)$/i;

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (PRIVATE_HOST.test(host) || host === '0.0.0.0') return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
    if (/^fe[89ab]/i.test(host)) return true;
  }
  return false;
}

export function assertPublicHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new InvalidUrlError('URL ilegible');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidUrlError('Solo se permiten URLs http(s)');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new InvalidUrlError('Puerto no permitido');
  }
  if (isPrivateHostname(url.hostname)) throw new InvalidUrlError('Host no permitido');
  return url;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = '';
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    output += decoder.decode(value, { stream: true });
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  output += decoder.decode();
  return output.slice(0, maxBytes);
}

export interface ResolveResult {
  finalUrl: string;
  html?: string;
  hops: number;
}

export async function resolveRedirects(
  input: string,
  opts?: { timeoutMs?: number; fetch?: typeof fetch; maxRedirects?: number },
): Promise<ResolveResult> {
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const fetchImpl = opts?.fetch ?? globalThis.fetch.bind(globalThis);
  const maxRedirects = opts?.maxRedirects ?? 10;
  let current = assertPublicHttpUrl(input).toString();
  let hops = 0;
  let method: 'HEAD' | 'GET' = 'HEAD';

  for (let attempt = 0; attempt <= maxRedirects + 2; attempt += 1) {
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method,
        redirect: 'manual',
        credentials: 'omit',
        signal,
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
    } catch (error) {
      if (isAbort(error)) throw new ResolveTimeoutError();
      throw error;
    }

    if ((response.status === 405 || response.status === 403) && method === 'HEAD') {
      method = 'GET';
      continue;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { finalUrl: current, hops };
      const next = assertPublicHttpUrl(new URL(location, current).toString());
      current = next.toString();
      hops += 1;
      if (hops > maxRedirects) break;
      method = 'HEAD';
      continue;
    }

    const type = response.headers.get('content-type') ?? '';
    if (method === 'GET' && type.includes('text/html')) {
      const html = await readLimited(response, 512 * 1024);
      return { finalUrl: current, html, hops };
    }
    return { finalUrl: current, hops };
  }

  return { finalUrl: current, hops };
}
