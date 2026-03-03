alter table public.training_sessions
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists formatted_address text,
  add column if not exists osm_place_id text,
  add column if not exists location_source text;

alter table public.games
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists formatted_address text,
  add column if not exists osm_place_id text,
  add column if not exists location_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sessions_location_source_check'
  ) then
    alter table public.training_sessions
      add constraint training_sessions_location_source_check
      check (
        location_source is null
        or location_source in ('osm', 'manual')
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'games_location_source_check'
  ) then
    alter table public.games
      add constraint games_location_source_check
      check (
        location_source is null
        or location_source in ('osm', 'manual')
      );
  end if;
end
$$;

comment on column public.training_sessions.latitude is 'Latitude do local do treino (OSM/manual).';
comment on column public.training_sessions.longitude is 'Longitude do local do treino (OSM/manual).';
comment on column public.training_sessions.formatted_address is 'Morada normalizada pelo provider de geocoding.';
comment on column public.training_sessions.osm_place_id is 'Identificador OSM no formato N/W/R<ID>.';
comment on column public.training_sessions.location_source is 'Origem da localização: osm ou manual.';

comment on column public.games.latitude is 'Latitude do local do jogo (OSM/manual).';
comment on column public.games.longitude is 'Longitude do local do jogo (OSM/manual).';
comment on column public.games.formatted_address is 'Morada normalizada pelo provider de geocoding.';
comment on column public.games.osm_place_id is 'Identificador OSM no formato N/W/R<ID>.';
comment on column public.games.location_source is 'Origem da localização: osm ou manual.';
