-- Team identity for the board: abbreviation, short name, and a contrast-checked accent color.
-- Colors are UI accents on monogram discs only. No logos anywhere. See docs/investibet-design-direction.md section 5.
-- Source: ESPN public teams API, imported by the engine (jobs/teams), never called from the client.
create table if not exists teams (
  id serial primary key,
  league text not null,                -- NFL, NCAAF, NBA, NCAAB, MLB, NHL
  espn_id text not null,
  abbreviation text not null,          -- PHI, ALA
  display_name text not null,          -- Philadelphia Eagles
  short_name text not null,            -- Eagles
  color text,                          -- ESPN primary, #rrggbb
  alt_color text,                      -- ESPN alternate
  ui_color text,                       -- the one we draw: first of color/alt that clears 3:1 on the card surface, else null
  updated_at timestamptz not null default now(),
  unique (league, espn_id)
);

-- The Odds API names games by full team name. One row per name, mapped once, kept forever.
-- Manual fixes win: the import job never overwrites an existing alias.
create table if not exists team_aliases (
  odds_api_name text primary key,
  team_id int not null references teams(id) on delete cascade
);

alter table teams enable row level security;
alter table team_aliases enable row level security;
create policy "teams read" on teams for select using (true);
create policy "aliases read" on team_aliases for select using (true);

-- Flat lookup for the client: one query, keyed by the name that appears on games.home / games.away.
create or replace view team_lookup as
  select a.odds_api_name, t.league, t.abbreviation, t.short_name, t.ui_color
  from team_aliases a join teams t on t.id = a.team_id;
