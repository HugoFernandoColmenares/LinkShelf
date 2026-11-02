export const LINK_ID_PATTERN = /^[0-9a-f]{64}$/;

/** SHA-256 hex de la URL ya normalizada. Determinista entre web, extensión y tests. */
export async function linkIdFor(normalizedUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizedUrl);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
