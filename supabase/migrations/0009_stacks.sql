-- Stacks: multiple picks, one stake, one stock. Legs live in picks with
-- stack_id set and stake 0; the money, combined odds, points and status live
-- on the stack. Flex: exactly one missed leg scores 40% and spares the streak
-- (packages/core gradeStack is the spec). Also raises the stake range on
-- everything to $2..$1,000.

create table if not exists stacks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  stake numeric not null check (stake >= 2 and stake <= 1000),
  ticker text not null references stock_lines(ticker),
  odds int not null,                        -- combined american odds at lock
  legs int not null check (legs between 2 and 6),
  first_kick timestamptz not null,
  last_kick timestamptz not null,
  status text not null default 'pending',   -- pending | won | flex | lost | push
  points numeric not null default 0,
  counted boolean not null default false,
  locked_at timestamptz not null default now(),
  fill_price numeric,
  shares numeric,
  filled_at timestamptz,
  settled_at timestamptz
);
create index if not exists stacks_user_idx on stacks (user_id, locked_at desc);

alter table stacks enable row level security;
create policy "stacks read own" on stacks for select using (clerk_uid() = user_id);

alter table picks add column if not exists stack_id uuid references stacks(id) on delete cascade;
create index if not exists picks_stack_idx on picks (stack_id);

-- legs carry no money of their own; single picks ride the new $2..$1,000 range
alter table picks drop constraint if exists picks_stake_check;
alter table picks add constraint picks_stake_check
  check ((stack_id is not null and stake = 0) or (stake >= 2 and stake <= 1000));

-- Lock a whole Stack atomically. Every leg is validated the way lock_pick
-- validates one; the combined odds are computed server side from the locked
-- line prices, never trusted from the client.
create or replace function lock_stack(p_stake numeric, p_ticker text, p_legs jsonb)
returns stacks language plpgsql security definer set search_path = public as $$
declare
  uid text := clerk_uid();
  leg record; g games; l lines; st stacks;
  n int; cap numeric; staked numeric;
  first_k timestamptz; last_k timestamptz;
  dec numeric := 1; comb int; is_live boolean;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  n := jsonb_array_length(p_legs);
  if n < 2 or n > 6 then raise exception 'A Stack takes 2 to 6 legs'; end if;
  if p_stake < 2 or p_stake > 1000 then raise exception 'Stake must be between $2 and $1,000'; end if;
  if (select count(*) from (select distinct e->>'game_id', e->>'market' from jsonb_array_elements(p_legs) e) d) < n
    then raise exception 'One market per game in a Stack'; end if;

  for leg in select e->>'game_id' as game_id, e->>'market' as market, e->>'selection' as selection
             from jsonb_array_elements(p_legs) e loop
    select * into g from games where id = leg.game_id;
    if g is null or g.completed then raise exception 'A leg''s game is over'; end if;
    select * into l from lines where game_id = leg.game_id and market = leg.market and selection = leg.selection;
    if l is null then raise exception 'A line in this Stack is no longer available'; end if;
    is_live := g.commence_time <= now();
    if is_live and not (
         now() < g.commence_time + interval '15 minutes'
      or (l.fetched_at > g.commence_time and l.fetched_at > now() - interval '10 minutes')
    ) then raise exception 'The live window for a leg has closed'; end if;
    if exists (select 1 from picks where user_id = uid and game_id = leg.game_id and market = leg.market and selection <> leg.selection)
      then raise exception 'You already picked the other side of a leg'; end if;
    dec := dec * (case when l.price > 0 then 1 + l.price / 100.0 else 1 + 100.0 / abs(l.price) end);
    first_k := least(coalesce(first_k, g.commence_time), g.commence_time);
    last_k := greatest(coalesce(last_k, g.commence_time), g.commence_time);
  end loop;
  comb := case when dec >= 2 then round((dec - 1) * 100) else -round(100 / (dec - 1)) end;

  select weekly_cap into cap from profiles where id = uid;
  if cap is not null then
    select coalesce(sum(x.stake), 0) into staked from (
      select p.stake from picks p join games gg on gg.id = p.game_id
        where p.user_id = uid and p.stack_id is null
          and date_trunc('week', gg.commence_time) = date_trunc('week', first_k)
      union all
      select s.stake from stacks s where s.user_id = uid
          and date_trunc('week', s.first_kick) = date_trunc('week', first_k)
    ) x;
    if staked + p_stake > cap then raise exception 'Over your weekly cap'; end if;
  end if;

  insert into stacks (user_id, stake, ticker, odds, legs, first_kick, last_kick)
    values (uid, p_stake, p_ticker, comb, n, first_k, last_k) returning * into st;

  for leg in select e->>'game_id' as game_id, e->>'market' as market, e->>'selection' as selection
             from jsonb_array_elements(p_legs) e loop
    select * into l from lines where game_id = leg.game_id and market = leg.market and selection = leg.selection;
    select * into g from games where id = leg.game_id;
    insert into picks (user_id, game_id, market, selection, point, odds, stake, ticker, live, stack_id)
      values (uid, leg.game_id, leg.market, leg.selection, l.point, l.price, 0, p_ticker, g.commence_time <= now(), st.id);
  end loop;
  return st;
end $$;
grant execute on function lock_stack(numeric, text, jsonb) to authenticated;

-- Cancel a whole Stack before any leg kicks off; legs delete by cascade.
create or replace function cancel_stack(p_stack_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare st stacks;
begin
  select * into st from stacks where id = p_stack_id and user_id = clerk_uid();
  if st is null then raise exception 'Stack not found'; end if;
  if st.status <> 'pending' then raise exception 'Stack already settled'; end if;
  if st.first_kick <= now() then raise exception 'A leg already started'; end if;
  delete from stacks where id = st.id;
end $$;
grant execute on function cancel_stack(uuid) to authenticated;

-- single picks raise their range too inside lock_pick: same body as 0004
-- except the explicit stake bounds (the old 5..100 check lived on the table)
create or replace function lock_pick(
  p_game_id text, p_market text, p_selection text, p_stake numeric, p_ticker text
) returns picks language plpgsql security definer set search_path = public as $$
declare l lines; g games; pk picks; cap numeric; staked numeric; is_live boolean;
begin
  if clerk_uid() is null then raise exception 'Not signed in'; end if;
  if p_stake < 2 or p_stake > 1000 then raise exception 'Stake must be between $2 and $1,000'; end if;
  select * into g from games where id = p_game_id;
  if g is null or g.completed then raise exception 'Game is over'; end if;
  select * into l from lines where game_id = p_game_id and market = p_market and selection = p_selection;
  if l is null then raise exception 'Line not available'; end if;
  is_live := g.commence_time <= now();
  if is_live and not (
       now() < g.commence_time + interval '15 minutes'
    or (l.fetched_at > g.commence_time and l.fetched_at > now() - interval '10 minutes')
  ) then raise exception 'The live window for this line has closed'; end if;
  if exists (select 1 from picks where user_id = clerk_uid() and game_id = p_game_id and market = p_market and selection <> p_selection)
     then raise exception 'You already picked the other side'; end if;
  select weekly_cap into cap from profiles where id = clerk_uid();
  if cap is not null then
    select coalesce(sum(stake),0) into staked from picks p join games gg on gg.id = p.game_id
      where p.user_id = clerk_uid() and date_trunc('week', gg.commence_time) = date_trunc('week', g.commence_time);
    if staked + p_stake > cap then raise exception 'Over your weekly cap'; end if;
  end if;
  insert into picks (user_id, game_id, market, selection, point, odds, stake, ticker, live)
  values (clerk_uid(), p_game_id, p_market, p_selection, l.point, l.price, p_stake, p_ticker, is_live)
  returning * into pk;
  return pk;
end $$;
grant execute on function lock_pick(text,text,text,numeric,text) to authenticated;

-- leaderboard now sums stacks too; a flex counts as a win in the tally
create or replace view leaderboard as
with ev as (
  select p.user_id, g.commence_time, p.points, p.counted, p.status
  from picks p join games g on g.id = p.game_id
  where p.stack_id is null and p.status in ('won','lost','push')
  union all
  select s.user_id, s.last_kick, s.points, s.counted,
         case when s.status = 'flex' then 'won' else s.status end
  from stacks s where s.status in ('won','flex','lost','push')
)
select ev.user_id,
       pr.display_name,
       pr.streak,
       to_char(ev.commence_time at time zone 'America/New_York', 'YYYY-MM') as month,
       sum(ev.points) filter (where ev.counted) as points,
       count(*) filter (where ev.status = 'won') as wins,
       count(*) filter (where ev.status = 'lost') as losses
from ev
join profiles pr on pr.id = ev.user_id
group by ev.user_id, pr.display_name, pr.streak, month;
