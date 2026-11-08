-- Artists Link: schema + Row-Level Security. Run in the Supabase SQL editor.
-- Principle: the client can NEVER set its own tier. Tier is written only by the
-- server (service role) after the Last.fm check; RLS then derives all access from it.

create type tier_t as enum ('1k','10k','100k');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  artist_name text not null check (char_length(artist_name) between 1 and 60),
  sub_genre text not null check (char_length(sub_genre) between 1 and 30),
  tier tier_t not null,
  listeners int not null,
  age_attested_at timestamptz not null,   -- COPPA: 13+ self-attestation record
  tos_version text not null,              -- which Terms the user accepted
  tos_accepted_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index profiles_artist_name_uq on profiles (lower(artist_name));

create table channels (
  id uuid primary key default gen_random_uuid(),
  tier tier_t not null,
  slug text not null,
  name text not null,
  unique (tier, slug)
);

create table messages (
  id bigint generated always as identity primary key,
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_channel_created_idx on messages (channel_id, created_at desc);

insert into channels (tier, slug, name)
select t, s.slug, s.name
from unnest(enum_range(null::tier_t)) as t,
     (values ('general','general'),('collabs','collabs'),('beats','beats-and-loops'),('feedback','feedback')) as s(slug,name);

-- SECURITY DEFINER helpers bypass RLS internally, which avoids policy recursion.
create function public.my_tier() returns tier_t
language sql stable security definer set search_path = public as
$$ select tier from public.profiles where id = auth.uid() $$;

create function public.channel_tier(cid uuid) returns tier_t
language sql stable security definer set search_path = public as
$$ select tier from public.channels where id = cid $$;

revoke execute on function public.my_tier(), public.channel_tier(uuid) from public, anon;
grant execute on function public.my_tier(), public.channel_tier(uuid) to authenticated;

alter table profiles enable row level security;
alter table channels enable row level security;
alter table messages enable row level security;

-- Default deny: strip every table privilege, then grant back only what is needed.
revoke all on profiles, channels, messages from anon, authenticated;
grant select on profiles, channels, messages to authenticated;
grant insert, delete on messages to authenticated;
-- No insert/update/delete on profiles for clients: only the service role writes tiers.

create policy "profiles: same tier only" on profiles for select to authenticated
  using (tier = public.my_tier());

create policy "channels: own tier only" on channels for select to authenticated
  using (tier = public.my_tier());

create policy "messages: read own tier" on messages for select to authenticated
  using (public.channel_tier(channel_id) = public.my_tier());

create policy "messages: write own tier as self" on messages for insert to authenticated
  with check (user_id = auth.uid() and public.channel_tier(channel_id) = public.my_tier());

create policy "messages: delete own" on messages for delete to authenticated
  using (user_id = auth.uid());

-- Realtime: postgres_changes events are filtered through the SAME select policy,
-- so a client only receives rows it could SELECT.
alter publication supabase_realtime add table messages;
