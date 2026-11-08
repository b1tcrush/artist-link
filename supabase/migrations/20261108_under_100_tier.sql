-- Under 100 tier. Run in TWO separate runs in the Supabase SQL editor
-- (Postgres can't use a new enum value in the same transaction that adds it).

-- Run 1:
alter type tier_t add value if not exists 'u100';

-- Run 2:
insert into channels (tier, slug, name)
select 'u100'::tier_t, s.slug, s.name
from (values ('general','general'),('collabs','collabs'),('beats','beats-and-loops'),('feedback','feedback')) as s(slug,name)
on conflict (tier, slug) do nothing;
