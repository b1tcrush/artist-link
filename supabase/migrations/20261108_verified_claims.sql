-- Verified artist claims. Run in the Supabase SQL editor (after schema.sql).
-- All columns are nullable so existing profiles keep working; new profiles get them from /api/onboard.

alter table public.profiles
  add column if not exists lastfm_url text,
  add column if not exists proof_url text,
  add column if not exists verified_at timestamptz;

-- One account per Last.fm artist, regardless of how the name was typed.
-- Partial index so existing unverified rows (null) don't conflict with each other.
create unique index if not exists profiles_lastfm_url_uq
  on public.profiles (lower(lastfm_url))
  where lastfm_url is not null;
