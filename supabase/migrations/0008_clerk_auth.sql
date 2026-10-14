-- Auth moves from Supabase Auth to Clerk, verified by Supabase third-party auth.
-- Clerk user ids are text ("user_..."), so every user key becomes text and every
-- policy reads the Clerk id from the JWT sub claim instead of auth.uid().
-- Requires: Clerk's Supabase integration enabled (session tokens carry
-- "role": "authenticated") and Clerk added as a third-party auth provider in
-- the Supabase dashboard. Existing beta rows keep their old uuid ids as text;
-- those accounts are retired (no Clerk login maps to them) but the data stays.

-- the Clerk user id carried in the verified JWT
create or replace function clerk_uid() returns text
language sql stable as $$
  select nullif(auth.jwt()->>'sub', '')
$$;

-- drop everything that depends on the uuid user columns
drop view if exists leaderboard;
drop policy if exists "profiles update own" on profiles;
drop policy if exists "picks read own" on picks;
drop policy if exists "picks insert own" on picks;
drop policy if exists "broker own" on brokerage_connections;
drop policy if exists "feedback insert" on feedback;

-- signup no longer flows through auth.users; the app inserts its own profile row
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

alter table profiles drop constraint if exists profiles_id_fkey;
alter table picks drop constraint if exists picks_user_id_fkey;
alter table brokerage_connections drop constraint if exists brokerage_connections_user_id_fkey;
alter table feedback drop constraint if exists feedback_user_id_fkey;

alter table profiles alter column id type text using id::text;
alter table picks alter column user_id type text using user_id::text;
alter table brokerage_connections alter column user_id type text using user_id::text;
alter table feedback alter column user_id type text using user_id::text;

alter table picks add constraint picks_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;
alter table brokerage_connections add constraint brokerage_connections_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;
alter table feedback add constraint feedback_user_id_fkey
  foreign key (user_id) references profiles(id);

-- policies, now keyed to the Clerk id
create policy "profiles update own" on profiles for update using (clerk_uid() = id);
create policy "profiles insert own" on profiles for insert with check (clerk_uid() = id);
create policy "picks read own" on picks for select using (clerk_uid() = user_id);
create policy "picks insert own" on picks for insert with check (clerk_uid() = user_id);
create policy "broker own" on brokerage_connections for all
  using (clerk_uid() = user_id) with check (clerk_uid() = user_id);
create policy "feedback insert" on feedback for insert with check (clerk_uid() = user_id);

-- unchanged from 0001 except it now rides the text keys
create or replace view leaderboard as
select p.user_id,
       pr.display_name,
       pr.streak,
       to_char(g.commence_time at time zone 'America/New_York', 'YYYY-MM') as month,
       sum(p.points) filter (where p.counted) as points,
       count(*) filter (where p.status = 'won') as wins,
       count(*) filter (where p.status = 'lost') as losses
from picks p
join games g on g.id = p.game_id
join profiles pr on pr.id = p.user_id
where p.status in ('won','lost','push')
group by p.user_id, pr.display_name, pr.streak, month;

-- same rules as 0004_live_picks, keyed to the Clerk id
create or replace function lock_pick(
  p_game_id text, p_market text, p_selection text, p_stake numeric, p_ticker text
) returns picks language plpgsql security definer set search_path = public as $$
declare l lines; g games; pk picks; cap numeric; staked numeric; is_live boolean;
begin
  if clerk_uid() is null then raise exception 'Not signed in'; end if;
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

-- same rules as 0002_cancel_pick, keyed to the Clerk id
create or replace function cancel_pick(p_pick_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pk picks; g games;
begin
  select * into pk from picks where id = p_pick_id and user_id = clerk_uid();
  if pk is null then raise exception 'Pick not found'; end if;
  if pk.status <> 'pending' then raise exception 'Pick already settled'; end if;
  select * into g from games where id = pk.game_id;
  if g.commence_time <= now() then raise exception 'Game already started'; end if;
  delete from picks where id = pk.id;
end $$;
grant execute on function cancel_pick(uuid) to authenticated;
