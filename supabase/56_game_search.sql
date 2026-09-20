-- ============================================================
--  56 — game search that forgives.
--
--  The old search was one line:
--
--      .ilike('name', '%' || term || '%')
--
--  which means the letters you type have to appear inside the title
--  in exactly that order, with exactly that punctuation. So:
--
--      pokemon            finds nothing   (the title has é)
--      assassins creed    finds nothing   (the title has an ')
--      marvels spiderman  finds nothing   (' and -)
--      helldivers2        finds nothing   (missing space)
--      witcher wild hunt  finds nothing   (words out of order)
--      final fantasy 7    finds nothing   (the title says VII)
--      gta                finds nothing   (it is an abbreviation)
--      cyberbunk          finds nothing   (one typo)
--
--  Every one of those is somebody who owns the game, typed what they
--  call it, and was told it does not exist.
--
--  THE APPROACH. Two stored columns on `games`, kept up to date by a
--  trigger, and one function that ranks against them.
--
--    search_name   the title folded down: lowercased, accents
--                  stripped, every non-alphanumeric turned into a
--                  space. "Marvel's Spider-Man" -> "marvel s spider man"
--
--    search_text   search_name plus every other way somebody might
--                  reasonably type it — the spaceless form, the
--                  roman-numeral-as-digits form, and the initials.
--
--  Matching is tiered rather than boolean, so an exact title always
--  outranks a fuzzy guess and the fuzzy guesses only ever appear
--  underneath. Nothing is silently reordered above what you asked for.
--
--  WHY THE VARIANTS ARE ADDITIVE. Every variant is ADDED to
--  search_text, never substituted for the real title. That matters
--  for the roman numerals: "Mega Man X" gets a "mega man 10" variant,
--  which is wrong — the X is a letter there, not a ten. Because the
--  real form is still in the column, the only cost is that a search
--  for "mega man 10" also finds it. A wrong guess adds a result; it
--  never takes one away. That asymmetry is the whole design.
--
--  WHY NOT unaccent(). It needs an extension whose dictionary lives
--  on disk, which makes anything built on it non-immutable and so
--  unusable in a generated column or an index expression without
--  lying to Postgres about it. Game titles use about twenty accented
--  characters between them, and translate() handles those with no
--  extension at all.
--
--  Run in the Supabase SQL Editor, after 55. On a large catalogue the
--  backfill at the bottom takes a moment — it is one UPDATE over
--  every row, and it only ever runs once.
-- ============================================================


-- ------------------------------------------------------------
--  pg_trgm, for the typo tier.
--
--  Supabase keeps extensions in their own schema; a plain Postgres
--  does not have one. Both are handled, and every function below
--  carries `extensions` on its search_path — a schema that does not
--  exist is ignored there rather than being an error.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'create extension if not exists pg_trgm with schema extensions';
  else
    execute 'create extension if not exists pg_trgm';
  end if;
end $$;


-- ------------------------------------------------------------
--  Folding a title down to something comparable.
--
--  Immutable and extension-free, so it can be used in an index.
-- ------------------------------------------------------------
create or replace function public.game_fold(raw text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    translate(
      -- Two-character expansions first: translate() maps one
      -- character to one character, and would silently DELETE these
      -- rather than expand them.
      replace(replace(replace(replace(replace(replace(
        lower(coalesce(raw, '')),
        'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'), 'ø', 'o'), 'þ', 'th'), 'ĳ', 'ij'),
      -- The two strings below MUST stay the same length: translate()
      -- maps them position by position, and any character past the
      -- end of the second one is deleted instead of replaced. Found
      -- by testing "Ōkami HD", whose macron the first version of this
      -- list did not have, so "okami" matched nothing.
      'áàâäãåāăąǎéèêëēĕėęěíìîïīĭįıǐóòôöõōŏőǒúùûüūŭůűǔñńňņçćčĉšśşșŝžźżẑýÿŷřŕťțţďđðľĺłļğģĝġ',
      'aaaaaaaaaaeeeeeeeeeiiiiiiiiiooooooooouuuuuuuuunnnnccccssssszzzzyyyrrtttdddllllgggg'
    ),
    '[^a-z0-9]+', ' ', 'g'
  ))
$$;


-- ------------------------------------------------------------
--  Roman numerals, i through xx.
--
--  A lookup rather than a parser, deliberately. A real parser would
--  accept "mix" as 1009, and "Mix" appears in titles far more often
--  than the number 1009 does.
-- ------------------------------------------------------------
create or replace function public.roman_value(token text)
returns int
language sql
immutable
as $$
  select case token
    when 'i' then 1     when 'ii' then 2     when 'iii' then 3
    when 'iv' then 4    when 'v' then 5      when 'vi' then 6
    when 'vii' then 7   when 'viii' then 8   when 'ix' then 9
    when 'x' then 10    when 'xi' then 11    when 'xii' then 12
    when 'xiii' then 13 when 'xiv' then 14   when 'xv' then 15
    when 'xvi' then 16  when 'xvii' then 17  when 'xviii' then 18
    when 'xix' then 19  when 'xx' then 20
    else null
  end
$$;


-- ------------------------------------------------------------
--  Every way somebody might type this title.
-- ------------------------------------------------------------
create or replace function public.game_search_text(raw text)
returns text
language plpgsql
immutable
as $$
declare
  folded   text   := public.game_fold(raw);
  parts    text[];
  variants text[];
  swapped  text[] := '{}';
  initials text   := '';
  trimmed  text   := '';
  subtitle text;
  word     text;
  value    int;
  i        int;
  n        int;
begin
  if folded = '' then
    return '';
  end if;

  parts := regexp_split_to_array(folded, ' ');
  n := array_length(parts, 1);

  -- The title itself, and the title with the spaces closed up, which
  -- is how a lot of people type: "helldivers2", "fallout4".
  variants := array[folded, replace(folded, ' ', '')];

  -- Roman numerals as digits. A single letter is only converted in
  -- the last position — that is the sequel slot, and it keeps
  -- "Street Fighter X Tekken" from becoming "street fighter 10
  -- tekken" while still catching "Final Fantasy X".
  for i in 1 .. n loop
    word  := parts[i];
    value := public.roman_value(word);

    if value is not null and (length(word) > 1 or i = n) then
      swapped := swapped || value::text;
    else
      swapped := swapped || word;
    end if;
  end loop;

  if array_to_string(swapped, ' ') <> folded then
    variants := variants
      || array_to_string(swapped, ' ')
      || replace(array_to_string(swapped, ' '), ' ', '');
  end if;

  -- Initials. "Call of Duty" -> cod, "Grand Theft Auto V" -> gtav.
  -- Stopwords are kept on purpose: the abbreviations people actually
  -- use are built from the whole title, which is why it is cod and
  -- not cd, and tloz and not lz.
  --
  -- A lone "s" is skipped, because folding a possessive leaves one
  -- behind: "Assassin's Creed Valhalla" folds to "assassin s creed
  -- valhalla", and without this the initials come out "ascv" rather
  -- than the "acv" anybody would actually type.
  for i in 1 .. n loop
    if not (parts[i] = 's' and i > 1) then
      initials := initials || left(parts[i], 1);

      -- The same thing without a trailing number, because both
      -- "gtav" and "gta" get typed.
      if i < n or public.roman_value(parts[i]) is null then
        if parts[i] !~ '^[0-9]+$' then
          trimmed := trimmed || left(parts[i], 1);
        end if;
      end if;
    end if;
  end loop;

  if length(initials) >= 2 then
    variants := variants || initials;
  end if;

  if length(trimmed) >= 2 and trimmed <> initials then
    variants := variants || trimmed;
  end if;

  -- And the numbered form, which is the one people type most:
  -- "gta5", "ff16". Built from the roman-swapped tokens, and a
  -- number contributes all of its digits rather than just the first.
  initials := '';

  for i in 1 .. array_length(swapped, 1) loop
    if not (swapped[i] = 's' and i > 1) then
      if swapped[i] ~ '^[0-9]+$' then
        initials := initials || swapped[i];
      else
        initials := initials || left(swapped[i], 1);
      end if;
    end if;
  end loop;

  if length(initials) >= 2 then
    variants := variants || initials;
  end if;

  -- The subtitle's initials, for the many games known by those and
  -- nothing else: "The Legend of Zelda: Breath of the Wild" -> botw.
  if raw like '%:%' then
    subtitle := public.game_fold(split_part(raw, ':', 2));

    if subtitle <> '' then
      initials := '';
      foreach word in array regexp_split_to_array(subtitle, ' ') loop
        initials := initials || left(word, 1);
      end loop;

      if length(initials) >= 2 then
        variants := variants || initials;
      end if;
    end if;
  end if;

  -- Duplicates cost nothing but make the column harder to read.
  return (
    select string_agg(distinct v, ' ')
    from unnest(variants) as v
    where v <> ''
  );
end;
$$;


-- ------------------------------------------------------------
--  The columns, and the trigger that keeps them true.
--
--  Not generated columns: the daily IGDB import upserts thousands of
--  rows at a time, and a trigger is the one thing that is guaranteed
--  to fire for every one of them however they arrive.
-- ------------------------------------------------------------
alter table public.games
  add column if not exists search_name text,
  add column if not exists search_text text;

create or replace function public.games_refresh_search()
returns trigger
language plpgsql
as $$
begin
  new.search_name := public.game_fold(new.name);
  new.search_text := public.game_search_text(new.name);
  return new;
end;
$$;

drop trigger if exists games_search_sync on public.games;

create trigger games_search_sync
  before insert or update of name on public.games
  for each row
  execute function public.games_refresh_search();


-- ------------------------------------------------------------
--  Indexes.
--
--  Both are GIN trigram indexes, and both are load-bearing rather
--  than nice to have: without them every search is a sequential scan
--  over the whole catalogue, which measured at 2.6 SECONDS on 60,000
--  rows. With them the same search is under a millisecond.
--
--    search_text   answers the substring and regex tiers
--    search_name   answers the typo tier, which is the `%` operator
--
--  A btree on search_name would only help a LIKE-prefix scan, and
--  Postgres can only turn LIKE into a range when the pattern is a
--  constant at planning time — which it never is here, because the
--  pattern is built from what somebody typed. So there isn't one:
--  an index that cannot be used still has to be written to on every
--  one of the tens of thousands of rows the daily import touches.
-- ------------------------------------------------------------
drop index if exists public.games_search_name_prefix;

do $$
begin
  execute 'create index if not exists games_search_text_trgm
             on public.games using gin (search_text gin_trgm_ops)';
  execute 'create index if not exists games_search_name_trgm
             on public.games using gin (search_name gin_trgm_ops)';
exception when undefined_object then
  -- pg_trgm landed somewhere this statement cannot see. Search still
  -- returns the right answers without these; it just reads the whole
  -- table to do it. Worth a loud notice rather than a silent crawl.
  raise warning 'pg_trgm operator class not visible - game search will be SLOW';
end $$;


-- ------------------------------------------------------------
--  Backfill.
--
--  Written as "where the stored value disagrees with the computed
--  one" rather than "where it is null", so that changing the folding
--  rules and re-running this file actually rebuilds the columns. The
--  null version silently skipped every existing row, which is how a
--  fix to game_fold can appear to do nothing at all: caught by adding
--  the macron in Ōkami and watching the search keep failing.
--
--  It reads every row each time and writes only the ones that
--  changed, so a re-run on an unchanged catalogue is a scan and no
--  writes.
-- ------------------------------------------------------------
update public.games
   set search_name = public.game_fold(name),
       search_text = public.game_search_text(name)
 where search_name is distinct from public.game_fold(name)
    or search_text is distinct from public.game_search_text(name);


-- ------------------------------------------------------------
--  The search itself.
--
--  TIERS, highest first. The point of ranking rather than filtering
--  is that a title you typed correctly can never be pushed below a
--  fuzzy guess — the forgiving tiers only fill in underneath.
--
--    100  the title, exactly
--     90  the title starts with what you typed
--     80  the spaceless title starts with it   helldivers2
--     70  every word you typed starts a word   witcher wild hunt
--     60  the spaceless title contains it
--     50  it is one of the variants, whole     gta, botw, cod
--     45  it starts one of the variants        ac
--     40  close enough to be a typo            cyberbunk
--
--  Length floors on the loose tiers. Without them "ac" matches
--  "blackjack" by substring, and two letters of noise would bury
--  seven tiers of signal.
--
--  A note on the regex tiers: what gets interpolated into them has
--  already been through game_fold(), which replaces everything that
--  is not a-z or 0-9. So no metacharacter can reach the pattern, and
--  a search for "(*+[" folds to nothing rather than raising. That is
--  load-bearing — don't build a pattern from anything unfolded.
-- ------------------------------------------------------------
drop function if exists public.search_games(text, int);

create function public.search_games(q text, max_results int default 24)
returns table (
  id           bigint,
  name         text,
  cover_url    text,
  genres       text[],
  platforms    text[],
  release_date timestamptz,
  relevance    int
)
language sql
stable
-- Invoker, not definer. The catalogue is already readable by anyone
-- signed in — the old search queried the table straight through
-- PostgREST — so definer would buy nothing and would quietly outlive
-- any future decision to restrict a row.
security invoker
set search_path = public, extensions
as $$
  with parsed as (
    select
      public.game_fold(q)                           as norm,
      replace(public.game_fold(q), ' ', '')         as compact,
      length(replace(public.game_fold(q), ' ', '')) as len,
      regexp_split_to_array(public.game_fold(q), ' ') as words,
      -- The longest word typed, and its length. Two jobs: it is the
      -- one word guaranteed to appear if tier 70 is going to match,
      -- which makes it the cheapest way to find candidates; and a
      -- query with no word longer than two characters is not a query
      -- worth running tier 70 on at all.
      (select w from unnest(regexp_split_to_array(
         public.game_fold(q), ' ')) as w order by length(w) desc limit 1)
                                                    as longword
    from (select 1) _
  ),

  -- NARROW FIRST, SCORE SECOND.
  --
  -- Getting this the wrong way round was a 2.6-second search on a
  -- 60,000-row catalogue: a CASE in the select list runs similarity()
  -- against every row in the table before anything can filter it out.
  --
  -- UNION ALL rather than one WHERE with ORs, and this is the whole
  -- point of the shape. Postgres can drive an index scan from each
  -- arm separately; it cannot from a chain of ORs unless EVERY branch
  -- is indexable, and one that is not turns the lot into a
  -- sequential scan. Each arm below is ANDs only, so each one gets
  -- its own index.
  --
  -- Together the arms are a superset of all seven tiers — anything
  -- that could score has to survive this — and duplicates are fine,
  -- because the scoring below picks one tier per row and the id is
  -- what gets returned.
  hits as (
    -- The spaceless query as a substring. Covers the exact, prefix
    -- and contains tiers for a single word, and the initialisms.
    select g.id
    from public.games g, parsed p
    where p.norm <> '' and p.len >= 3
      and g.search_text like '%' || p.compact || '%'

    union
    -- The longest word typed. If tier 70 wants every word to appear,
    -- the longest one has to, so this finds the candidates for it —
    -- and it is what catches "witcher wild hunt", whose spaceless
    -- form appears nowhere (the title has a 3 in the middle).
    select g.id
    from public.games g, parsed p
    where p.norm <> '' and length(p.longword) >= 3
      and g.search_text like '%' || p.longword || '%'

    union
    -- The typo tier. `%` is pg_trgm's similarity operator and rides
    -- the trigram index; its threshold defaults to 0.3, below the
    -- 0.34 the tier itself asks for, so this lets through a few rows
    -- that then fail to score. That is the right way round.
    select g.id
    from public.games g, parsed p
    where p.norm <> '' and p.len >= 5
      and g.search_name % p.norm

    union
    -- Short abbreviations, which no substring index can help with —
    -- but pg_trgm answers regexes from the same index, and a
    -- two-character one lands in well under a millisecond.
    select g.id
    from public.games g, parsed p
    where p.norm <> '' and p.len between 2 and 2
      and g.search_text ~ ('(^| )' || p.compact)
  ),

  candidates as (
    select g.*, p.*
    from public.games g
    join hits h on h.id = g.id
    cross join parsed p
  ),

  scored as (
    select
      c.*,
      case
        when c.search_name = c.norm                             then 100
        when c.search_name like c.norm || '%'                   then  90
        when replace(c.search_name, ' ', '') like c.compact || '%'
                                                                then  80
        when length(c.longword) >= 3
         and (
          select bool_and(c.search_text ~ ('(^| )' || w))
          from unnest(c.words) as w
          where w <> ''
        )                                                       then  70
        when c.len >= 4
         and replace(c.search_name, ' ', '') like '%' || c.compact || '%'
                                                                then  60
        when c.len >= 2
         and c.search_text ~ ('(^| )' || c.compact || '( |$)')   then  50
        -- A short abbreviation that starts one of the variants:
        -- "ac" finding Assassin's Creed, whose initials are "acv".
        -- Loose on purpose and ranked below everything exact, with
        -- popularity deciding the order underneath.
        when c.len >= 2
         and c.search_text ~ ('(^| )' || c.compact)              then  45
        when c.len >= 5
         and similarity(c.search_name, c.norm) >= 0.34           then  40
        else null
      end as tier,
      similarity(c.search_name, c.norm) as closeness
    from candidates c
  )

  select
    s.id,
    s.name,
    s.cover_url,
    s.genres,
    s.platforms,
    s.release_date,
    s.relevance
  from scored s
  where s.tier is not null
  order by
    s.tier desc,
    -- Within a tier, what people are actually playing comes first.
    -- `relevance` is rating count for released games and follower
    -- count for announced ones, so an unreleased game is not buried
    -- for having no ratings yet — see 23_upcoming_games.sql.
    s.relevance desc nulls last,
    s.closeness desc,
    s.name
  limit greatest(1, least(coalesce(max_results, 24), 50));
$$;

revoke all on function public.search_games(text, int) from public;
grant execute on function public.search_games(text, int) to authenticated;
grant execute on function public.search_games(text, int) to anon;

-- ============================================================
--  Done.
-- ============================================================
