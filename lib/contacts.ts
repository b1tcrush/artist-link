// Optional contact handles on a profile. We store HANDLES, never raw URLs: the app builds the
// links itself, so a profile can't point anywhere except the platform it claims to be.
// These patterns are mirrored by CHECK constraints in the database (the real authority).

export type PlatformKey = 'discord' | 'instagram' | 'tiktok' | 'x' | 'soundcloud' | 'youtube' | 'bandcamp' | 'spotify';

export type Platform = {
  key: PlatformKey;
  label: string;
  placeholder: string;
  pattern: RegExp;
  url: ((v: string) => string) | null; // null = not a link (Discord username)
};

export const BIO_MAX = 300;

export const PLATFORMS: Platform[] = [
  { key: 'discord', label: 'Discord', placeholder: 'your username', pattern: /^(?=.*[a-z0-9])[a-z0-9._]{2,32}$/, url: null },
  { key: 'instagram', label: 'Instagram', placeholder: '@handle or profile link', pattern: /^(?=.*[A-Za-z0-9])[A-Za-z0-9._]{1,30}$/, url: (v) => `https://www.instagram.com/${v}/` },
  { key: 'tiktok', label: 'TikTok', placeholder: '@handle or profile link', pattern: /^(?=.*[A-Za-z0-9])[A-Za-z0-9._]{2,24}$/, url: (v) => `https://www.tiktok.com/@${v}` },
  { key: 'x', label: 'X', placeholder: '@handle or profile link', pattern: /^[A-Za-z0-9_]{1,15}$/, url: (v) => `https://x.com/${v}` },
  { key: 'soundcloud', label: 'SoundCloud', placeholder: 'name or profile link', pattern: /^[A-Za-z0-9][A-Za-z0-9_-]{2,24}$/, url: (v) => `https://soundcloud.com/${v}` },
  { key: 'youtube', label: 'YouTube', placeholder: '@handle or channel link', pattern: /^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]{3,30}$/, url: (v) => `https://www.youtube.com/@${v}` },
  { key: 'bandcamp', label: 'Bandcamp', placeholder: 'name or yourname.bandcamp.com', pattern: /^[a-z0-9][a-z0-9-]{0,39}$/, url: (v) => `https://${v}.bandcamp.com` },
  { key: 'spotify', label: 'Spotify', placeholder: 'artist profile link', pattern: /^[A-Za-z0-9]{22}$/, url: (v) => `https://open.spotify.com/artist/${v}` },
];

const byKey = (key: PlatformKey) => PLATFORMS.find((p) => p.key === key)!;

const HOSTS: Record<PlatformKey, string[]> = {
  discord: [], instagram: ['instagram.com'], tiktok: ['tiktok.com'], x: ['x.com', 'twitter.com'],
  soundcloud: ['soundcloud.com'], youtube: ['youtube.com'], bandcamp: ['bandcamp.com'], spotify: ['open.spotify.com'],
};

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** Pull a handle out of a pasted profile link. Returns null if the link isn't one we understand. */
function fromUrl(key: PlatformKey, raw: string): string | null {
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  const segs = u.pathname.split('/').filter(Boolean).map(safeDecode);
  const hostOk = HOSTS[key].some((h) => host === h || (key === 'bandcamp' && host.endsWith('.bandcamp.com')));
  if (!hostOk) return null;
  switch (key) {
    case 'instagram': case 'x': case 'soundcloud':
      return segs[0] ?? null;
    case 'tiktok': case 'youtube': {
      const at = segs.find((s) => s.startsWith('@'));
      return at ? at.slice(1) : null;
    }
    case 'bandcamp':
      return host.endsWith('.bandcamp.com') ? host.slice(0, -'.bandcamp.com'.length) : null;
    case 'spotify': {
      const i = segs.indexOf('artist');
      return i >= 0 ? segs[i + 1] ?? null : null;
    }
    default:
      return null;
  }
}

export type Parsed = { ok: true; value: string | null } | { ok: false; error: string };

/** Turn whatever the user typed or pasted into a clean handle (or null when left blank). */
export function parseHandle(key: PlatformKey, input: string): Parsed {
  const pl = byKey(key);
  const t = input.trim();
  if (!t) return { ok: true, value: null };
  const urlish = t.includes('/') || /^www\./i.test(t) || (key === 'bandcamp' && /\.bandcamp\.com$/i.test(t));
  let v: string | null;
  if (urlish) {
    v = fromUrl(key, t);
    if (v === null) return { ok: false, error: `That doesn't look like a ${pl.label} profile link.` };
  } else {
    v = t.replace(/^@/, '');
  }
  if (key === 'discord' || key === 'bandcamp') v = v.toLowerCase();
  if (!pl.pattern.test(v)) return { ok: false, error: `That doesn't look like a valid ${pl.label} ${key === 'spotify' ? 'artist link' : 'handle'}.` };
  return { ok: true, value: v };
}

/** Link for a stored handle, re-validated at render time. Null for Discord or anything invalid. */
export function contactUrl(key: PlatformKey, value: string): string | null {
  const pl = byKey(key);
  if (!pl.url || !pl.pattern.test(value)) return null;
  return pl.url(value);
}

/** Text shown for a stored handle. */
export function contactText(key: PlatformKey, value: string): string {
  switch (key) {
    case 'instagram': case 'tiktok': case 'x': case 'youtube': return `@${value}`;
    case 'soundcloud': return `soundcloud.com/${value}`;
    case 'bandcamp': return `${value}.bandcamp.com`;
    case 'spotify': return 'Open on Spotify';
    default: return value;
  }
}

/** Strip control characters (keeping newlines) so the bio always satisfies the database rule. */
export function cleanBio(s: string): string {
  return s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, BIO_MAX);
}
