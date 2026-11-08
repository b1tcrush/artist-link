import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { tierFor, GENRES, TOS_VERSION } from '@/lib/tiers';

// Server-only: the service role key never reaches the browser.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

export async function POST(req: Request) {
  // 1. Authenticate the caller from their Supabase JWT.
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  const { data: { user } } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // 2. Validate input. COPPA + ToS attestations are mandatory, not optional.
  const { artistName, subGenre, ageConfirmed, tosVersion } = await req.json();
  if (ageConfirmed !== true) return NextResponse.json({ error: 'You must be 13 or older.' }, { status: 403 });
  if (tosVersion !== TOS_VERSION) return NextResponse.json({ error: 'Accept the current Terms first.' }, { status: 403 });
  const name = String(artistName ?? '').trim();
  if (!name || name.length > 60 || !GENRES.includes(subGenre))
    return NextResponse.json({ error: 'Enter a valid artist name and sub-genre.' }, { status: 400 });

  // 3. Public stat lookup (Last.fm). Only public listener counts are used.
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  url.search = new URLSearchParams({
    method: 'artist.getinfo', artist: name, autocorrect: '0',
    api_key: process.env.LASTFM_API_KEY!, format: 'json',
  }).toString();
  const lf = await (await fetch(url, { cache: 'no-store' })).json();
  const listeners = Number(lf?.artist?.stats?.listeners);
  if (!Number.isFinite(listeners))
    return NextResponse.json({ error: 'Artist not found on Last.fm. Check the spelling.' }, { status: 404 });

  const tier = tierFor(listeners);
  if (!tier) return NextResponse.json({ error: 'Artists Link opens at 100 Last.fm listeners.' }, { status: 403 });

  // 4. Write the profile with the service role. Clients cannot do this (no RLS write policy).
  const now = new Date().toISOString();
  const { error } = await admin.from('profiles').upsert({
    id: user.id, artist_name: name, sub_genre: subGenre, tier, listeners,
    age_attested_at: now, tos_version: TOS_VERSION, tos_accepted_at: now,
  });
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That artist name is already claimed.' : 'Could not save profile.' }, { status: 409 });
  return NextResponse.json({ tier });
}
