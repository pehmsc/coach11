-- Add game_model JSONB column to age_groups for "Modelo de Jogo" (4 moments)
alter table public.age_groups
  add column if not exists game_model jsonb;

comment on column public.age_groups.game_model is
  'Modelo de Jogo — 4 momentos: org_ofensiva, org_defensiva, trans_ofensiva, trans_defensiva';
