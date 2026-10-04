-- Down and distance line for live football score strips ("2nd & 5 at HOU 29").
alter table games add column if not exists down_distance text;
