-- Live picks. Two honest windows, because the free lines source has no in-play odds:
--   1. The posted line holds for the first 15 minutes after kickoff ("lock it at kickoff").
--   2. A line fetched while the game is live (a real live-odds source, LINES_SOURCE=oddsapi)
--      stays lockable for 10 minutes from fetch. With ESPN lines this never triggers,
--      so stale closing lines can never be picked deep into a game.
-- Picks locked after kickoff are flagged live for the UI.

alter table picks add column if not exists live boolean not null default false;

create or replace function lock_pick(
  p_game_id text, p_market text, p_selection text, p_stake numeric, p_ticker text
) returns picks language plpgsql security definer set search_path = public as $$
declare l lines; g games; pk picks; cap numeric; staked numeric; is_live boolean;
begin
  select * into g from games where id = p_game_id;
  if g is null or g.completed then raise exception 'Game is over'; end if;
  select * into l from lines where game_id = p_game_id and market = p_market and selection = p_selection;
  if l is null then raise exception 'Line not available'; end if;
  is_live := g.commence_time <= now();
  if is_live and not (
       now() < g.commence_time + interval '15 minutes'
    or (l.fetched_at > g.commence_time and l.fetched_at > now() - interval '10 minutes')
  ) then raise exception 'The live window for this line has closed'; end if;
  if exists (select 1 from picks where user_id = auth.uid() and game_id = p_game_id and market = p_market and selection <> p_selection)
     then raise exception 'You already picked the other side'; end if;
  select weekly_cap into cap from profiles where id = auth.uid();
  if cap is not null then
    select coalesce(sum(stake),0) into staked from picks p join games gg on gg.id = p.game_id
      where p.user_id = auth.uid() and date_trunc('week', gg.commence_time) = date_trunc('week', g.commence_time);
    if staked + p_stake > cap then raise exception 'Over your weekly cap'; end if;
  end if;
  insert into picks (user_id, game_id, market, selection, point, odds, stake, ticker, live)
  values (auth.uid(), p_game_id, p_market, p_selection, l.point, l.price, p_stake, p_ticker, is_live)
  returning * into pk;
  return pk;
end $$;
grant execute on function lock_pick(text,text,text,numeric,text) to authenticated;
