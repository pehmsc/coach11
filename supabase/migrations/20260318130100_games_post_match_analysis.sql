-- Post-match coach analysis fields
alter table public.games
  add column if not exists positive_aspects text,
  add column if not exists negative_aspects text,
  add column if not exists coach_notes text;

comment on column public.games.positive_aspects is 'Aspectos positivos do jogo (análise pós-jogo)';
comment on column public.games.negative_aspects is 'Aspectos a melhorar (análise pós-jogo)';
comment on column public.games.coach_notes is 'Notas gerais do treinador sobre o jogo';
