-- Live play-by-play line for in-card score strips, written on the engine's score polls.
alter table games add column if not exists last_play text;
