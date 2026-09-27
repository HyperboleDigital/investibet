-- Investibet schema v1. Run in the Supabase SQL editor or via `supabase db push`.
create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  streak int not null default 0,
  weekly_cap numeric,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------- games (from The Odds API) ----------
create table if not exists games (
  id text primary key,                 -- odds api event id
  sport_key text not null,             -- americanfootball_nfl ...
  league text not null,                -- NFL, NBA ...
  home text not null,
  away text not null,
  commence_time timestamptz not null,
  completed boolean not null default false,
  home_score int,
  away_score int,
  updated_at timestamptz not null default now()
);
create index if not exists games_commence_idx on games (commence_time);
create index if not exists games_open_idx on games (completed, commence_time);

-- ---------- current lines (overwritten on each ingest; picks copy the locked values) ----------
create table if not exists lines (
  game_id text not null references games(id) on delete cascade,
  market text not null,                -- h2h | spreads | totals | prop
  selection text not null,             -- team name | Over | Under | "Player Name|player_points|Over"
  point numeric,                       -- spread or total number, null for h2h
  price int not null,                  -- american odds
  book text not null default 'consensus',
  fetched_at timestamptz not null default now(),
  primary key (game_id, market, selection)
);

-- ---------- stock lines (static, computed once) ----------
create table if not exists stock_lines (
  ticker text primary key,
  name text not null,
  tier int not null,                   -- 0 favorites, 1 value, 2 longshots
  avg_return_10y numeric not null,     -- percent
  max_drawdown numeric not null        -- percent, negative
);

create table if not exists prices (
  ticker text primary key references stock_lines(ticker),
  price numeric not null,
  as_of timestamptz not null default now()
);

-- ---------- picks ----------
create table if not exists picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  game_id text not null references games(id),
  market text not null,
  selection text not null,
  point numeric,
  odds int not null,                   -- locked american odds
  stake numeric not null check (stake >= 5 and stake <= 100),
  ticker text not null references stock_lines(ticker),
  locked_at timestamptz not null default now(),
  -- simulated buy (beta): filled at next market open with the price we have
  fill_price numeric,
  shares numeric,
  filled_at timestamptz,
  status text not null default 'pending',  -- pending | won | lost | push | void
  points numeric not null default 0,       -- after streak multiplier
  counted boolean not null default false,  -- in the best-15 for its week
  settled_at timestamptz,
  unique (user_id, game_id, market, selection)
);
create index if not exists picks_user_idx on picks (user_id, locked_at desc);
create index if not exists picks_game_idx on picks (game_id, status);

-- ---------- brokerage (fake for beta) ----------
create table if not exists brokerage_connections (
  user_id uuid primary key references profiles(id) on delete cascade,
  provider text not null,              -- webull | public | moomoo
  connected boolean not null default true,
  simulated boolean not null default true,
  connected_at timestamptz not null default now()
);

-- ---------- pool, feedback, ops ----------
create table if not exists pool_config (
  month text primary key,              -- YYYY-MM
  pot numeric not null default 100
);
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  text text not null,
  screen text,
  created_at timestamptz not null default now()
);
create table if not exists settlement_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  games_settled int not null default 0,
  picks_settled int not null default 0,
  note text
);
create table if not exists flags (
  key text primary key,
  enabled boolean not null default false
);
insert into flags (key, enabled) values ('props', false) on conflict do nothing;

-- ---------- leaderboard view (display fields only) ----------
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

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table games enable row level security;
alter table lines enable row level security;
alter table stock_lines enable row level security;
alter table prices enable row level security;
alter table picks enable row level security;
alter table brokerage_connections enable row level security;
alter table pool_config enable row level security;
alter table feedback enable row level security;
alter table flags enable row level security;

create policy "profiles read all" on profiles for select using (true);
create policy "profiles update own" on profiles for update using (auth.uid() = id);
create policy "games read" on games for select using (true);
create policy "lines read" on lines for select using (true);
create policy "stock read" on stock_lines for select using (true);
create policy "prices read" on prices for select using (true);
create policy "pool read" on pool_config for select using (true);
create policy "flags read" on flags for select using (true);
create policy "picks read own" on picks for select using (auth.uid() = user_id);
create policy "picks insert own" on picks for insert with check (auth.uid() = user_id);
create policy "broker own" on brokerage_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "feedback insert" on feedback for insert with check (auth.uid() = user_id);

-- Picks can only be locked before kickoff, on an open game, matching a current line.
create or replace function lock_pick(
  p_game_id text, p_market text, p_selection text, p_stake numeric, p_ticker text
) returns picks language plpgsql security definer set search_path = public as $$
declare l lines; g games; pk picks; cap numeric; staked numeric;
begin
  select * into g from games where id = p_game_id;
  if g is null or g.completed or g.commence_time <= now() then raise exception 'Game is locked'; end if;
  select * into l from lines where game_id = p_game_id and market = p_market and selection = p_selection;
  if l is null then raise exception 'Line not available'; end if;
  if exists (select 1 from picks where user_id = auth.uid() and game_id = p_game_id and market = p_market and selection <> p_selection)
     then raise exception 'You already picked the other side'; end if;
  select weekly_cap into cap from profiles where id = auth.uid();
  if cap is not null then
    select coalesce(sum(stake),0) into staked from picks p join games gg on gg.id = p.game_id
      where p.user_id = auth.uid() and date_trunc('week', gg.commence_time) = date_trunc('week', g.commence_time);
    if staked + p_stake > cap then raise exception 'Over your weekly cap'; end if;
  end if;
  insert into picks (user_id, game_id, market, selection, point, odds, stake, ticker)
  values (auth.uid(), p_game_id, p_market, p_selection, l.point, l.price, p_stake, p_ticker)
  returning * into pk;
  return pk;
end $$;
grant execute on function lock_pick(text,text,text,numeric,text) to authenticated;

-- ---------- seed: stock lines (approximate 10-yr figures, disclosed as such in-app) ----------
insert into stock_lines (ticker, name, tier, avg_return_10y, max_drawdown) values
('VOO','S&P 500 fund',0,13,-34),('VTI','Total US market fund',0,12.5,-35),('QQQ','Nasdaq 100 fund',0,18,-35),
('SCHD','Dividend fund',0,12,-33),('VXUS','International fund',0,6,-35),('BND','Bond fund',0,1.5,-18),
('XLK','Tech sector ETF',1,21,-35),('XLV','Health sector ETF',1,10,-28),('XLF','Financials ETF',1,12,-43),
('XLE','Energy ETF',1,5,-63),('VNQ','Real estate fund',1,6,-43),('JPM','JPMorgan',1,17,-44),('KO','Coca-Cola',1,7,-37),
('JNJ','Johnson & Johnson',1,6,-30),('COST','Costco',1,22,-33),
('AAPL','Apple',2,27,-38),('MSFT','Microsoft',2,27,-37),('NVDA','Nvidia',2,70,-66),('AMZN','Amazon',2,30,-56),
('GOOGL','Alphabet',2,22,-44),('META','Meta',2,25,-77),('TSLA','Tesla',2,45,-74),('NFLX','Netflix',2,30,-76),
('AMD','AMD',2,40,-65),('DIS','Disney',2,3,-60)
on conflict (ticker) do nothing;

insert into pool_config (month, pot) values (to_char(now(),'YYYY-MM'), 100) on conflict do nothing;
