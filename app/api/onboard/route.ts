import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { tierFor, GENRES, TOS_VERSION } from '@/lib/tiers';
import { proofCode, allowedProofUrl, fetchProofText, pageProvesClaim, normalize, PROOF_HOSTS_LABEL } from '@/lib/verify';

// Server-only: the service role key never reaches the browser.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  // 1. Authenticate the caller from their Supabase JWT.
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  const { data: { user } } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!user) return fail('Not signed in.', 401);

  // 2. Validate input. COPPA + ToS attestations are mandatory, not optional.
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('Bad request.', 400); }
  const { artistName, subGenre, ageConfirmed, tosVersion, proofUrl } = body;
  if (ageConfirmed !== true) return fail('You must be 13 or older.', 403);
  if (tosVersion !== TOS_VERSION) return fail('Accept the current Terms first.', 403);
  const name = String(artistName ?? '').trim();
  if (!name || name.length > 60 || typeof subGenre !== 'string' || !GENRES.includes(subGenre))
    return fail('Enter a valid artist name and sub-genre.', 400);

  // 3. One profile per account. Changing artist or tier later is not allowed from the client.
  const { data: existing } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (existing) return fail('You already have a profile.', 409);

  // 4. Public stat lookup (Last.fm). Only public listener counts are used.
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  url.search = new URLSearchParams({
    method: 'artist.getinfo', artist: name, autocorrect: '0',
    api_key: process.env.LASTFM_API_KEY!, format: 'json',
  }).toString();
  let lf: { error?: number; artist?: { name?: string; url?: string; stats?: { listeners?: string } } } | null;
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    lf = await r.json().catch(() => null); // Last.fm sends JSON errors, sometimes with a non-200 status
  } catch {
    return fail('Could not reach Last.fm. Try again in a minute.', 502);
  }
  // Error 6 = artist not found. Very small artists are often missing from Last.fm,
  // so they join the Under 100 tier (still verified with a code in a public bio).
  const notOnLastfm = lf?.error === 6;
  if (!notOnLastfm && !lf?.artist) return fail('Last.fm is unavailable. Try again in a minute.', 502);
  const listeners = notOnLastfm ? 0 : Number(lf?.artist?.stats?.listeners);
  if (!Number.isFinite(listeners)) return fail('Last.fm is unavailable. Try again in a minute.', 502);
  const lastfmUrl = notOnLastfm ? null : String(lf?.artist?.url ?? '') || null;

  const tier = tierFor(listeners);

  // Use Last.fm's spelling so the stored name is canonical.
  const canonicalName = (notOnLastfm ? name : String(lf?.artist?.name ?? name)).slice(0, 60);
  const code = proofCode(user.id, lastfmUrl ?? `name:${normalize(canonicalName)}`);

  // 5a. Step one: no proof yet. Hand back the code to put in a public bio.
  if (!proofUrl) return NextResponse.json({ step: 'verify', code, artistName: canonicalName });

  // 5b. Step two: prove control of a public page that names the artist.
  const proof = allowedProofUrl(String(proofUrl));
  if (!proof) return fail(`Use a link from ${PROOF_HOSTS_LABEL}.`, 400);
  let text: string | null = null;
  try { text = await fetchProofText(proof); } catch { text = null; }
  if (!text) return fail('Could not read that page. Make sure it is public and try again.', 422);
  const { codeFound, nameFound } = pageProvesClaim(text, code, canonicalName);
  if (!codeFound) return fail('Could not find your code on that page. Save it in your bio, wait a minute, and try again.', 422);
  if (!nameFound) return fail('That page does not mention the artist name.', 422);

  // 6. Write the profile with the service role. Clients cannot do this (no RLS write policy).
  const now = new Date().toISOString();
  const { error } = await admin.from('profiles').insert({
    id: user.id, artist_name: canonicalName, sub_genre: subGenre, tier, listeners,
    lastfm_url: lastfmUrl, proof_url: proof.toString(), verified_at: now,
    age_attested_at: now, tos_version: TOS_VERSION, tos_accepted_at: now,
  });
  if (error) {
    if (error.code === '23505') {
      const msg = `${error.message} ${error.details ?? ''}`;
      if (msg.includes('profiles_pkey')) return fail('You already have a profile.', 409);
      if (msg.includes('lastfm_url')) return fail('That artist has already been claimed.', 409);
      return fail('That artist name is already claimed.', 409);
    }
    return fail('Could not save profile.', 500);
  }
  return NextResponse.json({ tier });
}
