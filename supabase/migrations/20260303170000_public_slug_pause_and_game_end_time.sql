alter table public.games
  add column if not exists end_time time null;

comment on column public.games.end_time is
  'Hora de fim prevista do jogo para apresentar intervalos públicos e duplicação de eventos.';

alter table public.age_groups
  add column if not exists public_slug text null,
  add column if not exists public_access_enabled boolean not null default false;

comment on column public.age_groups.public_slug is
  'Slug público estável do escalão usado em /public/[slug].';

comment on column public.age_groups.public_access_enabled is
  'Define se o link público fixo do escalão está ativo ou temporariamente pausado.';

create unique index if not exists age_groups_public_slug_unique_idx
  on public.age_groups(public_slug)
  where public_slug is not null;
