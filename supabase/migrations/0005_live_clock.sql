-- Live game state for score strips: current period and display clock,
-- written by the engine's 5-minute score polls while a game is in play.
alter table games add column if not exists period int;
alter table games add column if not exists clock text;
