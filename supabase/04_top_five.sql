-- ============================================================
--  Saving a Top 5 in one go
--  Run this in the Supabase SQL Editor after the earlier files.
--
--  Why a function instead of plain updates: the table has a rule
--  saying one game per rank per person. Reordering by updating rows
--  one at a time would briefly break that rule halfway through -
--  two games both at rank 2 - and the database would reject it.
--
--  Wiping and re-inserting inside a single function keeps the whole
--  change atomic: it either all lands or none of it does.
--
--  It runs as the calling user, so row-level security still applies
--  and nobody can write a Top 5 onto someone else's profile.
-- ============================================================

create or replace function public.set_top_five(items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if jsonb_array_length(items) > 5 then
    raise exception 'A Top 5 holds at most five games';
  end if;

  delete from public.top_five where user_id = auth.uid();

  insert into public.top_five (user_id, game_id, rank, platform, note)
  select
    auth.uid(),
    (item->>'game_id')::bigint,
    (item->>'rank')::smallint,
    nullif(item->>'platform', ''),
    nullif(item->>'note', '')
  from jsonb_array_elements(items) as item;
end;
$$;

grant execute on function public.set_top_five(jsonb) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
