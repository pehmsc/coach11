alter table if exists public.game_events
  add column if not exists external_player_convocation_id uuid references public.external_player_convocations(id) on delete set null;

alter table if exists public.game_events
  add column if not exists external_related_player_convocation_id uuid references public.external_player_convocations(id) on delete set null;

create index if not exists game_events_external_player_convocation_id_idx
  on public.game_events(external_player_convocation_id);

create index if not exists game_events_external_related_player_convocation_id_idx
  on public.game_events(external_related_player_convocation_id);
