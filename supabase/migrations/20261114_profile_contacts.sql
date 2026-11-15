-- Profile bios + optional contact handles, and profile reports.
-- Run in the Supabase SQL editor (after schema.sql and the earlier migrations).

-- Tier of any profile, readable without tripping RLS recursion (same pattern as my_tier()).
create or replace function public.profile_tier(uid uuid) returns tier_t
language sql stable security definer set search_path = public as
$$ select tier from public.profiles where id = uid $$;
revoke execute on function public.profile_tier(uuid) from public, anon;
grant execute on function public.profile_tier(uuid) to authenticated;

-- One optional row per member. Handles only (never raw URLs); the app builds the links.
-- Every format rule lives here too, so the database is the authority even if the client is bypassed.
create table if not exists public.profile_contacts (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  bio        text check (bio is null or (char_length(bio) <= 300 and bio !~ '[\x01-\x09\x0b-\x1f\x7f]')),
  discord    text check (discord    is null or discord    ~ '^(?=.*[a-z0-9])[a-z0-9._]{2,32}$'),
  instagram  text check (instagram  is null or instagram  ~ '^(?=.*[A-Za-z0-9])[A-Za-z0-9._]{1,30}$'),
  tiktok     text check (tiktok     is null or tiktok     ~ '^(?=.*[A-Za-z0-9])[A-Za-z0-9._]{2,24}$'),
  x          text check (x          is null or x          ~ '^[A-Za-z0-9_]{1,15}$'),
  soundcloud text check (soundcloud is null or soundcloud ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,24}$'),
  youtube    text check (youtube    is null or youtube    ~ '^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]{3,30}$'),
  bandcamp   text check (bandcamp   is null or bandcamp   ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  spotify    text check (spotify    is null or spotify    ~ '^[A-Za-z0-9]{22}$'),
  updated_at timestamptz not null default now()
);

alter table public.profile_contacts enable row level security;
revoke all on public.profile_contacts from anon, authenticated;
grant select, insert, update, delete on public.profile_contacts to authenticated;

-- Signed-in members can read contact info only for people in their own tier (and their own row).
create policy "contacts: read same tier" on public.profile_contacts for select to authenticated
  using (user_id = auth.uid() or public.profile_tier(user_id) = public.my_tier());
create policy "contacts: insert own" on public.profile_contacts for insert to authenticated
  with check (user_id = auth.uid() and public.my_tier() is not null);
create policy "contacts: update own" on public.profile_contacts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "contacts: delete own" on public.profile_contacts for delete to authenticated
  using (user_id = auth.uid());

-- Reports. Written only by the server (service role); clients get no access.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('impersonation','unsafe_contact_info','harassment','spam','other')),
  created_at timestamptz not null default now()
);
create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
