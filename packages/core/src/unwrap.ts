const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function ensureScheme(input: string): string {
  return SCHEME_RE.test(input) ? input : `https://${input}`;
}

function isGoogleHost(host: string): boolean {
  return host === 'google.com' || host.startsWith('www.google.') || host.startsWith('google.');
}

function unwrapOnce(input: string): string | null {
  let url: URL;
  try {
    url = new URL(ensureScheme(input));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');

  if (host === 'tracking.tldrnewsletter.com') {
    const match = url.pathname.match(/\/CL0\/([^/]+)/i);
    const encoded = match?.[1];
    if (!encoded) return null;
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  if (isGoogleHost(host) && url.pathname === '/url') {
    const target = url.searchParams.get('q') ?? url.searchParams.get('url');
    if (target && /^https?:\/\//i.test(target)) return target;
  }

  if (
    (host === 'l.facebook.com' || host === 'lm.facebook.com') &&
    url.pathname.startsWith('/l.php')
  ) {
    const target = url.searchParams.get('u');
    if (target) return target;
  }

  if (host === 'out.reddit.com') {
    const target = url.searchParams.get('url');
    if (target) return target;
  }

  return null;
}

/** Desenvuelve wrappers conocidos (TLDR CL0, Google, Facebook, Reddit) sin red. */
export function unwrapKnownRedirects(input: string, maxDepth = 5): string {
  let current = input.trim();
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = unwrapOnce(current);
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

/** Atajos que solo se pueden resolver siguiendo HTTP (la extensión). */
export function needsNetworkRedirect(input: string): boolean {
  try {
    const url = new URL(ensureScheme(input.trim()));
    const host = url.hostname.toLowerCase();
    if (host === 't.co' || host === 'lnkd.in' || host === 'www.lnkd.in') return true;
    if (host === 'links.tldrnewsletter.com') return true;
    if (host === 'tracking.tldrnewsletter.com' && !/\/CL0\//i.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}
