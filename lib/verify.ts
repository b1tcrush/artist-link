// Server-only helpers for proving someone controls a public page that names the artist.
// This is a deterrent against casual impersonation, not cryptographic proof of identity:
// it shows the user can edit a SoundCloud / Bandcamp / Linktree page that mentions the artist.
import { createHash } from 'node:crypto';

// Only these hosts (and their subdomains) may be fetched. Keeps the server from being
// pointed at arbitrary URLs (SSRF).
const ALLOWED_HOSTS = ['soundcloud.com', 'bandcamp.com', 'linktr.ee'];
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

export const PROOF_HOSTS_LABEL = 'SoundCloud, Bandcamp or Linktree';

/** Code the user pastes into their public bio. Bound to this user + this Last.fm artist. */
export function proofCode(userId: string, lastfmUrl: string): string {
  const h = createHash('sha256').update(`${userId}|${lastfmUrl.toLowerCase()}`).digest('hex');
  return `artistslink-${h.slice(0, 10)}`;
}

/** Returns a parsed URL if it is https and on an allowed host, otherwise null. */
export function allowedProofUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((d) => host === d || host.endsWith('.' + d)) ? u : null;
}

async function readCapped(body: ReadableStream<Uint8Array>, max: number): Promise<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let out = '';
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    out += dec.decode(value, { stream: true });
    if (n >= max) { await reader.cancel(); break; }
  }
  return out;
}

/** Fetches the page text. Redirects are followed manually and must stay on allowed hosts. */
export async function fetchProofText(start: URL): Promise<string | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
      headers: { 'user-agent': 'ArtistsLinkVerifier/1.0', accept: 'text/html' },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      let next: URL | null = null;
      try { next = allowedProofUrl(new URL(loc, url).toString()); } catch { /* invalid location */ }
      if (!next) return null;
      url = next;
      continue;
    }
    if (!res.ok || !res.body) return null;
    return await readCapped(res.body, MAX_BYTES);
  }
  return null;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&lt;': '<', '&gt;': '>' };

/** Lowercase, decode a few HTML entities, keep only letters and digits. */
export function normalize(s: string): string {
  const decoded = s.replace(/&(?:amp|quot|lt|gt|#39|#x27);/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
  return decoded.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export function pageProvesClaim(pageText: string, code: string, artistName: string): { codeFound: boolean; nameFound: boolean } {
  const codeFound = pageText.toLowerCase().includes(code.toLowerCase());
  const name = normalize(artistName);
  const nameFound = name.length > 0 && normalize(pageText).includes(name);
  return { codeFound, nameFound };
}
