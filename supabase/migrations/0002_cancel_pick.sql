-- Cancel a pending pick any time before kickoff.
-- Beta: the buy is simulated, so cancelling deletes the pick and its fill together.
-- Game delays: the engine re-upserts commence_time on every odds ingest, so a
-- postponed game's cancel window reopens automatically after the next pull.
create or replace function cancel_pick(p_pick_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pk picks; g games;
begin
  select * into pk from picks where id = p_pick_id and user_id = auth.uid();
  if pk is null then raise exception 'Pick not found'; end if;
  if pk.status <> 'pending' then raise exception 'Pick already settled'; end if;
  select * into g from games where id = pk.game_id;
  if g.commence_time <= now() then raise exception 'Game already started'; end if;
  delete from picks where id = pk.id;
end $$;
grant execute on function cancel_pick(uuid) to authenticated;
