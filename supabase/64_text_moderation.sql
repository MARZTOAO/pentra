-- ============================================================
--  64 — text moderation for profiles and the feed.
--
--  Chat is deliberately NOT covered. A private conversation between
--  two consenting adults is theirs; the report button (63) is the
--  right tool there, because it involves a human deciding. This is
--  for text that appears in front of people who did not choose to
--  see it.
--
--  TWO TIERS, because "profanity" and "hate" are not the same problem:
--
--    slur       — slurs, hate terms, sexual content. Blocked in every
--                 field covered here, no exceptions.
--    profanity  — ordinary swearing. Blocked only in NAMES: username,
--                 display name, gamer tag. Allowed in post bodies,
--                 comments and bios, because adults talking about
--                 games swear, and an app that rejects "this fucking
--                 boss fight" reads as broken rather than principled.
--
--  WHERE IT IS ENFORCED. In the database, as triggers. A check in the
--  client is a suggestion — anyone with the anon key can POST
--  directly to PostgREST and skip it entirely.
--
--  WHERE THE LIST LIVES. In a table with RLS on and no policies, the
--  same treatment feature_flags gets. Not in this repo: the repo is
--  public, and a blocklist anyone can read is a blocklist anyone can
--  work around. This file creates the table and seeds only the parts
--  that are harmless to publish — the allowlist, and ordinary swear
--  words. The slur list is loaded separately from a file that is
--  gitignored. See supabase/local/README.
--
--  Run in the Supabase SQL Editor, after 63.
-- ============================================================


-- ------------------------------------------------------------
--  1. The lists.
-- ------------------------------------------------------------
create table if not exists public.banned_terms (
  term       text primary key,
  tier       text not null check (tier in ('slur', 'profanity')),
  note       text,
  created_at timestamptz default now()
);

-- RLS on, no policies, no grants. Invisible to every API caller;
-- reaching it means the SQL editor or the service role.
alter table public.banned_terms enable row level security;
revoke all on public.banned_terms from authenticated, anon;


-- Words that are innocent but contain a banned term inside them.
-- Removed from the text before the substring pass, so Scunthorpe can
-- have an account.
create table if not exists public.allowed_terms (
  term text primary key,
  note text
);

alter table public.allowed_terms enable row level security;
revoke all on public.allowed_terms from authenticated, anon;


-- ------------------------------------------------------------
--  2. Normalising.
--
--  Two forms, because they defeat different things.
--
--  FOLD gives a spaced form for whole-word matching: lower case,
--  accents stripped, leetspeak resolved, anything that isn't a letter
--  or digit becomes a space, and runs of the same character are
--  capped at two. Whole-word matching is what keeps "assassin" and
--  "Scunthorpe" legal.
--
--  SQUASH goes further — every separator removed and every repeat
--  collapsed — so "f.u.c.k", "f u c k" and "fuuuuck" all land on the
--  same string. That is aggressive enough to produce false positives
--  on short words, which is why only the slur tier is matched against
--  it, and only after the allowlist has been subtracted.
-- ------------------------------------------------------------
create or replace function public.moderation_fold(input text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(
             translate(
               -- Digits map unconditionally: they are the common
               -- evasion and they rarely matter mid-word. Punctuation
               -- maps ONLY between two letters, so "sh!t" folds but
               -- "nice!!" does not become "niceii". Twice, because the
               -- passes overlap in "s!h!t".
               translate(
                 regexp_replace(
                   regexp_replace(
                     lower(coalesce(input, '')),
                     '([a-z])[@$!]([a-z])', '\1i\2', 'g'
                   ),
                   '([a-z])[@$!]([a-z])', '\1i\2', 'g'
                 ),
                 '013457', 'oieast'
               ),
               -- These two strings MUST be the same length. translate()
               -- silently DELETES any source character without a
               -- partner, so a miscount here quietly corrupts every
               -- piece of text the filter looks at. Generated, then
               -- length-checked in the test below.
               'àáâãäåāăąçćĉċčèéêëēĕėęěìíîïĩīĭįıñńņňòóôõöøōŏőšśŝşùúûüũūŭůűųýÿŷžźżďđğĝġģĺļľłŀŕŗřţťŧßæœ',
               'aaaaaaaaaccccceeeeeeeeeiiiiiiiiinnnnooooooooossssuuuuuuuuuuyyyzzzddgggglllllrrrtttsao'
             ),
             '[^a-z0-9]+', ' ', 'g'
           ),
           '(.)\1{2,}', '\1\1', 'g'
         );
$$;


create or replace function public.moderation_squash(input text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(public.moderation_fold(input), '[^a-z0-9]', '', 'g'),
           '(.)\1+', '\1', 'g'
         );
$$;


-- ------------------------------------------------------------
--  2b. Both lists are stored folded.
--
--  Matching happens against folded text, so a term written as "1488"
--  or "Nigger" would never match anything if it were stored as typed.
--  Folding on write means the lists can be written naturally and the
--  comparison still lines up. It also means `term` is a sensible
--  primary key: two spellings that fold the same are one row.
-- ------------------------------------------------------------
create or replace function public.moderation_fold_term()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.term := trim(public.moderation_fold(new.term));
  if new.term = '' then
    raise exception 'A term cannot be empty once folded';
  end if;
  return new;
end;
$$;

drop trigger if exists fold_banned_term on public.banned_terms;
create trigger fold_banned_term
  before insert or update on public.banned_terms
  for each row execute function public.moderation_fold_term();

drop trigger if exists fold_allowed_term on public.allowed_terms;
create trigger fold_allowed_term
  before insert or update on public.allowed_terms
  for each row execute function public.moderation_fold_term();


-- ------------------------------------------------------------
--  3. The check.
--
--  Returns true when the text should be refused. `strict` adds the
--  profanity tier on top of the slurs.
--
--  SECURITY DEFINER because banned_terms has no grants — the whole
--  point is that the caller cannot read it. This function answers
--  yes or no and never says which word matched, so it cannot be used
--  to enumerate the list either.
-- ------------------------------------------------------------
create or replace function public.moderation_blocks(input text, strict boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  spaced   text := public.moderation_fold(input);
  cleaned  text := ' ' || public.moderation_fold(input) || ' ';
  squashed text;
  hit      boolean;
begin
  if coalesce(trim(spaced), '') = '' then
    return false;
  end if;

  -- Subtract the innocent words before squashing, so their letters
  -- cannot run together with their neighbours into something that
  -- looks like a slur.
  select coalesce(
           (select string_agg(w, ' ')
              from unnest(string_to_array(trim(spaced), ' ')) as w
             where w not in (select a.term from allowed_terms a)),
           '')
    into squashed;

  squashed := public.moderation_squash(squashed);

  -- Whole words, both tiers.
  select exists (
    select 1 from banned_terms t
     where (strict or t.tier = 'slur')
       and position(' ' || t.term || ' ' in ' ' || trim(spaced) || ' ') > 0
  ) into hit;

  if hit then
    return true;
  end if;

  -- Substring pass against the squashed form.
  --
  -- Always for slurs. Also for profanity when `strict` — which means
  -- names only — because "fuckface92" is one word and the whole-word
  -- pass above sails straight past it. A name is worth being blunt
  -- about: the cost of a false positive is "pick another one", and it
  -- happens once, at signup, rather than every time someone writes a
  -- post.
  --
  -- FIVE characters minimum, and that number was chosen by being
  -- wrong at four. Squashing joins words together, so at four
  -- characters "Stardew Valley" matched a slur, "torpedo" matched
  -- another and "Pakistan" a third. Terms shorter than five are
  -- matched as whole words only; where a short term has a longer form
  -- that matters ("pedo" / "pedophile"), put the longer form in the
  -- list and it will still be caught inside other words.
  -- Profanity gets a lower bar (4) than slurs (5), and only in
  -- strict mode, which is names. "shitlord" should not be a username,
  -- and the four-character swear words happen not to hide inside
  -- ordinary English the way the four-character slurs do — the two
  -- that come close, Scunthorpe and shiitake, are on the allowlist.
  return exists (
    select 1 from banned_terms t
     where (strict or t.tier = 'slur')
       and length(t.term) >= case when t.tier = 'slur' then 5 else 4 end
       and position(regexp_replace(t.term, '(.)\1+', '\1', 'g') in squashed) > 0
  );
end;
$$;

grant execute on function public.moderation_blocks(text, boolean) to authenticated;


-- A folded string must come back the same length it went in. If
-- somebody edits the translate() pair above and miscounts, this fails
-- here rather than silently mangling every bio on the site.
do $$
begin
  if length(public.moderation_fold('àéîõüñçšžåøæœß')) <> 14 then
    raise exception
      'moderation_fold is dropping characters - the translate() pair is unbalanced';
  end if;
end $$;


-- ------------------------------------------------------------
--  4. Enforcement.
--
--  The message never names the word that matched. Telling somebody
--  exactly which of their characters failed turns the error into a
--  free oracle for working out the list.
-- ------------------------------------------------------------
create or replace function public.moderation_guard_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Names are strict: permanent, and shown beside everything the
  -- person ever does.
  if new.username is distinct from coalesce(old.username, '')
     and public.moderation_blocks(new.username, true) then
    raise exception 'That username contains language we don''t allow. Try another.';
  end if;

  if new.display_name is distinct from old.display_name
     and public.moderation_blocks(new.display_name, true) then
    raise exception 'That display name contains language we don''t allow.';
  end if;

  -- A bio is the person talking, so only the slur tier applies.
  if new.bio is distinct from old.bio
     and public.moderation_blocks(new.bio, false) then
    raise exception 'That bio contains language we don''t allow.';
  end if;

  return new;
end;
$$;

drop trigger if exists moderation_profile on public.profiles;
create trigger moderation_profile
  before insert or update on public.profiles
  for each row execute function public.moderation_guard_profile();


create or replace function public.moderation_guard_gamer_tag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.moderation_blocks(new.handle, true) then
    raise exception 'That gamer tag contains language we don''t allow.';
  end if;
  return new;
end;
$$;

drop trigger if exists moderation_gamer_tag on public.gamer_tags;
create trigger moderation_gamer_tag
  before insert or update on public.gamer_tags
  for each row execute function public.moderation_guard_gamer_tag();


create or replace function public.moderation_guard_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.moderation_blocks(new.body, false) then
    raise exception 'That post contains language we don''t allow.';
  end if;
  return new;
end;
$$;

drop trigger if exists moderation_post on public.posts;
create trigger moderation_post
  before insert or update of body on public.posts
  for each row execute function public.moderation_guard_post();


create or replace function public.moderation_guard_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.moderation_blocks(new.body, false) then
    raise exception 'That comment contains language we don''t allow.';
  end if;
  return new;
end;
$$;

drop trigger if exists moderation_comment on public.post_comments;
create trigger moderation_comment
  before insert or update of body on public.post_comments
  for each row execute function public.moderation_guard_comment();


-- ------------------------------------------------------------
--  4b. A check signup can call before it commits.
--
--  The profiles row is created by a trigger during auth.signUp, so a
--  rejected username surfaces through the auth API as "Database error
--  saving new user" — true, unhelpful, and it looks like the site is
--  broken rather than like the name was refused.
--
--  Signup already calls username_available() before submitting. This
--  is the same shape, asked one question later, and it is granted to
--  anon because nobody is signed in at that point. It returns a
--  boolean and never says which word matched, so it is no more of an
--  oracle than the trigger's own error message.
-- ------------------------------------------------------------
create or replace function public.username_allowed(candidate text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not public.moderation_blocks(candidate, true);
$$;

grant execute on function public.username_allowed(text) to anon, authenticated;


-- ------------------------------------------------------------
--  5. Seeds that are safe to keep in a public repo.
--
--  The allowlist: ordinary words that contain a banned term. This is
--  the list that stops the filter embarrassing you. Add to it every
--  time somebody reports a false positive.
-- ------------------------------------------------------------
insert into public.allowed_terms (term, note) values
  ('assassin',    'Creed, and the class in half the games on the platform'),
  ('assassins',   null),
  ('assault',     'assault rifle'),
  ('assassinate', null),
  ('assemble',    null),
  ('assembly',    null),
  ('asset',       null),
  ('assets',      null),
  ('assign',      null),
  ('assist',      'assists are a stat'),
  ('assists',     null),
  ('associate',   null),
  ('assume',      null),
  ('bass',        'the instrument and the fish'),
  ('class',       null),
  ('classic',     null),
  ('compass',     null),
  ('cumulative',  null),
  ('document',    null),
  ('grass',       null),
  ('mass',        'Mass Effect'),
  ('massive',     null),
  ('pass',        null),
  ('password',    null),
  ('scunthorpe',  'the canonical example'),
  ('shiitake',    null),
  ('analysis',    null),
  ('analyst',     null),
  ('canal',       null),
  ('titan',       'Titanfall, Attack on Titan'),
  ('titanic',     null),
  ('cockpit',     'flight sims'),
  ('cocktail',    null),
  ('peacock',     null),
  ('hancock',     null),
  ('dickens',     null),
  ('specialist',  null),
  ('button',      null),
  ('bumper',      null),

  -- Every one of these was found by running the real list against a
  -- corpus of ordinary gaming sentences. They are not hypothetical:
  -- each was blocked before it was added here.
  ('torpedo',     'contains pedo'),
  ('torpedoes',   null),
  ('torpedoed',   null),
  ('raccoon',     'contains coon'),
  ('raccoons',    null),
  ('cocoon',      null),
  ('tycoon',      null),
  ('tycoons',     null),
  ('suspicious',  'contains spic'),
  ('suspicion',   null),
  ('auspicious',  null),
  ('despicable',  null),
  ('spice',       null),
  ('spices',      null),
  ('spicy',       null),
  ('grape',       'contains rape'),
  ('grapes',      null),
  ('scrape',      null),
  ('scraped',     null),
  ('scrapes',     null),
  ('scraping',    'contains raping'),
  ('drape',       null),
  ('draped',      null),
  ('drapes',      null),
  ('trapeze',     null),
  ('rapeseed',    null),
  ('therapist',   'contains rapist - the classic one'),
  ('therapists',  null),
  ('therapy',     null),
  ('therapeutic', null),
  ('custard',     'contains tard'),
  ('mustard',     null),
  ('bastard',     'profanity tier already covers it as a whole word'),
  ('bastards',    null),
  ('lollipop',    'contains loli'),
  ('lollipops',   null),
  ('pakistan',    'contains paki'),
  ('pakistani',   null),
  ('pakistanis',  null),
  ('injunction',  'contains injun'),
  ('injunctions', null),
  ('squawk',      'contains squaw'),
  ('squawking',   null),
  ('squawks',     null),
  ('gobbledygook','contains gook'),
  ('dykes',       'place names'),
  ('molestation', null),
  ('incestuous',  null),
  ('niggardly',   'unrelated word, genuinely means miserly'),
  ('retardant',   'fire retardant'),
  ('retardants',  null),
  ('stardew',     'found by testing - contained a term at the old threshold'),
  ('stardust',    null)
on conflict (term) do nothing;


-- Ordinary swearing. Blocked in names only. Publishable, and useful
-- to have reviewable in the repo — these are the words most likely to
-- cause an argument about a false positive.
insert into public.banned_terms (term, tier, note) values
  ('fuck',     'profanity', null),
  ('fucker',   'profanity', null),
  ('fucking',  'profanity', null),
  ('shit',     'profanity', null),
  ('bullshit', 'profanity', null),
  ('bitch',    'profanity', null),
  ('bastard',  'profanity', null),
  ('cunt',     'profanity', 'tier is a judgement call; move to slur if you prefer'),
  ('wanker',   'profanity', null),
  ('twat',     'profanity', null),
  ('prick',    'profanity', null),
  ('dickhead', 'profanity', null),
  ('arsehole', 'profanity', null),
  ('asshole',  'profanity', null),
  ('piss',     'profanity', null),
  ('slut',     'profanity', null),
  ('whore',    'profanity', null)
on conflict (term) do nothing;

-- ============================================================
--  The slur tier is NOT seeded here. Load it from
--  supabase/local/ — see the README there. Until you do, this
--  migration blocks swearing in names and nothing else.
-- ============================================================
