import { stripInvisible } from './text';
import { stripHostPrefixes } from './domain';
import { InvalidUrlError } from './errors';
import { isTrackingParam } from './tracking-params';
import { ensureScheme, unwrapKnownRedirects } from './unwrap';

/** Hosts conocidos que no ofrecen HTTPS y conservan http. */
export const HTTP_ONLY_HOSTS = new Set(['neverssl.com', 'http.badssl.com']);

const INDEX_FILES = new Set(['index.html', 'index.php', 'default.aspx']);

export const NORMALIZER_VERSION = 1;

interface Parts {
  protocol: 'http:' | 'https:';
  host: string;
  port: string;
  path: string;
  query: string;
  hash: string;
}

function preferredProtocol(host: string): 'http:' | 'https:' {
  return HTTP_ONLY_HOSTS.has(host) ? 'http:' : 'https:';
}

function normalizePort(port: string): string {
  if (port === '80' || port === '443') return '';
  return port;
}

function normalizeSegment(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }
  return encodeURIComponent(decoded).replace(/%7E/gi, '~');
}

function normalizePath(pathname: string): string {
  const segments: string[] = [];
  for (const segment of pathname.split('/')) {
    if (segment === '') continue;
    segments.push(normalizeSegment(segment));
  }
  const last = segments.at(-1)?.toLowerCase();
  if (last && INDEX_FILES.has(last)) segments.pop();
  if (segments.length === 0) return '/';
  return `/${segments.join('/')}`;
}

export function normalizeQuery(params: URLSearchParams, host: string, path: string): string {
  const pairs: Array<[string, string]> = [];
  params.forEach((value, key) => {
    if (value === '') return;
    if (isTrackingParam(key, value, host, path)) return;
    pairs.push([key, value]);
  });
  pairs.sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0,
  );
  if (pairs.length === 0) return '';
  const search = new URLSearchParams();
  for (const [key, value] of pairs) search.append(key, value);
  return search.toString();
}

function normalizeHash(hash: string, host: string): string {
  if (!hash || hash === '#') return '';
  const body = hash.slice(1);
  const isSpa = body.startsWith('/') || body.startsWith('!/');
  if (!isSpa) return '';
  const queryIndex = body.indexOf('?');
  if (queryIndex === -1) return `#${body}`;
  const pathPart = body.slice(0, queryIndex);
  const filtered = normalizeQuery(new URLSearchParams(body.slice(queryIndex + 1)), host, '/');
  return filtered ? `#${pathPart}?${filtered}` : `#${pathPart}`;
}

function applyGithub(parts: Parts): void {
  const segments = parts.path.split('/').filter(Boolean);
  const ownerRaw = segments[0];
  const repoRaw = segments[1];
  if (!ownerRaw || !repoRaw) return;
  const owner = ownerRaw.toLowerCase();
  const repo = repoRaw.toLowerCase().replace(/\.git$/, '');
  const rest = segments.slice(2);
  let tail = rest;
  const head = rest[0];
  if (head === 'tree' || head === 'stargazers') {
    tail = [];
  } else if (head === 'blob') {
    const afterBranch = rest.slice(2);
    const onlyReadme =
      afterBranch.length === 1 && /^readme(\.(md|markdown|rst))?$/i.test(afterBranch[0] ?? '');
    tail = afterBranch.length === 0 || onlyReadme ? [] : rest;
  } else if (head === 'issues' && rest.length === 1) {
    tail = [];
  }
  parts.path = `/${[owner, repo, ...tail].join('/')}`;
}

function sortedQuery(params: URLSearchParams): string {
  return normalizeQuery(params, '', '/');
}

function applyYoutubeWatch(parts: Parts, videoId: string | null): void {
  const current = new URLSearchParams(parts.query);
  const next = new URLSearchParams();
  const id = videoId ?? current.get('v');
  const list = current.get('list');
  const time = current.get('t');
  if (list) next.set('list', list);
  if (time) next.set('t', time);
  if (id) next.set('v', id);
  parts.host = 'youtube.com';
  if (videoId) parts.path = '/watch';
  parts.query = sortedQuery(next);
}

function applyArxiv(parts: Parts): void {
  const match = parts.path.match(/^\/(?:pdf|abs|html)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?$/i);
  const id = match?.[1];
  if (id) parts.path = `/abs/${id}`;
}

function applyDoi(parts: Parts): void {
  parts.host = 'doi.org';
  parts.path = parts.path.toLowerCase();
}

function applyMedium(parts: Parts): void {
  const params = new URLSearchParams(parts.query);
  params.delete('source');
  parts.query = sortedQuery(params);
}

function isAmazonHost(host: string): boolean {
  return /(^|\.)amazon\.(com|ca|com\.mx|com\.br|com\.au|co\.uk|co\.jp|de|fr|it|es|in|nl|sg|com\.tr|ae|pl|se|eg|sa)$/.test(
    host,
  );
}

function applyAmazon(parts: Parts): void {
  const match = parts.path.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Za-z0-9]{10})(?:\/|$)/);
  const asin = match?.[1];
  if (!asin) return;
  const amazon = parts.host.match(
    /amazon\.(com|ca|com\.mx|com\.br|com\.au|co\.uk|co\.jp|de|fr|it|es|in|nl|sg|com\.tr|ae|pl|se|eg|sa)$/,
  );
  if (amazon) parts.host = `amazon.${amazon[1]}`;
  parts.path = `/dp/${asin.toUpperCase()}`;
  parts.query = '';
}

function applyDomainRules(parts: Parts): void {
  if (parts.host === 'github.com') applyGithub(parts);
  else if (parts.host === 'youtu.be') {
    const id = parts.path.split('/').filter(Boolean)[0] ?? null;
    applyYoutubeWatch(parts, id);
  } else if (parts.host === 'youtube.com') applyYoutubeWatch(parts, null);
  else if (parts.host === 'arxiv.org') applyArxiv(parts);
  else if (parts.host === 'doi.org' || parts.host === 'dx.doi.org') applyDoi(parts);
  else if (parts.host === 'medium.com' || parts.host.endsWith('.medium.com')) applyMedium(parts);
  else if (isAmazonHost(parts.host)) applyAmazon(parts);
}

function assemble(parts: Parts): string {
  let url = `${parts.protocol}//${parts.host}`;
  if (parts.port) url += `:${parts.port}`;
  if (parts.path && parts.path !== '/') url += parts.path;
  else if (parts.hash || parts.query) url += '/';
  if (parts.query) url += `?${parts.query}`;
  if (parts.hash) url += parts.hash;
  return url;
}

export function normalizeUrl(input: string): string {
  const trimmed = stripInvisible(input.trim());
  if (!trimmed) throw new InvalidUrlError('URL vacía');
  if (trimmed.length > 4096) throw new InvalidUrlError('URL demasiado larga');
  const unwrapped = unwrapKnownRedirects(trimmed);
  let url: URL;
  try {
    url = new URL(ensureScheme(unwrapped));
  } catch {
    throw new InvalidUrlError('URL ilegible');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidUrlError('Solo se permiten URLs http(s)');
  }
  const host = stripHostPrefixes(url.hostname);
  const parts: Parts = {
    protocol: preferredProtocol(host),
    host,
    port: normalizePort(url.port),
    path: normalizePath(url.pathname),
    query: '',
    hash: '',
  };
  parts.query = normalizeQuery(url.searchParams, parts.host, parts.path);
  parts.hash = normalizeHash(url.hash, parts.host);
  applyDomainRules(parts);
  parts.protocol = preferredProtocol(parts.host);
  const normalized = assemble(parts);
  if (normalized.length > 2048)
    throw new InvalidUrlError('La URL normalizada supera 2048 caracteres');
  return normalized;
}

/** Nombres de parámetros de rastreo presentes en la URL (después de desenvolver). */
export function strippedTrackingParamNames(input: string): string[] {
  try {
    const url = new URL(ensureScheme(unwrapKnownRedirects(input.trim())));
    const host = stripHostPrefixes(url.hostname);
    const names: string[] = [];
    url.searchParams.forEach((value, key) => {
      if (value !== '' && isTrackingParam(key, value, host, url.pathname)) names.push(key);
    });
    return names;
  } catch {
    return [];
  }
}
