-- Fase 2C: tenant boundary DB-first para live/convocation/stats/attendance.
-- Objetivo: impedir cross-club no domínio que ainda estava fora da propagação 2B.

create extension if not exists pgcrypto;

-- Garantir clube default para backfills de segurança.
insert into public.clubs (name, slug)
values ('Default Club', 'default')
on conflict (slug) do update
  set name = excluded.name;

-- 1) Colunas club_id
alter table if exists public.convocations add column if not exists club_id uuid;
alter table if exists public.convocation_players add column if not exists club_id uuid;
alter table if exists public.game_events add column if not exists club_id uuid;
alter table if exists public.game_stats_live add column if not exists club_id uuid;
alter table if exists public.game_final_stats add column if not exists club_id uuid;
alter table if exists public.game_live_checkpoints add column if not exists club_id uuid;
alter table if exists public.attendance_records add column if not exists club_id uuid;
alter table if exists public.training_attendance add column if not exists club_id uuid;
alter table if exists public.pse_records add column if not exists club_id uuid;

-- 2) Backfill canónico
-- convocations -> games
update public.convocations c
set club_id = g.club_id
from public.games g
where c.game_id = g.id
  and (c.club_id is null or c.club_id is distinct from g.club_id);

-- convocation_players -> convocations (preferido)
update public.convocation_players cp
set club_id = c.club_id
from public.convocations c
where cp.convocation_id = c.id
  and (cp.club_id is null or cp.club_id is distinct from c.club_id);

-- convocation_players -> games (fallback, se coluna game_id existir)
do $$
begin
  if to_regclass('public.convocation_players') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'convocation_players'
         and column_name = 'game_id'
     ) then
    execute $q$
      update public.convocation_players cp
      set club_id = g.club_id
      from public.games g
      where cp.game_id = g.id
        and (cp.club_id is null or cp.club_id is distinct from g.club_id)
    $q$;
  end if;
end $$;

-- game_* -> games
update public.game_events ge
set club_id = g.club_id
from public.games g
where ge.game_id = g.id
  and (ge.club_id is null or ge.club_id is distinct from g.club_id);

update public.game_stats_live gsl
set club_id = g.club_id
from public.games g
where gsl.game_id = g.id
  and (gsl.club_id is null or gsl.club_id is distinct from g.club_id);

update public.game_final_stats gfs
set club_id = g.club_id
from public.games g
where gfs.game_id = g.id
  and (gfs.club_id is null or gfs.club_id is distinct from g.club_id);

update public.game_live_checkpoints glc
set club_id = g.club_id
from public.games g
where glc.game_id = g.id
  and (glc.club_id is null or glc.club_id is distinct from g.club_id);

-- attendance_records -> training_sessions (training_session_id / session_id / training_id)
do $$
declare
  v_fk text;
begin
  if to_regclass('public.attendance_records') is null then
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance_records' and column_name = 'training_session_id'
  ) then
    v_fk := 'training_session_id';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance_records' and column_name = 'session_id'
  ) then
    v_fk := 'session_id';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance_records' and column_name = 'training_id'
  ) then
    v_fk := 'training_id';
  else
    v_fk := null;
  end if;

  if v_fk is not null then
    execute format(
      'update public.attendance_records ar
         set club_id = ts.club_id
        from public.training_sessions ts
       where ar.%I = ts.id
         and (ar.club_id is null or ar.club_id is distinct from ts.club_id)',
      v_fk
    );
  end if;
end $$;

-- training_attendance -> training_sessions (training_session_id / session_id / training_id)
do $$
declare
  v_fk text;
begin
  if to_regclass('public.training_attendance') is null then
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_attendance' and column_name = 'training_session_id'
  ) then
    v_fk := 'training_session_id';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_attendance' and column_name = 'session_id'
  ) then
    v_fk := 'session_id';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_attendance' and column_name = 'training_id'
  ) then
    v_fk := 'training_id';
  else
    v_fk := null;
  end if;

  if v_fk is not null then
    execute format(
      'update public.training_attendance ta
         set club_id = ts.club_id
        from public.training_sessions ts
       where ta.%I = ts.id
         and (ta.club_id is null or ta.club_id is distinct from ts.club_id)',
      v_fk
    );
  end if;
end $$;

-- pse_records fallback -> games / training_sessions / players (se existir)
do $$
begin
  if to_regclass('public.pse_records') is null then
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'game_id'
  ) then
    execute $q$
      update public.pse_records pr
      set club_id = g.club_id
      from public.games g
      where pr.game_id = g.id
        and (pr.club_id is null or pr.club_id is distinct from g.club_id)
    $q$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'training_session_id'
  ) then
    execute $q$
      update public.pse_records pr
      set club_id = ts.club_id
      from public.training_sessions ts
      where pr.training_session_id = ts.id
        and (pr.club_id is null or pr.club_id is distinct from ts.club_id)
    $q$;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'session_id'
  ) then
    execute $q$
      update public.pse_records pr
      set club_id = ts.club_id
      from public.training_sessions ts
      where pr.session_id = ts.id
        and (pr.club_id is null or pr.club_id is distinct from ts.club_id)
    $q$;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'training_id'
  ) then
    execute $q$
      update public.pse_records pr
      set club_id = ts.club_id
      from public.training_sessions ts
      where pr.training_id = ts.id
        and (pr.club_id is null or pr.club_id is distinct from ts.club_id)
    $q$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pse_records' and column_name = 'player_id'
  ) then
    execute $q$
      update public.pse_records pr
      set club_id = p.club_id
      from public.players p
      where pr.player_id = p.id
        and (pr.club_id is null or pr.club_id is distinct from p.club_id)
    $q$;
  end if;
end $$;

-- Fallback final para default club (evita NULLs residuais)
do $$
declare
  v_default_club_id uuid;
  v_table text;
begin
  select c.id into v_default_club_id
  from public.clubs c
  where c.slug = 'default'
  limit 1;

  if v_default_club_id is null then
    raise exception 'Clube default não encontrado para backfill 2C';
  end if;

  foreach v_table in array array[
    'convocations',
    'convocation_players',
    'game_events',
    'game_stats_live',
    'game_final_stats',
    'game_live_checkpoints',
    'attendance_records',
    'training_attendance',
    'pse_records'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    execute format(
      'update public.%I set club_id = $1 where club_id is null',
      v_table
    ) using v_default_club_id;
  end loop;
end $$;

-- 3) FK club_id -> clubs(id)
do $$
declare
  v_table text;
  v_rel regclass;
  v_constraint_name text;
begin
  foreach v_table in array array[
    'convocations',
    'convocation_players',
    'game_events',
    'game_stats_live',
    'game_final_stats',
    'game_live_checkpoints',
    'attendance_records',
    'training_attendance',
    'pse_records'
  ] loop
    v_rel := to_regclass(format('public.%I', v_table));
    if v_rel is null then
      continue;
    end if;

    v_constraint_name := format('%s_club_id_fkey', v_table);

    if not exists (
      select 1
      from pg_constraint
      where conname = v_constraint_name
        and conrelid = v_rel
    ) then
      execute format(
        'alter table public.%I
           add constraint %I
           foreign key (club_id) references public.clubs(id) on delete cascade',
        v_table,
        v_constraint_name
      );
    end if;
  end loop;
end $$;

-- 4) Trigger anti-drift por caminho canónico (game/convocation/training/player)
create or replace function public.sync_club_id_from_domain_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_game_id uuid;
  v_convocation_id uuid;
  v_training_session_id uuid;
  v_player_id uuid;
  v_club_id uuid;
begin
  v_row := to_jsonb(new);

  v_convocation_id := nullif(v_row ->> 'convocation_id', '')::uuid;
  v_game_id := nullif(v_row ->> 'game_id', '')::uuid;
  v_training_session_id := coalesce(
    nullif(v_row ->> 'training_session_id', '')::uuid,
    nullif(v_row ->> 'training_id', '')::uuid,
    nullif(v_row ->> 'session_id', '')::uuid
  );
  v_player_id := nullif(v_row ->> 'player_id', '')::uuid;

  -- 1) convocation_id -> convocations.club_id (canónico)
  if v_convocation_id is not null then
    select c.club_id
      into v_club_id
    from public.convocations c
    where c.id = v_convocation_id;

    if v_club_id is null then
      raise exception 'convocation_id inválido para sincronização de club_id';
    end if;
  end if;

  -- 2) game_id -> games.club_id (canónico)
  if v_club_id is null and v_game_id is not null then
    select g.club_id
      into v_club_id
    from public.games g
    where g.id = v_game_id;

    if v_club_id is null then
      raise exception 'game_id inválido para sincronização de club_id';
    end if;
  end if;

  -- 3) training_session -> training_sessions.club_id (canónico)
  if v_club_id is null and v_training_session_id is not null then
    select ts.club_id
      into v_club_id
    from public.training_sessions ts
    where ts.id = v_training_session_id;

    if v_club_id is null then
      raise exception 'training_session_id/session_id inválido para sincronização de club_id';
    end if;
  end if;

  -- 4) fallback legado: player_id -> players.club_id
  if v_club_id is null and v_player_id is not null then
    select p.club_id
      into v_club_id
    from public.players p
    where p.id = v_player_id;
  end if;

  if v_club_id is null then
    v_club_id := coalesce(
      new.club_id,
      public.user_default_club_id(),
      (
        select c.id
        from public.clubs c
        where c.slug = 'default'
        limit 1
      )
    );
  end if;

  if v_club_id is null then
    raise exception 'Não foi possível resolver club_id para %', tg_table_name;
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;

do $$
declare
  v_table text;
  v_trigger_name text;
begin
  foreach v_table in array array[
    'convocations',
    'convocation_players',
    'game_events',
    'game_stats_live',
    'game_final_stats',
    'game_live_checkpoints',
    'attendance_records',
    'training_attendance',
    'pse_records'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    v_trigger_name := format('trg_%s_sync_club_id', v_table);

    execute format('drop trigger if exists %I on public.%I', v_trigger_name, v_table);
    execute format(
      'create trigger %I
       before insert or update
       on public.%I
       for each row
       execute function public.sync_club_id_from_domain_refs()',
      v_trigger_name,
      v_table
    );
  end loop;
end $$;

-- Re-alinhar após triggers
update public.convocations c
set club_id = g.club_id
from public.games g
where c.game_id = g.id
  and c.club_id is distinct from g.club_id;

update public.convocation_players cp
set club_id = c.club_id
from public.convocations c
where cp.convocation_id = c.id
  and cp.club_id is distinct from c.club_id;

update public.game_events ge
set club_id = g.club_id
from public.games g
where ge.game_id = g.id
  and ge.club_id is distinct from g.club_id;

update public.game_stats_live gsl
set club_id = g.club_id
from public.games g
where gsl.game_id = g.id
  and gsl.club_id is distinct from g.club_id;

update public.game_final_stats gfs
set club_id = g.club_id
from public.games g
where gfs.game_id = g.id
  and gfs.club_id is distinct from g.club_id;

update public.game_live_checkpoints glc
set club_id = g.club_id
from public.games g
where glc.game_id = g.id
  and glc.club_id is distinct from g.club_id;

-- 5) Defaults / NOT NULL / índices
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'convocations',
    'convocation_players',
    'game_events',
    'game_stats_live',
    'game_final_stats',
    'game_live_checkpoints',
    'attendance_records',
    'training_attendance',
    'pse_records'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I alter column club_id set default public.user_default_club_id()',
      v_table
    );

    execute format(
      'alter table public.%I alter column club_id set not null',
      v_table
    );

    execute format(
      'create index if not exists %I on public.%I(club_id)',
      format('%s_club_id_idx', v_table),
      v_table
    );

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'game_id'
    ) then
      execute format(
        'create index if not exists %I on public.%I(club_id, game_id)',
        format('%s_club_game_idx', v_table),
        v_table
      );
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'convocation_id'
    ) then
      execute format(
        'create index if not exists %I on public.%I(club_id, convocation_id)',
        format('%s_club_convocation_idx', v_table),
        v_table
      );
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'training_session_id'
    ) then
      execute format(
        'create index if not exists %I on public.%I(club_id, training_session_id)',
        format('%s_club_training_session_idx', v_table),
        v_table
      );
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'session_id'
    ) then
      execute format(
        'create index if not exists %I on public.%I(club_id, session_id)',
        format('%s_club_session_idx', v_table),
        v_table
      );
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'training_id'
    ) then
      execute format(
        'create index if not exists %I on public.%I(club_id, training_id)',
        format('%s_club_training_idx', v_table),
        v_table
      );
    end if;
  end loop;
end $$;

-- 6) RLS boundary restritiva (sempre-on)
do $$
declare
  v_table text;
  v_policy_name text;
begin
  foreach v_table in array array[
    'convocations',
    'convocation_players',
    'game_events',
    'game_stats_live',
    'game_final_stats',
    'game_live_checkpoints',
    'attendance_records',
    'training_attendance',
    'pse_records'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_table);

    v_policy_name := format('%s_club_boundary_v1', v_table);
    execute format('drop policy if exists %I on public.%I', v_policy_name, v_table);
    execute format(
      'create policy %I
       on public.%I
       as restrictive
       for all
       using (public.user_can_access_club(club_id))
       with check (public.user_can_access_club(club_id))',
      v_policy_name,
      v_table
    );
  end loop;
end $$;

-- ============================================================================
-- VERIFICAÇÃO 1 — club_id NULL
-- ============================================================================
do $$
declare
  v_table text;
  v_count bigint;
begin
  raise notice 'VERIFICAÇÃO 1 — club_id NULL';
  foreach v_table in array array[
    'convocations',
    'convocation_players',
    'game_events',
    'game_stats_live',
    'game_final_stats',
    'game_live_checkpoints',
    'attendance_records',
    'training_attendance',
    'pse_records'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise notice '  %: tabela ausente', v_table;
      continue;
    end if;

    execute format('select count(*) from public.%I where club_id is null', v_table)
      into v_count;

    raise notice '  %: % rows com club_id NULL', v_table, v_count;
  end loop;
end $$;

-- ============================================================================
-- VERIFICAÇÃO 2 — mismatches de consistência com referências canónicas
-- ============================================================================
do $$
declare
  v_count bigint;
begin
  raise notice 'VERIFICAÇÃO 2 — mismatches canónicos';

  if to_regclass('public.convocations') is not null then
    select count(*)
      into v_count
    from public.convocations c
    join public.games g on g.id = c.game_id
    where c.club_id is distinct from g.club_id;
    raise notice '  convocations vs games: %', v_count;
  end if;

  if to_regclass('public.convocation_players') is not null then
    select count(*)
      into v_count
    from public.convocation_players cp
    join public.convocations c on c.id = cp.convocation_id
    where cp.club_id is distinct from c.club_id;
    raise notice '  convocation_players vs convocations: %', v_count;
  end if;

  if to_regclass('public.game_events') is not null then
    select count(*)
      into v_count
    from public.game_events ge
    join public.games g on g.id = ge.game_id
    where ge.club_id is distinct from g.club_id;
    raise notice '  game_events vs games: %', v_count;
  end if;

  if to_regclass('public.game_stats_live') is not null then
    select count(*)
      into v_count
    from public.game_stats_live gsl
    join public.games g on g.id = gsl.game_id
    where gsl.club_id is distinct from g.club_id;
    raise notice '  game_stats_live vs games: %', v_count;
  end if;

  if to_regclass('public.game_final_stats') is not null then
    select count(*)
      into v_count
    from public.game_final_stats gfs
    join public.games g on g.id = gfs.game_id
    where gfs.club_id is distinct from g.club_id;
    raise notice '  game_final_stats vs games: %', v_count;
  end if;

  if to_regclass('public.game_live_checkpoints') is not null then
    select count(*)
      into v_count
    from public.game_live_checkpoints glc
    join public.games g on g.id = glc.game_id
    where glc.club_id is distinct from g.club_id;
    raise notice '  game_live_checkpoints vs games: %', v_count;
  end if;
end $$;

-- ============================================================================
-- VERIFICAÇÃO 3 — distribuição por clube
-- ============================================================================
do $$
declare
  v_table text;
  v_row record;
begin
  raise notice 'VERIFICAÇÃO 3 — distribuição por clube';
  foreach v_table in array array[
    'convocations',
    'convocation_players',
    'game_events',
    'game_stats_live',
    'game_final_stats',
    'game_live_checkpoints',
    'attendance_records',
    'training_attendance',
    'pse_records'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    for v_row in execute format(
      'select club_id, count(*) as total from public.%I group by club_id order by total desc',
      v_table
    ) loop
      raise notice '  %. club_id=% total=%', v_table, v_row.club_id, v_row.total;
    end loop;
  end loop;
end $$;

-- ============================================================================
-- VERIFICAÇÃO 4 — RLS ativo
-- ============================================================================
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname = any(array[
    'convocations',
    'convocation_players',
    'game_events',
    'game_stats_live',
    'game_final_stats',
    'game_live_checkpoints',
    'attendance_records',
    'training_attendance',
    'pse_records'
  ])
order by c.relname;

-- ============================================================================
-- VERIFICAÇÃO 5 — policies presentes
-- ============================================================================
select
  schemaname,
  tablename,
  policyname,
  cmd,
  permissive
from pg_policies
where schemaname = 'public'
  and tablename = any(array[
    'convocations',
    'convocation_players',
    'game_events',
    'game_stats_live',
    'game_final_stats',
    'game_live_checkpoints',
    'attendance_records',
    'training_attendance',
    'pse_records'
  ])
order by tablename, policyname;

-- ============================================================================
-- ASSERTS MANUAIS (substituir UUIDs reais antes de executar)
-- ============================================================================
-- 1) Defina um JWT de user A e user B (clubes diferentes) e execute selects/updates
--    nas tabelas acima via PostgREST / SQL com request.jwt.claim.sub correspondente.
-- 2) Esperado: user A nunca consegue ler/escrever rows com club_id do clube B.
-- 3) Esperado: dentro do mesmo clube, políticas funcionais existentes continuam válidas.
