/** Subconjunto de la Public Suffix List para eTLD+1. No incluye el PSL completo. */
const MULTI_SUFFIXES = [
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'ltd.uk',
  'me.uk',
  'net.uk',
  'sch.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'com.br',
  'com.mx',
  'gob.mx',
  'com.ar',
  'com.co',
  'com.pe',
  'com.tr',
  'com.sg',
  'co.jp',
  'ne.jp',
  'or.jp',
  'ac.jp',
  'co.nz',
  'co.za',
  'co.in',
  'com.hk',
  'com.tw',
  'com.cn',
  'com.ua',
  'com.eg',
  'co.il',
  'com.sa',
  'github.io',
  'blogspot.com',
  'vercel.app',
  'netlify.app',
  'pages.dev',
  'firebaseapp.com',
  'web.app',
  'herokuapp.com',
  'appspot.com',
  'azurewebsites.net',
  'cloudfront.net',
  'amazonaws.com',
  'notion.site',
].sort((a, b) => b.length - a.length);

const HOST_PREFIXES = ['www.', 'www2.', 'm.', 'mobile.'];

export function stripHostPrefixes(hostname: string): string {
  let host = hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '');
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of HOST_PREFIXES) {
      if (host.startsWith(prefix) && host.length > prefix.length) {
        host = host.slice(prefix.length);
        changed = true;
      }
    }
  }
  return host;
}

export function registrableDomain(hostname: string): string {
  const host = stripHostPrefixes(hostname);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host;
  const labels = host.split('.').filter(Boolean);
  if (labels.length <= 2) return host;
  const suffix = MULTI_SUFFIXES.find((item) => host === item || host.endsWith(`.${item}`));
  if (suffix) {
    const take = suffix.split('.').length + 1;
    return labels.slice(-take).join('.');
  }
  return labels.slice(-2).join('.');
}
