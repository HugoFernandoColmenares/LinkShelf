/** Prefijos que siempre son rastreo, comparados en minúsculas. */
export const TRACKING_PREFIXES = [
  'utm_',
  'mtm_',
  'pk_',
  'hsa_',
  '_hs',
  'vero_',
  'oly_',
  '__s',
] as const;

/**
 * Nombres exactos (minúsculas). `source` y `src` no están: dependen del valor.
 * `s` y `t` solo se quitan en x.com / twitter.com.
 */
export const TRACKING_EXACT = new Set([
  'ref',
  'ref_src',
  'ref_url',
  'referrer',
  'campaign',
  'via',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  '_ga',
  '_gl',
  'fbclid',
  'igshid',
  'igsh',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  '__hstc',
  '__hssc',
  '__hsfp',
  'hsctatracking',
  'mkt_tok',
  'twclid',
  'li_fat_id',
  'trk',
  'trackingid',
  'ttclid',
  'yclid',
  'wickedid',
  'oly_anon_id',
  'oly_enc_id',
  'rb_clickid',
  'ss_campaign_id',
  '_bta_tid',
  '_bta_c',
  'cmpid',
  'ncid',
  'sr_share',
  'tldr',
  'tldrnewsletter',
]);

function isProtectedParam(name: string, host: string, path: string): boolean {
  if (
    (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) &&
    (name === 'v' || name === 't' || name === 'list')
  ) {
    return true;
  }
  if (host === 'news.ycombinator.com' && name === 'id') return true;
  if (
    (host === 'google.com' || host.endsWith('.google.com')) &&
    path.startsWith('/search') &&
    name === 'q'
  ) {
    return true;
  }
  return false;
}

export function isTrackingParam(name: string, value: string, host: string, path = '/'): boolean {
  const normalizedName = name.toLowerCase();
  const normalizedHost = host.toLowerCase().replace(/^www\./, '');
  if (isProtectedParam(normalizedName, normalizedHost, path)) return false;
  if (TRACKING_PREFIXES.some((prefix) => normalizedName.startsWith(prefix))) return true;
  if (TRACKING_EXACT.has(normalizedName)) return true;
  if (
    (normalizedName === 'source' || normalizedName === 'src') &&
    /newsletter|tldr|email|twitter|rss/i.test(value)
  ) {
    return true;
  }
  if (
    (normalizedName === 's' || normalizedName === 't') &&
    (normalizedHost === 'x.com' ||
      normalizedHost === 'twitter.com' ||
      normalizedHost.endsWith('.twitter.com'))
  ) {
    return true;
  }
  return false;
}
