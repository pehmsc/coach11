-- Add team label (A/B/C) to identify squad variant per competition.
alter table public.competitions
  add column if not exists team_label text;

update public.competitions
set team_label = 'A'
where team_label is null;

alter table public.competitions
  alter column team_label set default 'A';

alter table public.competitions
  alter column team_label set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'competitions_team_label_check'
  ) then
    alter table public.competitions
      add constraint competitions_team_label_check
      check (team_label in ('A', 'B', 'C'));
  end if;
end $$;

