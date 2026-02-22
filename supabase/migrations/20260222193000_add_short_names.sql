alter table if exists public.age_groups
  add column if not exists club_short_name text;

alter table if exists public.games
  add column if not exists opponent_short_name text;
