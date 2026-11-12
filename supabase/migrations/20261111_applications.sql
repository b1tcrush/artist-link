-- Manual-review applications. Written only by the server (service role); clients get no access.
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artist_name text not null check (char_length(artist_name) between 1 and 60),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists applications_user_created_idx on public.applications (user_id, created_at desc);

alter table public.applications enable row level security;
revoke all on public.applications from anon, authenticated;
