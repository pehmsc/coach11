


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."age_group_staff_assign_validate_refs"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_age_group_club_id uuid;
  v_linked_team_age_group_id uuid;
begin
  select ag.club_id
    into v_age_group_club_id
  from public.age_groups ag
  where ag.id = new.age_group_id;

  if v_age_group_club_id is null then
    raise exception 'age_group_staff.age_group_id invalido';
  end if;

  new.club_id := v_age_group_club_id;

  if new.linked_team_id is not null then
    select t.age_group_id
      into v_linked_team_age_group_id
    from public.teams t
    where t.id = new.linked_team_id;

    if v_linked_team_age_group_id is null then
      raise exception 'age_group_staff.linked_team_id invalido';
    end if;

    if v_linked_team_age_group_id is distinct from new.age_group_id then
      raise exception 'age_group_staff.linked_team_id deve pertencer ao mesmo age_group';
    end if;
  end if;

  if new.linked_team_id is null then
    new.linked_team_id := public.resolve_age_group_primary_team_id(new.age_group_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."age_group_staff_assign_validate_refs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."age_group_staff_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."age_group_staff_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."age_group_staff_sync_club_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    perform public.repair_club_membership_state(old.club_id, old.profile_id);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.club_id is distinct from new.club_id
       or old.profile_id is distinct from new.profile_id then
      perform public.repair_club_membership_state(old.club_id, old.profile_id);
    end if;
  end if;

  perform public.repair_club_membership_state(new.club_id, new.profile_id);
  return new;
end;
$$;


ALTER FUNCTION "public"."age_group_staff_sync_club_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."age_group_subtree_summary"("p_age_group_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_team_ids uuid[] := '{}'::uuid[];
  v_game_ids uuid[] := '{}'::uuid[];
  v_training_session_ids uuid[] := '{}'::uuid[];
  v_competition_ids uuid[] := '{}'::uuid[];
  v_convocation_ids uuid[] := '{}'::uuid[];
  v_player_ids uuid[] := '{}'::uuid[];
  v_team_messages_count bigint := 0;
  v_notifications_count bigint := 0;
  v_training_attendance_count bigint := 0;
  v_attendance_records_count bigint := 0;
  v_pse_records_count bigint := 0;
begin
  select coalesce(array_agg(t.id order by t.created_at asc, t.id asc), '{}'::uuid[])
    into v_team_ids
  from public.teams t
  where t.age_group_id = p_age_group_id;

  select coalesce(array_agg(g.id order by g.created_at asc, g.id asc), '{}'::uuid[])
    into v_game_ids
  from public.games g
  where g.age_group_id = p_age_group_id
     or (
       coalesce(array_length(v_team_ids, 1), 0) > 0
       and g.team_id = any(v_team_ids)
     );

  select coalesce(array_agg(ts.id order by ts.created_at asc, ts.id asc), '{}'::uuid[])
    into v_training_session_ids
  from public.training_sessions ts
  where ts.age_group_id = p_age_group_id
     or (
       coalesce(array_length(v_team_ids, 1), 0) > 0
       and ts.team_id = any(v_team_ids)
     );

  select coalesce(array_agg(c.id order by c.created_at asc, c.id asc), '{}'::uuid[])
    into v_competition_ids
  from public.competitions c
  where coalesce(array_length(v_team_ids, 1), 0) > 0
    and c.team_id = any(v_team_ids);

  select coalesce(array_agg(c.id order by c.created_at asc, c.id asc), '{}'::uuid[])
    into v_convocation_ids
  from public.convocations c
  where coalesce(array_length(v_game_ids, 1), 0) > 0
    and c.game_id = any(v_game_ids);

  select coalesce(array_agg(p.id order by p.created_at asc, p.id asc), '{}'::uuid[])
    into v_player_ids
  from public.players p
  where p.age_group_id = p_age_group_id;

  if to_regclass('public.team_messages') is not null then
    select count(*)
      into v_team_messages_count
    from public.team_messages tm
    where tm.age_group_id = p_age_group_id
       or (
         coalesce(array_length(v_team_ids, 1), 0) > 0
         and tm.team_id = any(v_team_ids)
       );
  end if;

  if to_regclass('public.notifications') is not null then
    select count(*)
      into v_notifications_count
    from public.notifications n
    where n.age_group_id = p_age_group_id
       or (
         coalesce(array_length(v_team_ids, 1), 0) > 0
         and n.team_id = any(v_team_ids)
       );
  end if;

  if public.table_has_column('training_attendance', 'training_session_id') then
    v_training_attendance_count := public.count_rows_by_ids(
      'training_attendance',
      'training_session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('training_attendance', 'session_id') then
    v_training_attendance_count := public.count_rows_by_ids(
      'training_attendance',
      'session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('training_attendance', 'training_id') then
    v_training_attendance_count := public.count_rows_by_ids(
      'training_attendance',
      'training_id',
      v_training_session_ids
    );
  end if;

  if public.table_has_column('attendance_records', 'training_session_id') then
    v_attendance_records_count := public.count_rows_by_ids(
      'attendance_records',
      'training_session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('attendance_records', 'session_id') then
    v_attendance_records_count := public.count_rows_by_ids(
      'attendance_records',
      'session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('attendance_records', 'training_id') then
    v_attendance_records_count := public.count_rows_by_ids(
      'attendance_records',
      'training_id',
      v_training_session_ids
    );
  end if;

  if public.table_has_column('pse_records', 'player_id') then
    v_pse_records_count := v_pse_records_count + public.count_rows_by_ids(
      'pse_records',
      'player_id',
      v_player_ids
    );
  end if;
  if public.table_has_column('pse_records', 'game_id') then
    v_pse_records_count := v_pse_records_count + public.count_rows_by_ids(
      'pse_records',
      'game_id',
      v_game_ids
    );
  end if;
  if public.table_has_column('pse_records', 'training_session_id') then
    v_pse_records_count := v_pse_records_count + public.count_rows_by_ids(
      'pse_records',
      'training_session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('pse_records', 'session_id') then
    v_pse_records_count := v_pse_records_count + public.count_rows_by_ids(
      'pse_records',
      'session_id',
      v_training_session_ids
    );
  elsif public.table_has_column('pse_records', 'training_id') then
    v_pse_records_count := v_pse_records_count + public.count_rows_by_ids(
      'pse_records',
      'training_id',
      v_training_session_ids
    );
  end if;

  return jsonb_build_object(
    'teams', coalesce(array_length(v_team_ids, 1), 0),
    'age_group_staff', (
      select count(*) from public.age_group_staff ags where ags.age_group_id = p_age_group_id
    ),
    'team_staff', public.count_rows_by_ids('team_staff', 'team_id', v_team_ids),
    'players', coalesce(array_length(v_player_ids, 1), 0),
    'training_sessions', coalesce(array_length(v_training_session_ids, 1), 0),
    'games', coalesce(array_length(v_game_ids, 1), 0),
    'competitions', coalesce(array_length(v_competition_ids, 1), 0),
    'staff_invites', (
      select count(*) from public.staff_invites si where si.age_group_id = p_age_group_id
    ),
    'team_messages', v_team_messages_count,
    'notifications', v_notifications_count,
    'convocations', coalesce(array_length(v_convocation_ids, 1), 0),
    'convocation_players', public.count_rows_by_ids(
      'convocation_players',
      'convocation_id',
      v_convocation_ids
    ),
    'game_events', public.count_rows_by_ids('game_events', 'game_id', v_game_ids),
    'game_stats_live', public.count_rows_by_ids('game_stats_live', 'game_id', v_game_ids),
    'game_final_stats', public.count_rows_by_ids('game_final_stats', 'game_id', v_game_ids),
    'game_live_checkpoints', public.count_rows_by_ids(
      'game_live_checkpoints',
      'game_id',
      v_game_ids
    ),
    'training_attendance', v_training_attendance_count,
    'attendance_records', v_attendance_records_count,
    'pse_records', v_pse_records_count,
    'external_player_convocations', public.count_rows_by_ids(
      'external_player_convocations',
      'game_id',
      v_game_ids
    )
  );
end;
$$;


ALTER FUNCTION "public"."age_group_subtree_summary"("p_age_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."age_groups_assign_club_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if new.club_id is null then
    new.club_id := public.ensure_age_group_technical_club(
      new.id,
      new.club_name,
      new.name
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."age_groups_assign_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."age_groups_sync_coordinator_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'UPDATE' then
    if old.club_id is distinct from new.club_id
       or old.coordinator_id is distinct from new.coordinator_id then
      perform public.repair_club_membership_state(old.club_id, old.coordinator_id);
    end if;
  end if;

  perform public.repair_club_membership_state(new.club_id, new.coordinator_id);
  return new;
end;
$$;


ALTER FUNCTION "public"."age_groups_sync_coordinator_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_public_share_rate_limit"("p_token_hash" "text", "p_ip_hash" "text", "p_ip_limit" integer DEFAULT 60, "p_token_limit" integer DEFAULT 300) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := now();
  v_ip_window timestamptz := date_trunc('minute', v_now);
  v_token_window timestamptz := date_trunc('hour', v_now);
  v_ip_count integer;
  v_token_count integer;
begin
  if coalesce(length(trim(p_token_hash)), 0) = 0 or coalesce(length(trim(p_ip_hash)), 0) = 0 then
    raise exception 'public_share_rate_limit_missing_key';
  end if;

  insert into public.public_rate_limit_counters as c (
    scope,
    scope_key,
    window_start,
    count,
    created_at,
    updated_at
  )
  values (
    'public_share_ip_minute',
    p_ip_hash,
    v_ip_window,
    1,
    v_now,
    v_now
  )
  on conflict (scope, scope_key, window_start)
  do update
    set count = c.count + 1,
        updated_at = excluded.updated_at
  returning count into v_ip_count;

  insert into public.public_rate_limit_counters as c (
    scope,
    scope_key,
    window_start,
    count,
    created_at,
    updated_at
  )
  values (
    'public_share_token_hour',
    p_token_hash,
    v_token_window,
    1,
    v_now,
    v_now
  )
  on conflict (scope, scope_key, window_start)
  do update
    set count = c.count + 1,
        updated_at = excluded.updated_at
  returning count into v_token_count;

  return jsonb_build_object(
    'ok', v_ip_count <= p_ip_limit and v_token_count <= p_token_limit,
    'ipCount', v_ip_count,
    'ipLimit', p_ip_limit,
    'tokenCount', v_token_count,
    'tokenLimit', p_token_limit
  );
end;
$$;


ALTER FUNCTION "public"."consume_public_share_rate_limit"("p_token_hash" "text", "p_ip_hash" "text", "p_ip_limit" integer, "p_token_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convocation_player_matches_game_scope"("p_convocation_id" "uuid", "p_player_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.convocations c
    join public.games g
      on g.id = c.game_id
    left join public.teams t
      on t.id = g.team_id
    join public.players p
      on p.id = p_player_id
    where c.id = p_convocation_id
      and (
        coalesce(g.age_group_id, t.age_group_id) is null
        or p.age_group_id = coalesce(g.age_group_id, t.age_group_id)
      )
  );
$$;


ALTER FUNCTION "public"."convocation_player_matches_game_scope"("p_convocation_id" "uuid", "p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_rows_by_ids"("p_table" "text", "p_column" "text", "p_ids" "uuid"[]) RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_count bigint := 0;
begin
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    return 0;
  end if;

  if not public.table_has_column(p_table, p_column) then
    return 0;
  end if;

  execute format(
    'select count(*) from public.%I where %I = any($1)',
    p_table,
    p_column
  )
  into v_count
  using p_ids;

  return coalesce(v_count, 0);
end;
$_$;


ALTER FUNCTION "public"."count_rows_by_ids"("p_table" "text", "p_column" "text", "p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_club_onboarding"("p_name" "text", "p_short_name" "text" DEFAULT NULL::"text", "p_slug" "text" DEFAULT 'clube'::"text", "p_logo_url" "text" DEFAULT NULL::"text", "p_plan_type" "text" DEFAULT 'club'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_club_id uuid;
  v_final_slug text;
  v_attempt int := 0;
  v_plan_type text;
  v_tier text;
begin
  -- Verificar autenticacao
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Normalizar plan_type (default seguro 'club')
  v_plan_type := case when p_plan_type = 'individual' then 'individual' else 'club' end;
  v_tier := case when v_plan_type = 'individual' then 'individual' else 'standard' end;

  -- Idempotencia: se ja tem clube, retornar o existente
  select cm.club_id into v_club_id
  from public.club_memberships cm
  where cm.profile_id = v_uid
  order by cm.created_at asc
  limit 1;

  if v_club_id is not null then
    return jsonb_build_object('club_id', v_club_id, 'already_existed', true);
  end if;

  -- Gerar slug unico com retry
  v_final_slug := coalesce(nullif(trim(p_slug), ''), 'clube');
  while v_attempt < 10 loop
    begin
      insert into public.clubs (name, short_name, slug, logo_url, plan_type, tier)
      values (
        trim(p_name),
        nullif(trim(coalesce(p_short_name, '')), ''),
        case when v_attempt = 0 then v_final_slug
             else v_final_slug || '-' || v_attempt
        end,
        nullif(trim(coalesce(p_logo_url, '')), ''),
        v_plan_type,
        v_tier
      )
      returning id into v_club_id;
      exit; -- sucesso
    exception when unique_violation then
      v_attempt := v_attempt + 1;
    end;
  end loop;

  if v_club_id is null then
    raise exception 'slug_conflict';
  end if;

  -- Criar membership de coordenador de clube
  insert into public.club_memberships (club_id, profile_id, role)
  values (v_club_id, v_uid, 'club_coordinator');

  return jsonb_build_object(
    'club_id', v_club_id,
    'already_existed', false,
    'plan_type', v_plan_type
  );
end;
$$;


ALTER FUNCTION "public"."create_club_onboarding"("p_name" "text", "p_short_name" "text", "p_slug" "text", "p_logo_url" "text", "p_plan_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_initial_lineup_immutability"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  current_game_status TEXT;
BEGIN
  IF OLD.initial_lineup_status IS DISTINCT FROM NEW.initial_lineup_status THEN
    SELECT status INTO current_game_status FROM public.games WHERE id = NEW.game_id;
    IF current_game_status IS NOT NULL AND current_game_status NOT IN ('scheduled') THEN
      RAISE EXCEPTION 'initial_lineup_status só pode ser alterado enquanto o jogo está scheduled (atual: %)', current_game_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_initial_lineup_immutability"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_age_group_technical_club"("p_age_group_id" "uuid", "p_club_name" "text", "p_age_group_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_slug text := format('ag-tech-%s', replace(p_age_group_id::text, '-', ''));
  v_name text := trim(
    coalesce(nullif(p_club_name, ''), 'Age Group')
    || ' · '
    || coalesce(nullif(p_age_group_name, ''), p_age_group_id::text)
    || ' [technical]'
  );
  v_club_id uuid;
begin
  if p_age_group_id is null then
    raise exception 'ensure_age_group_technical_club exige p_age_group_id';
  end if;

  insert into public.clubs (name, slug)
  values (v_name, v_slug)
  on conflict (slug) do update
    set name = excluded.name
  returning id into v_club_id;

  return v_club_id;
end;
$$;


ALTER FUNCTION "public"."ensure_age_group_technical_club"("p_age_group_id" "uuid", "p_club_name" "text", "p_age_group_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exercises_assign_club_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_club_id uuid;
begin
  select ag.club_id
    into v_club_id
  from public.age_groups ag
  where ag.id = new.age_group_id;

  if v_club_id is null then
    raise exception 'exercises.age_group_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."exercises_assign_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."game_exists"("p_game_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
  );
$$;


ALTER FUNCTION "public"."game_exists"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_club_insights"("p_club_id" "uuid", "p_season" "text", "p_age_group_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("club_id" "uuid", "age_groups_count" integer, "players_count" integer, "trainings_completed" integer, "trainings_total" integer, "trainings_present" bigint, "training_minutes" bigint, "games_played" integer, "games_won" integer, "games_drawn" integer, "games_lost" integer, "game_minutes" bigint, "goals_for" bigint, "goals_against" bigint, "assists" bigint, "yellow_cards" bigint, "red_cards" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.user_can_access_club(p_club_id) THEN
    RAISE EXCEPTION 'forbidden: user does not have access to club %', p_club_id
      USING ERRCODE = '42501';
  END IF;

  IF p_age_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.age_groups ag
      WHERE ag.id = p_age_group_id AND ag.club_id = p_club_id
    ) THEN
      RAISE EXCEPTION 'forbidden: age_group % does not belong to club %', p_age_group_id, p_club_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH scoped_age_groups AS (
    SELECT ag.id, ag.football_format
    FROM public.age_groups ag
    WHERE ag.club_id = p_club_id
      AND (p_season IS NULL OR ag.season = p_season)
      AND (p_age_group_id IS NULL OR ag.id = p_age_group_id)
  ),
  players_stats AS (
    SELECT
      COUNT(DISTINCT pss.player_id)::integer AS players_count,
      COALESCE(SUM(pss.trainings_present), 0)::bigint AS trainings_present,
      COALESCE(SUM(pss.assists), 0)::bigint AS assists,
      COALESCE(SUM(pss.yellow_cards), 0)::bigint AS yellow_cards,
      COALESCE(SUM(pss.red_cards), 0)::bigint AS red_cards
    FROM public.player_season_stats pss
    WHERE pss.age_group_id IN (SELECT id FROM scoped_age_groups)
  ),
  trainings_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE ts.status = 'completed')::integer AS trainings_completed,
      COUNT(*)::integer AS trainings_total,
      COALESCE(
        SUM(
          EXTRACT(EPOCH FROM (ts.end_time - ts.start_time)) / 60.0
        ) FILTER (
          WHERE ts.status = 'completed'
            AND ts.start_time IS NOT NULL
            AND ts.end_time IS NOT NULL
        ),
        0
      )::bigint AS training_minutes
    FROM public.training_sessions ts
    WHERE ts.age_group_id IN (SELECT id FROM scoped_age_groups)
  ),
  games_scoped AS (
    SELECT
      g.id,
      g.is_home,
      g.score_home,
      g.score_away,
      sag.football_format
    FROM public.games g
    JOIN scoped_age_groups sag ON sag.id = g.age_group_id
    WHERE g.score_home IS NOT NULL
      AND g.score_away IS NOT NULL
  ),
  games_stats AS (
    SELECT
      COUNT(*)::integer AS games_played,
      COUNT(*) FILTER (
        WHERE (is_home AND score_home > score_away)
           OR (NOT is_home AND score_away > score_home)
      )::integer AS games_won,
      COUNT(*) FILTER (WHERE score_home = score_away)::integer AS games_drawn,
      COUNT(*) FILTER (
        WHERE (is_home AND score_home < score_away)
           OR (NOT is_home AND score_away < score_home)
      )::integer AS games_lost,
      COALESCE(
        SUM(CASE WHEN is_home THEN score_home ELSE score_away END),
        0
      )::bigint AS goals_for,
      COALESCE(
        SUM(CASE WHEN is_home THEN score_away ELSE score_home END),
        0
      )::bigint AS goals_against,
      COALESCE(
        SUM(
          CASE football_format
            WHEN '5' THEN 40
            WHEN '7' THEN 50
            WHEN '9' THEN 60
            WHEN '11' THEN 80
            ELSE 60
          END
        ),
        0
      )::bigint AS game_minutes
    FROM games_scoped
  ),
  ag_count AS (
    SELECT COUNT(*)::integer AS n FROM scoped_age_groups
  )
  SELECT
    p_club_id AS club_id,
    ag_count.n AS age_groups_count,
    players_stats.players_count,
    trainings_stats.trainings_completed,
    trainings_stats.trainings_total,
    players_stats.trainings_present,
    trainings_stats.training_minutes,
    games_stats.games_played,
    games_stats.games_won,
    games_stats.games_drawn,
    games_stats.games_lost,
    games_stats.game_minutes,
    games_stats.goals_for,
    games_stats.goals_against,
    players_stats.assists,
    players_stats.yellow_cards,
    players_stats.red_cards
  FROM ag_count, players_stats, trainings_stats, games_stats;
END;
$$;


ALTER FUNCTION "public"."get_club_insights"("p_club_id" "uuid", "p_season" "text", "p_age_group_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_club_insights"("p_club_id" "uuid", "p_season" "text", "p_age_group_id" "uuid") IS 'Agrega KPIs do clube (treinos, jogos, atletas). Quando p_age_group_id e'' fornecido, restringe ao escalao indicado (validando pertenca ao clube). game_minutes = soma da duracao padrao dos jogos disputados, derivada do football_format do escalao.';



CREATE OR REPLACE FUNCTION "public"."get_club_player_rankings"("p_club_id" "uuid", "p_metric" "text", "p_season" "text" DEFAULT NULL::"text", "p_age_group_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 10) RETURNS TABLE("player_id" "uuid", "full_name" "text", "preferred_position" "text", "jersey_number" integer, "age_group_id" "uuid", "age_group_name" "text", "avatar_url" "text", "photo_consent_given" boolean, "goals" bigint, "assists" bigint, "total_minutes" bigint, "matches_played" bigint, "trainings_present" bigint, "trainings_absent" bigint, "trainings_injured" bigint, "trainings_late" bigint, "metric_value" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_effective_limit int;
BEGIN
  IF NOT public.user_can_access_club(p_club_id) THEN
    RAISE EXCEPTION 'forbidden: user does not have access to club %', p_club_id
      USING ERRCODE = '42501';
  END IF;

  IF p_metric NOT IN (
    'goals', 'assists', 'minutes', 'matches',
    'trainings_present', 'trainings_absent', 'trainings_injured', 'trainings_late'
  ) THEN
    RAISE EXCEPTION 'invalid metric: % (expected one of goals|assists|minutes|matches|trainings_present|trainings_absent|trainings_injured|trainings_late)', p_metric
      USING ERRCODE = '22023';
  END IF;

  IF p_age_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.age_groups ag
      WHERE ag.id = p_age_group_id AND ag.club_id = p_club_id
    ) THEN
      RAISE EXCEPTION 'forbidden: age_group % does not belong to club %', p_age_group_id, p_club_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_effective_limit := GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));

  RETURN QUERY
  SELECT
    pss.player_id,
    pss.full_name,
    pss.preferred_position,
    pss.jersey_number,
    pss.age_group_id,
    ag.name AS age_group_name,
    pl.avatar_url,
    pl.photo_consent_given,
    pss.goals,
    pss.assists,
    pss.total_minutes,
    (pss.matches_started + pss.matches_substitute)::bigint AS matches_played,
    pss.trainings_present,
    pss.trainings_absent,
    pss.trainings_injured,
    pss.trainings_late,
    CASE p_metric
      WHEN 'goals' THEN pss.goals
      WHEN 'assists' THEN pss.assists
      WHEN 'minutes' THEN pss.total_minutes
      WHEN 'matches' THEN (pss.matches_started + pss.matches_substitute)::bigint
      WHEN 'trainings_present' THEN pss.trainings_present
      WHEN 'trainings_absent' THEN pss.trainings_absent
      WHEN 'trainings_injured' THEN pss.trainings_injured
      WHEN 'trainings_late' THEN pss.trainings_late
    END AS metric_value
  FROM public.player_season_stats pss
  JOIN public.age_groups ag ON ag.id = pss.age_group_id
  JOIN public.players pl ON pl.id = pss.player_id
  WHERE ag.club_id = p_club_id
    AND (p_season IS NULL OR ag.season = p_season)
    AND (p_age_group_id IS NULL OR ag.id = p_age_group_id)
  ORDER BY metric_value DESC NULLS LAST, pss.full_name ASC
  LIMIT v_effective_limit;
END;
$$;


ALTER FUNCTION "public"."get_club_player_rankings"("p_club_id" "uuid", "p_metric" "text", "p_season" "text", "p_age_group_id" "uuid", "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_club_player_rankings"("p_club_id" "uuid", "p_metric" "text", "p_season" "text", "p_age_group_id" "uuid", "p_limit" integer) IS 'Insights: top-N atletas de um clube por metrica. Metricas de jogo: goals, assists, minutes, matches. Metricas de treino: trainings_present, trainings_absent, trainings_injured, trainings_late. Quando p_age_group_id preenchido, restringe ao escalao (validando pertenca ao clube). Inclui avatar_url e photo_consent_given para a UI decidir foto vs iniciais.';



CREATE OR REPLACE FUNCTION "public"."get_player_season_stats"("p_club_id" "uuid", "p_age_group_id" "uuid", "p_season" "text" DEFAULT NULL::"text") RETURNS TABLE("player_id" "uuid", "player_name" "text", "player_number" integer, "player_position" "text", "games_convoked" integer, "games_started" integer, "games_substitute" integer, "total_minutes" integer, "goals" integer, "assists" integer, "yellow_cards" integer, "red_cards" integer, "own_goals" integer, "avg_rating" numeric, "attendance_total" integer, "attendance_present" integer, "attendance_absent" integer, "attendance_late" integer, "attendance_injured" integer, "attendance_rate" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with scoped_players as (
    select
      p.id as player_id,
      trim(concat_ws(' ', p.first_name, p.last_name)) as player_name,
      p.jersey_number as player_number,
      p.preferred_position as player_position
    from public.players p
    join public.age_groups ag
      on ag.id = p.age_group_id
    where p.club_id = p_club_id
      and p.age_group_id = p_age_group_id
      and (p_season is null or ag.season = p_season)
  ),
  game_stats as (
    select
      gfs.player_id,
      count(*)::int as games_total,
      count(*) filter (where gfs.lineup_type = 'starter')::int as started,
      count(*) filter (where gfs.lineup_type = 'substitute')::int as subbed,
      coalesce(sum(gfs.minutes_played), 0)::int as minutes,
      coalesce(sum(gfs.goals), 0)::int as goals,
      coalesce(sum(gfs.assists), 0)::int as assists,
      coalesce(sum(gfs.yellow_cards), 0)::int as yellow_cards,
      coalesce(sum(gfs.red_cards), 0)::int as red_cards,
      coalesce(sum(gfs.own_goals), 0)::int as own_goals,
      round(avg(gfs.coach_rating)::numeric, 1) as avg_rating
    from public.game_final_stats gfs
    join public.games g
      on g.id = gfs.game_id
    left join public.teams t
      on t.id = g.team_id
    left join public.age_groups ag
      on ag.id = coalesce(g.age_group_id, t.age_group_id)
    where coalesce(gfs.club_id, g.club_id) = p_club_id
      and coalesce(g.age_group_id, t.age_group_id) = p_age_group_id
      and gfs.is_finalized = true
      and (p_season is null or ag.season = p_season)
    group by gfs.player_id
  ),
  attendance_stats as (
    select
      ta.player_id,
      count(*)::int as total,
      count(*) filter (where ta.status = 'present')::int as present,
      count(*) filter (where ta.status = 'absent')::int as absent,
      count(*) filter (where ta.status = 'late')::int as late,
      count(*) filter (where ta.status = 'injured')::int as injured
    from public.training_attendance ta
    join public.training_sessions ts
      on ts.id = ta.training_session_id
    join public.age_groups ag
      on ag.id = ts.age_group_id
    where coalesce(ta.club_id, ts.club_id) = p_club_id
      and ts.age_group_id = p_age_group_id
      and ts.status = 'completed'
      and (p_season is null or ag.season = p_season)
    group by ta.player_id
  )
  select
    sp.player_id,
    sp.player_name,
    sp.player_number,
    sp.player_position,
    coalesce(gs.games_total, 0),
    coalesce(gs.started, 0),
    coalesce(gs.subbed, 0),
    coalesce(gs.minutes, 0),
    coalesce(gs.goals, 0),
    coalesce(gs.assists, 0),
    coalesce(gs.yellow_cards, 0),
    coalesce(gs.red_cards, 0),
    coalesce(gs.own_goals, 0),
    coalesce(gs.avg_rating, 0::numeric)::numeric(3,1),
    coalesce(att.total, 0),
    coalesce(att.present, 0),
    coalesce(att.absent, 0),
    coalesce(att.late, 0),
    coalesce(att.injured, 0),
    case
      when coalesce(att.total, 0) > 0
        then round((att.present::numeric / att.total::numeric) * 100, 2)::numeric(5,2)
      else 0::numeric(5,2)
    end
  from scoped_players sp
  left join game_stats gs
    on gs.player_id = sp.player_id
  left join attendance_stats att
    on att.player_id = sp.player_id
  order by coalesce(gs.minutes, 0) desc, sp.player_name asc;
end;
$$;


ALTER FUNCTION "public"."get_player_season_stats"("p_club_id" "uuid", "p_age_group_id" "uuid", "p_season" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_team_staff_projection_only"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
     or auth.role() = 'service_role'
     or pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  raise exception 'team_staff_projection_only'
    using errcode = '42501',
          detail = 'team_staff é uma projeção compatível derivada de age_group_staff.',
          hint = 'Escreve em age_group_staff em vez de team_staff.';
end;
$$;


ALTER FUNCTION "public"."guard_team_staff_projection_only"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."guard_team_staff_projection_only"() IS 'Bloqueia writes diretos de authenticated em team_staff; apenas service_role e projeções internas podem escrever.';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1),
      'Utilizador'
    ),
    'coordinator'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."microciclos_assign_club_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_club_id uuid;
begin
  select ag.club_id
    into v_club_id
  from public.age_groups ag
  where ag.id = new.age_group_id;

  if v_club_id is null then
    raise exception 'microciclos.age_group_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."microciclos_assign_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_team_staff_role_v2"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.role = 'head_coach' then
    new.role := 'coach';
  elsif new.role = 'coordinator' then
    new.role := 'coach';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."normalize_team_staff_role_v2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."player_behavioral_assessments_assign_club_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_club_id uuid;
begin
  select p.club_id
    into v_club_id
  from public.players p
  where p.id = new.player_id;

  if v_club_id is null then
    raise exception 'player_behavioral_assessments.player_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."player_behavioral_assessments_assign_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."player_documents_assign_club_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_club_id uuid;
begin
  select p.club_id
    into v_club_id
  from public.players p
  where p.id = new.player_id;

  if v_club_id is null then
    raise exception 'player_documents.player_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."player_documents_assign_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."player_registrations_assign_validate_club_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_player_club_id uuid;
  v_team_club_id uuid;
begin
  select p.club_id
    into v_player_club_id
  from public.players p
  where p.id = new.player_id;

  if v_player_club_id is null then
    raise exception 'player_registrations.player_id invalido';
  end if;

  if new.team_id is not null then
    select t.club_id
      into v_team_club_id
    from public.teams t
    where t.id = new.team_id;

    if v_team_club_id is null then
      raise exception 'player_registrations.team_id invalido';
    end if;

    if v_team_club_id is distinct from v_player_club_id then
      raise exception 'player_registrations.team_id deve pertencer ao mesmo club do player';
    end if;
  end if;

  new.club_id := v_player_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."player_registrations_assign_validate_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profile_has_conflicting_age_group_membership"("p_profile_id" "uuid", "p_allowed_age_group_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.age_groups ag
    where ag.coordinator_id = p_profile_id
      and (
        p_allowed_age_group_id is null
        or ag.id is distinct from p_allowed_age_group_id
      )
    union all
    select 1
    from public.age_group_staff ags
    where ags.profile_id = p_profile_id
      and (
        p_allowed_age_group_id is null
        or ags.age_group_id is distinct from p_allowed_age_group_id
      )
  );
$$;


ALTER FUNCTION "public"."profile_has_conflicting_age_group_membership"("p_profile_id" "uuid", "p_allowed_age_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_auto_default_club_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_auto_default_club_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_guard_super_coordinator"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_super_email constant text := 'pedrohmscampos@gmail.com';
begin
  if new.email is not null then
    new.email := lower(trim(new.email));
  end if;

  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.is_super_coordinator := false;
    elsif tg_op = 'UPDATE' then
      new.is_super_coordinator := old.is_super_coordinator;
    end if;
  end if;

  if lower(coalesce(new.email, '')) <> v_super_email then
    new.is_super_coordinator := false;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_guard_super_coordinator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_notifications_before"("p_cutoff" timestamp with time zone) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted integer := 0;
begin
  with deleted_rows as (
    delete from public.notifications
    where created_at < p_cutoff
    returning 1
  )
  select count(*) into v_deleted
  from deleted_rows;

  return coalesce(v_deleted, 0);
end;
$$;


ALTER FUNCTION "public"."prune_notifications_before"("p_cutoff" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_public_age_group_access"("p_age_group_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.age_groups
  set public_access_count = coalesce(public_access_count, 0) + 1,
      public_last_accessed_at = now()
  where id = p_age_group_id
    and public_slug is not null;
$$;


ALTER FUNCTION "public"."register_public_age_group_access"("p_age_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rehome_age_group_to_dedicated_technical_club"("p_age_group_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_age_group record;
  v_old_club_id uuid;
  v_new_club_id uuid;
  v_old_club_slug text;
  v_new_club_slug text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_team_ids uuid[] := '{}'::uuid[];
  v_game_ids uuid[] := '{}'::uuid[];
  v_training_session_ids uuid[] := '{}'::uuid[];
  v_competition_ids uuid[] := '{}'::uuid[];
  v_convocation_ids uuid[] := '{}'::uuid[];
  v_player_ids uuid[] := '{}'::uuid[];
  v_candidate_profile_ids uuid[] := '{}'::uuid[];
  v_profile_id uuid;
begin
  select ag.id,
         ag.club_id,
         ag.coordinator_id,
         ag.club_name,
         ag.name
    into v_age_group
  from public.age_groups ag
  where ag.id = p_age_group_id
  limit 1
  for update;

  if v_age_group.id is null then
    raise exception 'age_group % não encontrado para re-home', p_age_group_id;
  end if;

  v_before := public.age_group_subtree_summary(p_age_group_id);
  v_old_club_id := v_age_group.club_id;

  if v_old_club_id is not null then
    select c.slug
      into v_old_club_slug
    from public.clubs c
    where c.id = v_old_club_id
    limit 1;
  end if;

  v_new_club_id := public.ensure_age_group_technical_club(
    p_age_group_id,
    v_age_group.club_name,
    v_age_group.name
  );

  select c.slug
    into v_new_club_slug
  from public.clubs c
  where c.id = v_new_club_id
  limit 1;

  update public.age_groups
  set club_id = v_new_club_id
  where id = p_age_group_id;

  select coalesce(array_agg(t.id order by t.created_at asc, t.id asc), '{}'::uuid[])
    into v_team_ids
  from public.teams t
  where t.age_group_id = p_age_group_id;

  select coalesce(array_agg(g.id order by g.created_at asc, g.id asc), '{}'::uuid[])
    into v_game_ids
  from public.games g
  where g.age_group_id = p_age_group_id
     or (
       coalesce(array_length(v_team_ids, 1), 0) > 0
       and g.team_id = any(v_team_ids)
     );

  select coalesce(array_agg(ts.id order by ts.created_at asc, ts.id asc), '{}'::uuid[])
    into v_training_session_ids
  from public.training_sessions ts
  where ts.age_group_id = p_age_group_id
     or (
       coalesce(array_length(v_team_ids, 1), 0) > 0
       and ts.team_id = any(v_team_ids)
     );

  select coalesce(array_agg(c.id order by c.created_at asc, c.id asc), '{}'::uuid[])
    into v_competition_ids
  from public.competitions c
  where coalesce(array_length(v_team_ids, 1), 0) > 0
    and c.team_id = any(v_team_ids);

  select coalesce(array_agg(c.id order by c.created_at asc, c.id asc), '{}'::uuid[])
    into v_convocation_ids
  from public.convocations c
  where coalesce(array_length(v_game_ids, 1), 0) > 0
    and c.game_id = any(v_game_ids);

  select coalesce(array_agg(p.id order by p.created_at asc, p.id asc), '{}'::uuid[])
    into v_player_ids
  from public.players p
  where p.age_group_id = p_age_group_id;

  select coalesce(
    array_agg(distinct profile_id),
    '{}'::uuid[]
  )
    into v_candidate_profile_ids
  from (
    select v_age_group.coordinator_id as profile_id
    where v_age_group.coordinator_id is not null

    union

    select ags.profile_id
    from public.age_group_staff ags
    where ags.age_group_id = p_age_group_id
  ) q;

  perform public.update_rows_club_id_by_ids('teams', 'id', v_team_ids, v_new_club_id);
  perform public.update_rows_club_id_by_age_group('age_group_staff', p_age_group_id, v_new_club_id);
  perform public.update_rows_club_id_by_ids('team_staff', 'team_id', v_team_ids, v_new_club_id);
  perform public.update_rows_club_id_by_age_group('players', p_age_group_id, v_new_club_id);
  perform public.update_rows_club_id_by_ids(
    'training_sessions',
    'id',
    v_training_session_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids('games', 'id', v_game_ids, v_new_club_id);
  perform public.update_rows_club_id_by_ids(
    'competitions',
    'id',
    v_competition_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_age_group('staff_invites', p_age_group_id, v_new_club_id);
  perform public.update_rows_club_id_by_ids('kit_pieces', 'team_id', v_team_ids, v_new_club_id);
  perform public.update_rows_club_id_by_ids(
    'convocations',
    'game_id',
    v_game_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids(
    'convocation_players',
    'convocation_id',
    v_convocation_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids('game_events', 'game_id', v_game_ids, v_new_club_id);
  perform public.update_rows_club_id_by_ids(
    'game_stats_live',
    'game_id',
    v_game_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids(
    'game_final_stats',
    'game_id',
    v_game_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids(
    'game_live_checkpoints',
    'game_id',
    v_game_ids,
    v_new_club_id
  );
  perform public.update_rows_club_id_by_ids(
    'external_player_convocations',
    'game_id',
    v_game_ids,
    v_new_club_id
  );

  if to_regclass('public.team_messages') is not null and public.table_has_column('team_messages', 'club_id') then
    update public.team_messages tm
    set club_id = v_new_club_id
    where tm.age_group_id = p_age_group_id
       or (
         coalesce(array_length(v_team_ids, 1), 0) > 0
         and tm.team_id = any(v_team_ids)
       );
  end if;

  if to_regclass('public.notifications') is not null and public.table_has_column('notifications', 'club_id') then
    update public.notifications n
    set club_id = v_new_club_id
    where n.age_group_id = p_age_group_id
       or (
         coalesce(array_length(v_team_ids, 1), 0) > 0
         and n.team_id = any(v_team_ids)
       );
  end if;

  if public.table_has_column('training_attendance', 'training_session_id') then
    perform public.update_rows_club_id_by_ids(
      'training_attendance',
      'training_session_id',
      v_training_session_ids,
      v_new_club_id
    );
  elsif public.table_has_column('training_attendance', 'session_id') then
    perform public.update_rows_club_id_by_ids(
      'training_attendance',
      'session_id',
      v_training_session_ids,
      v_new_club_id
    );
  elsif public.table_has_column('training_attendance', 'training_id') then
    perform public.update_rows_club_id_by_ids(
      'training_attendance',
      'training_id',
      v_training_session_ids,
      v_new_club_id
    );
  end if;

  if public.table_has_column('attendance_records', 'training_session_id') then
    perform public.update_rows_club_id_by_ids(
      'attendance_records',
      'training_session_id',
      v_training_session_ids,
      v_new_club_id
    );
  elsif public.table_has_column('attendance_records', 'session_id') then
    perform public.update_rows_club_id_by_ids(
      'attendance_records',
      'session_id',
      v_training_session_ids,
      v_new_club_id
    );
  elsif public.table_has_column('attendance_records', 'training_id') then
    perform public.update_rows_club_id_by_ids(
      'attendance_records',
      'training_id',
      v_training_session_ids,
      v_new_club_id
    );
  end if;

  if public.table_has_column('pse_records', 'game_id') then
    perform public.update_rows_club_id_by_ids(
      'pse_records',
      'game_id',
      v_game_ids,
      v_new_club_id
    );
  end if;
  if public.table_has_column('pse_records', 'training_session_id') then
    perform public.update_rows_club_id_by_ids(
      'pse_records',
      'training_session_id',
      v_training_session_ids,
      v_new_club_id
    );
  end if;
  if public.table_has_column('pse_records', 'session_id') then
    perform public.update_rows_club_id_by_ids(
      'pse_records',
      'session_id',
      v_training_session_ids,
      v_new_club_id
    );
  end if;
  if public.table_has_column('pse_records', 'training_id') then
    perform public.update_rows_club_id_by_ids(
      'pse_records',
      'training_id',
      v_training_session_ids,
      v_new_club_id
    );
  end if;
  if public.table_has_column('pse_records', 'player_id') then
    perform public.update_rows_club_id_by_ids(
      'pse_records',
      'player_id',
      v_player_ids,
      v_new_club_id
    );
  end if;

  foreach v_profile_id in array v_candidate_profile_ids loop
    perform public.repair_club_membership_state(v_new_club_id, v_profile_id);
    if v_old_club_id is not null and v_old_club_id is distinct from v_new_club_id then
      perform public.repair_club_membership_state(v_old_club_id, v_profile_id);
    end if;
  end loop;

  v_after := public.age_group_subtree_summary(p_age_group_id);

  insert into public.age_group_club_rehome_audit (
    age_group_id,
    coordinator_id,
    old_club_id,
    new_club_id,
    old_club_slug,
    new_club_slug,
    before_summary,
    after_summary,
    executed_at
  )
  values (
    p_age_group_id,
    v_age_group.coordinator_id,
    v_old_club_id,
    v_new_club_id,
    v_old_club_slug,
    v_new_club_slug,
    v_before,
    v_after,
    now()
  )
  on conflict (age_group_id) do update
    set coordinator_id = excluded.coordinator_id,
        old_club_id = excluded.old_club_id,
        new_club_id = excluded.new_club_id,
        old_club_slug = excluded.old_club_slug,
        new_club_slug = excluded.new_club_slug,
        before_summary = excluded.before_summary,
        after_summary = excluded.after_summary,
        executed_at = excluded.executed_at;

  return jsonb_build_object(
    'age_group_id', p_age_group_id,
    'old_club_id', v_old_club_id,
    'new_club_id', v_new_club_id,
    'old_club_slug', v_old_club_slug,
    'new_club_slug', v_new_club_slug,
    'before_summary', v_before,
    'after_summary', v_after
  );
end;
$$;


ALTER FUNCTION "public"."rehome_age_group_to_dedicated_technical_club"("p_age_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."repair_club_membership_state"("p_club_id" "uuid", "p_profile_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_coordinator boolean := false;
  v_is_staff boolean := false;
BEGIN
  IF p_club_id IS NULL OR p_profile_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.age_groups ag
    WHERE ag.club_id = p_club_id
      AND ag.coordinator_id = p_profile_id
  )
  INTO v_is_coordinator;

  SELECT EXISTS (
    SELECT 1
    FROM public.age_group_staff ags
    WHERE ags.club_id = p_club_id
      AND ags.profile_id = p_profile_id
  )
  INTO v_is_staff;

  IF v_is_coordinator THEN
    INSERT INTO public.club_memberships (club_id, profile_id, role)
    VALUES (p_club_id, p_profile_id, 'club_coordinator')
    ON CONFLICT (club_id, profile_id)
    DO UPDATE SET role =
      CASE
        WHEN public.club_memberships.role IN ('owner', 'admin') THEN public.club_memberships.role
        ELSE 'club_coordinator'
      END;
    RETURN;
  END IF;

  IF v_is_staff THEN
    INSERT INTO public.club_memberships (club_id, profile_id, role)
    VALUES (p_club_id, p_profile_id, 'staff')
    ON CONFLICT (club_id, profile_id)
    DO UPDATE SET role =
      CASE
        WHEN public.club_memberships.role IN ('owner', 'admin', 'club_coordinator') THEN public.club_memberships.role
        ELSE 'staff'
      END;
    RETURN;
  END IF;

  -- Não é coordinator nem staff: remover membership residual
  DELETE FROM public.club_memberships
  WHERE club_id = p_club_id
    AND profile_id = p_profile_id
    AND role NOT IN ('owner', 'admin', 'club_coordinator');
END;
$$;


ALTER FUNCTION "public"."repair_club_membership_state"("p_club_id" "uuid", "p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_age_group_primary_team_id"("p_age_group_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select t.id
  from public.teams t
  where t.age_group_id = p_age_group_id
  order by t.created_at asc nulls last, t.id asc
  limit 1;
$$;


ALTER FUNCTION "public"."resolve_age_group_primary_team_id"("p_age_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_attendance_today_get"("p_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_date date := coalesce(p_date, current_date);
  v_age_group_id uuid;
  v_age_group_name text;
  v_age_group_club_name text;
  v_age_group_logo_url text;
  v_team_id uuid;
  v_players jsonb := '[]'::jsonb;
  v_session jsonb := null;
  v_attendance_default jsonb := '{}'::jsonb;
  v_attendance_saved jsonb := '{}'::jsonb;
  v_attendance jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_authenticated');
  end if;

  select ag.id, ag.name, ag.club_name, ag.club_logo_url
    into v_age_group_id, v_age_group_name, v_age_group_club_name, v_age_group_logo_url
  from public.age_groups ag
  where ag.coordinator_id = v_user_id
  order by ag.created_at asc nulls last, ag.id asc
  limit 1;

  if v_age_group_id is not null then
    select t.id
      into v_team_id
    from public.teams t
    where t.age_group_id = v_age_group_id
    order by t.created_at asc nulls last, t.id asc
    limit 1;
  else
    select
      ag.id,
      ag.name,
      ag.club_name,
      ag.club_logo_url,
      coalesce(
        ags.linked_team_id,
        (
          select t.id
          from public.teams t
          where t.age_group_id = ag.id
          order by t.created_at asc nulls last, t.id asc
          limit 1
        )
      )
    into
      v_age_group_id,
      v_age_group_name,
      v_age_group_club_name,
      v_age_group_logo_url,
      v_team_id
    from public.age_group_staff ags
    join public.age_groups ag
      on ag.id = ags.age_group_id
    where ags.profile_id = v_user_id
    order by ags.created_at asc nulls last, ags.id asc
    limit 1;
  end if;

  if v_age_group_id is null then
    return jsonb_build_object(
      'success', true,
      'linked', false,
      'noSession', true,
      'ageGroup', null,
      'players', jsonb_build_array(),
      'session', null,
      'attendance', jsonb_build_object()
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.first_name asc, p.last_name asc), '[]'::jsonb)
    into v_players
  from public.players p
  where p.age_group_id = v_age_group_id
    and p.status = 'active';

  select to_jsonb(s)
    into v_session
  from (
    select
      ts.id,
      ts.age_group_id,
      ts.team_id,
      ts.session_date,
      ts.start_time,
      ts.end_time,
      ts.status,
      ts.created_at
    from public.training_sessions ts
    where ts.session_date = v_date
      and (
        (v_team_id is not null and ts.team_id = v_team_id)
        or (v_team_id is null and ts.age_group_id = v_age_group_id)
      )
    order by
      case when ts.status <> 'completed' then 0 else 1 end,
      ts.start_time asc nulls last,
      ts.created_at asc
    limit 1
  ) s;

  select coalesce(
    jsonb_object_agg(
      p_elem ->> 'id',
      to_jsonb('present'::text)
    ),
    '{}'::jsonb
  )
  into v_attendance_default
  from jsonb_array_elements(v_players) p_elem;

  if v_session is null then
    return jsonb_build_object(
      'success', true,
      'linked', true,
      'noSession', true,
      'date', to_char(v_date, 'YYYY-MM-DD'),
      'ageGroup', jsonb_build_object(
        'id', v_age_group_id,
        'name', v_age_group_name,
        'club_name', v_age_group_club_name,
        'club_logo_url', v_age_group_logo_url
      ),
      'players', v_players,
      'session', null,
      'attendance', v_attendance_default
    );
  end if;

  select coalesce(
    jsonb_object_agg(ta.player_id::text, to_jsonb(ta.status)),
    '{}'::jsonb
  )
  into v_attendance_saved
  from public.training_attendance ta
  where ta.training_session_id = (v_session ->> 'id')::uuid
    and ta.status in ('present', 'late', 'absent', 'injured');

  v_attendance := v_attendance_default || v_attendance_saved;

  return jsonb_build_object(
    'success', true,
    'linked', true,
    'noSession', false,
    'date', to_char(v_date, 'YYYY-MM-DD'),
    'ageGroup', jsonb_build_object(
      'id', v_age_group_id,
      'name', v_age_group_name,
      'club_name', v_age_group_club_name,
      'club_logo_url', v_age_group_logo_url
    ),
    'players', v_players,
    'session', v_session,
    'attendance', v_attendance,
    'attendanceTable', 'training_attendance'
  );
end;
$$;


ALTER FUNCTION "public"."rpc_attendance_today_get"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_attendance_today_save"("p_session_id" "uuid", "p_attendance" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_session_age_group_id uuid;
  v_session_status text;
  v_is_coordinator boolean := false;
  v_has_access boolean := false;
  v_saved_count integer := 0;
  v_has_invalid_player boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_authenticated');
  end if;

  if p_session_id is null or p_attendance is null or jsonb_typeof(p_attendance) <> 'object' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_payload');
  end if;

  select ts.age_group_id, ts.status
    into v_session_age_group_id, v_session_status
  from public.training_sessions ts
  where ts.id = p_session_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'session_not_found');
  end if;

  v_is_coordinator := public.user_is_training_session_coordinator(p_session_id);
  v_has_access := public.user_can_access_training_session_v2(p_session_id);

  if not v_has_access then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  if v_session_status = 'completed' and not v_is_coordinator then
    return jsonb_build_object('ok', false, 'error_code', 'closed_requires_coordinator');
  end if;

  with entries as (
    select key as player_id_text, value as status
    from jsonb_each_text(p_attendance)
    where value in ('present', 'late', 'absent', 'injured')
  )
  select count(*)::integer
    into v_saved_count
  from entries;

  if v_saved_count = 0 then
    return jsonb_build_object('ok', false, 'error_code', 'no_valid_entries');
  end if;

  if v_session_age_group_id is not null then
    with entries as (
      select key as player_id_text, value as status
      from jsonb_each_text(p_attendance)
      where value in ('present', 'late', 'absent', 'injured')
    )
    select exists (
      select 1
      from entries e
      left join public.players p
        on p.id::text = e.player_id_text
       and p.age_group_id = v_session_age_group_id
      where p.id is null
    )
    into v_has_invalid_player;

    if v_has_invalid_player then
      return jsonb_build_object('ok', false, 'error_code', 'invalid_players');
    end if;
  end if;

  begin
    with entries as (
      select key as player_id_text, value as status
      from jsonb_each_text(p_attendance)
      where value in ('present', 'late', 'absent', 'injured')
    ),
    rows_to_save as (
      select
        p_session_id as training_session_id,
        p.id as player_id,
        e.status,
        v_user_id as marked_by,
        now() as marked_at
      from entries e
      join public.players p on p.id::text = e.player_id_text
    )
    insert into public.training_attendance (
      training_session_id,
      player_id,
      status,
      marked_by,
      marked_at
    )
    select
      r.training_session_id,
      r.player_id,
      r.status,
      r.marked_by,
      r.marked_at
    from rows_to_save r
    on conflict (training_session_id, player_id)
    do update
      set
        status = excluded.status,
        marked_by = excluded.marked_by,
        marked_at = excluded.marked_at;
  exception
    when sqlstate '42P10' then
      delete from public.training_attendance ta
      where ta.training_session_id = p_session_id;

      with entries as (
        select key as player_id_text, value as status
        from jsonb_each_text(p_attendance)
        where value in ('present', 'late', 'absent', 'injured')
      ),
      rows_to_save as (
        select
          p_session_id as training_session_id,
          p.id as player_id,
          e.status,
          v_user_id as marked_by,
          now() as marked_at
        from entries e
        join public.players p on p.id::text = e.player_id_text
      )
      insert into public.training_attendance (
        training_session_id,
        player_id,
        status,
        marked_by,
        marked_at
      )
      select
        r.training_session_id,
        r.player_id,
        r.status,
        r.marked_by,
        r.marked_at
      from rows_to_save r;
  end;

  update public.training_sessions
  set status = 'completed'
  where id = p_session_id;

  return jsonb_build_object(
    'ok', true,
    'sessionId', p_session_id,
    'attendanceTable', 'training_attendance',
    'savedCount', v_saved_count
  );
end;
$$;


ALTER FUNCTION "public"."rpc_attendance_today_save"("p_session_id" "uuid", "p_attendance" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_attendance_today_save"("p_session_id" "uuid", "p_attendance" "jsonb", "p_finalize" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_session_age_group_id uuid;
  v_session_team_id uuid;
  v_effective_age_group_id uuid;
  v_session_status text;
  v_session_date date;
  v_session_start_time time;
  v_session_end_time time;
  v_now_local timestamp := timezone('Europe/Lisbon', now());
  v_effective_end_at timestamp;
  v_is_coordinator boolean := false;
  v_has_access boolean := false;
  v_saved_count integer := 0;
  v_has_invalid_player boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_authenticated');
  end if;

  if p_session_id is null or p_attendance is null or jsonb_typeof(p_attendance) <> 'object' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_payload');
  end if;

  select ts.age_group_id, ts.team_id, ts.status, ts.session_date, ts.start_time, ts.end_time
    into
      v_session_age_group_id,
      v_session_team_id,
      v_session_status,
      v_session_date,
      v_session_start_time,
      v_session_end_time
  from public.training_sessions ts
  where ts.id = p_session_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'session_not_found');
  end if;

  v_effective_age_group_id := v_session_age_group_id;

  if v_effective_age_group_id is null and v_session_team_id is not null then
    select t.age_group_id
      into v_effective_age_group_id
    from public.teams t
    where t.id = v_session_team_id
    limit 1;
  end if;

  if v_effective_age_group_id is not null then
    select public.user_can_manage_age_group_v2(v_effective_age_group_id)
      into v_is_coordinator;
  end if;

  select public.user_can_access_training_session_v2(p_session_id)
    into v_has_access;

  if not v_has_access then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  if v_session_status = 'completed' and not v_is_coordinator then
    return jsonb_build_object('ok', false, 'error_code', 'closed_requires_coordinator');
  end if;

  if p_finalize and v_session_status <> 'completed' then
    v_effective_end_at := v_session_date + coalesce(
      v_session_end_time,
      (v_session_start_time + interval '3 hours')::time
    );

    if v_effective_end_at is null or v_now_local < v_effective_end_at then
      return jsonb_build_object('ok', false, 'error_code', 'finalize_before_end');
    end if;
  end if;

  with entries as (
    select key as player_id_text, value as status
    from jsonb_each_text(p_attendance)
    where value in ('present', 'late', 'absent', 'injured')
  )
  select count(*)::integer
    into v_saved_count
  from entries;

  if v_saved_count = 0 then
    return jsonb_build_object('ok', false, 'error_code', 'no_valid_entries');
  end if;

  if v_effective_age_group_id is not null then
    with entries as (
      select key as player_id_text, value as status
      from jsonb_each_text(p_attendance)
      where value in ('present', 'late', 'absent', 'injured')
    )
    select exists (
      select 1
      from entries e
      left join public.players p
        on p.id::text = e.player_id_text
       and p.age_group_id = v_effective_age_group_id
      where p.id is null
    )
    into v_has_invalid_player;

    if v_has_invalid_player then
      return jsonb_build_object('ok', false, 'error_code', 'invalid_players');
    end if;
  end if;

  begin
    with entries as (
      select key as player_id_text, value as status
      from jsonb_each_text(p_attendance)
      where value in ('present', 'late', 'absent', 'injured')
    ),
    rows_to_save as (
      select
        p_session_id as training_session_id,
        p.id as player_id,
        e.status,
        v_user_id as marked_by,
        now() as marked_at
      from entries e
      join public.players p on p.id::text = e.player_id_text
    )
    insert into public.training_attendance (
      training_session_id,
      player_id,
      status,
      marked_by,
      marked_at
    )
    select
      r.training_session_id,
      r.player_id,
      r.status,
      r.marked_by,
      r.marked_at
    from rows_to_save r
    on conflict (training_session_id, player_id)
    do update
      set
        status = excluded.status,
        marked_by = excluded.marked_by,
        marked_at = excluded.marked_at;
  exception
    when sqlstate '42P10' then
      delete from public.training_attendance ta
      where ta.training_session_id = p_session_id;

      with entries as (
        select key as player_id_text, value as status
        from jsonb_each_text(p_attendance)
        where value in ('present', 'late', 'absent', 'injured')
      ),
      rows_to_save as (
        select
          p_session_id as training_session_id,
          p.id as player_id,
          e.status,
          v_user_id as marked_by,
          now() as marked_at
        from entries e
        join public.players p on p.id::text = e.player_id_text
      )
      insert into public.training_attendance (
        training_session_id,
        player_id,
        status,
        marked_by,
        marked_at
      )
      select
        r.training_session_id,
        r.player_id,
        r.status,
        r.marked_by,
        r.marked_at
      from rows_to_save r;
  end;

  if p_finalize and v_session_status <> 'completed' then
    update public.training_sessions
    set status = 'completed'
    where id = p_session_id;

    v_session_status := 'completed';
  end if;

  return jsonb_build_object(
    'ok', true,
    'sessionId', p_session_id,
    'attendanceTable', 'training_attendance',
    'savedCount', v_saved_count,
    'sessionStatus', v_session_status
  );
end;
$$;


ALTER FUNCTION "public"."rpc_attendance_today_save"("p_session_id" "uuid", "p_attendance" "jsonb", "p_finalize" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_correct_initial_lineup"("p_game_id" "uuid", "p_corrections" "jsonb", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_corrections_count integer := 0;
  v_club_id uuid;
  v_squad_record record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.user_is_game_coordinator(p_game_id) THEN
    RAISE EXCEPTION 'Apenas Coordenadores podem corrigir lineup retroactivamente';
  END IF;

  IF p_corrections IS NULL
     OR jsonb_typeof(p_corrections) <> 'array'
     OR jsonb_array_length(p_corrections) = 0 THEN
    RAISE EXCEPTION 'p_corrections inválido (esperado array não-vazio)';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Razão obrigatória (mínimo 5 caracteres)';
  END IF;

  SELECT ag.club_id INTO v_club_id
  FROM public.games g
  LEFT JOIN public.age_groups ag ON ag.id = g.age_group_id
  WHERE g.id = p_game_id;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  -- Bypass do trigger de imutabilidade nesta transaccao apenas.
  SET LOCAL session_replication_role = 'replica';

  FOR v_squad_record IN
    SELECT
      (correction->>'game_squad_id')::uuid AS squad_id,
      correction->>'new_status' AS new_status,
      gs.initial_lineup_status AS old_status,
      gs.player_id AS player_id
    FROM jsonb_array_elements(p_corrections) AS correction
    JOIN public.game_squads gs
      ON gs.id = (correction->>'game_squad_id')::uuid
    WHERE gs.game_id = p_game_id
      AND (correction->>'new_status') IN ('starter', 'substitute')
      AND gs.initial_lineup_status IS DISTINCT FROM (correction->>'new_status')
  LOOP
    INSERT INTO public.lineup_corrections_log (
      game_id,
      player_id,
      game_squad_id,
      old_status,
      new_status,
      corrected_by,
      reason,
      club_id
    ) VALUES (
      p_game_id,
      v_squad_record.player_id,
      v_squad_record.squad_id,
      v_squad_record.old_status,
      v_squad_record.new_status,
      v_user_id,
      p_reason,
      v_club_id
    );

    UPDATE public.game_squads
    SET initial_lineup_status = v_squad_record.new_status
    WHERE id = v_squad_record.squad_id;

    v_corrections_count := v_corrections_count + 1;
  END LOOP;

  -- session_replication_role volta automaticamente no fim da transaccao
  -- (SET LOCAL), mas restauramos explicitamente para clareza.
  SET LOCAL session_replication_role = 'origin';

  RETURN jsonb_build_object(
    'correctionsApplied', v_corrections_count
  );
END;
$$;


ALTER FUNCTION "public"."rpc_correct_initial_lineup"("p_game_id" "uuid", "p_corrections" "jsonb", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_finalize_game"("p_game_id" "uuid", "p_final_stats" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer DEFAULT NULL::integer, "p_updated_by" "uuid" DEFAULT NULL::"uuid", "p_sync_initial_lineup" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_now timestamptz := now();
  v_inserted_rows integer := 0;
  v_squads_synced integer := 0;
  v_base_seconds integer := 0;
  v_current_status text;
BEGIN
  IF p_game_id IS NULL THEN
    RAISE EXCEPTION 'p_game_id é obrigatório';
  END IF;

  IF p_final_stats IS NULL OR jsonb_typeof(p_final_stats) <> 'array' THEN
    RAISE EXCEPTION 'p_final_stats inválido (esperado array json)';
  END IF;

  IF p_score_home IS NULL OR p_score_away IS NULL THEN
    RAISE EXCEPTION 'score final inválido';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  PERFORM 1
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jogo não encontrado';
  END IF;

  DELETE FROM public.game_final_stats
  WHERE game_id = p_game_id;

  INSERT INTO public.game_final_stats (
    game_id,
    player_id,
    lineup_type,
    minutes_played,
    goals,
    own_goals,
    assists,
    yellow_cards,
    red_cards,
    coach_rating,
    notes,
    is_mvp,
    is_finalized,
    finalized_at,
    edited_manually
  )
  SELECT
    p_game_id,
    r.player_id,
    r.lineup_type,
    GREATEST(0, COALESCE(r.minutes_played, 0)),
    GREATEST(0, COALESCE(r.goals, 0)),
    GREATEST(0, COALESCE(r.own_goals, 0)),
    GREATEST(0, COALESCE(r.assists, 0)),
    GREATEST(0, COALESCE(r.yellow_cards, 0)),
    GREATEST(0, COALESCE(r.red_cards, 0)),
    CASE
      WHEN r.coach_rating IS NULL THEN NULL
      WHEN r.coach_rating < 0 THEN 0
      WHEN r.coach_rating > 10 THEN 10
      ELSE r.coach_rating
    END,
    NULLIF(TRIM(COALESCE(r.notes, '')), ''),
    COALESCE(r.is_mvp, false),
    COALESCE(r.is_finalized, true),
    COALESCE(r.finalized_at, v_now),
    COALESCE(r.edited_manually, false)
  FROM jsonb_to_recordset(p_final_stats) AS r(
    player_id uuid,
    lineup_type text,
    minutes_played integer,
    goals integer,
    own_goals integer,
    assists integer,
    yellow_cards integer,
    red_cards integer,
    coach_rating numeric,
    notes text,
    is_mvp boolean,
    is_finalized boolean,
    finalized_at timestamptz,
    edited_manually boolean
  );

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  -- Sincronizacao condicionada (Sprint 1.6 fix): recalculate passa false
  -- para evitar trigger de imutabilidade em jogos ja completed.
  IF p_sync_initial_lineup THEN
    UPDATE public.game_squads gs
    SET initial_lineup_status = r.lineup_type
    FROM jsonb_to_recordset(p_final_stats) AS r(
      player_id uuid,
      lineup_type text
    )
    WHERE gs.game_id = p_game_id
      AND gs.player_id = r.player_id
      AND r.lineup_type IN ('starter', 'substitute')
      AND gs.initial_lineup_status IS DISTINCT FROM r.lineup_type;

    GET DIAGNOSTICS v_squads_synced = ROW_COUNT;
  END IF;

  SELECT status INTO v_current_status
  FROM public.games
  WHERE id = p_game_id;

  UPDATE public.games
  SET
    status = CASE
      WHEN v_current_status IN ('cancelled', 'postponed') THEN v_current_status
      ELSE 'completed'
    END,
    score_home = GREATEST(0, p_score_home),
    score_away = GREATEST(0, p_score_away)
  WHERE id = p_game_id;

  IF p_final_minute IS NOT NULL THEN
    v_base_seconds := GREATEST(0, (GREATEST(1, p_final_minute) - 1) * 60);
  ELSE
    SELECT COALESCE(MAX(GREATEST(0, COALESCE(minutes_played, 0)) * 60), 0)
      INTO v_base_seconds
    FROM public.game_final_stats
    WHERE game_id = p_game_id;
  END IF;

  INSERT INTO public.game_live_checkpoints (
    game_id,
    phase,
    base_seconds,
    running_since_ms,
    updated_at,
    updated_by
  )
  VALUES (
    p_game_id,
    'completed',
    v_base_seconds,
    NULL,
    v_now,
    p_updated_by
  )
  ON CONFLICT (game_id)
  DO UPDATE
    SET
      phase = excluded.phase,
      base_seconds = excluded.base_seconds,
      running_since_ms = excluded.running_since_ms,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  RETURN jsonb_build_object(
    'insertedRows', v_inserted_rows,
    'squadsSynced', v_squads_synced,
    'baseSeconds', v_base_seconds
  );
END;
$$;


ALTER FUNCTION "public"."rpc_finalize_game"("p_game_id" "uuid", "p_final_stats" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid", "p_sync_initial_lineup" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_finalize_game_auth"("p_game_id" "uuid", "p_final_stats" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer DEFAULT NULL::integer, "p_updated_by" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_auth_user uuid := auth.uid();
  v_effective_updated_by uuid;
begin
  if v_auth_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not public.game_exists(p_game_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if not public.user_can_write_game(p_game_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and coalesce(g.status, 'scheduled') = 'completed'
  ) and not public.user_is_game_coordinator(p_game_id) then
    raise exception 'completed_requires_coordinator' using errcode = '42501';
  end if;

  v_effective_updated_by := coalesce(p_updated_by, v_auth_user);
  if v_effective_updated_by <> v_auth_user then
    raise exception 'updated_by_mismatch' using errcode = '42501';
  end if;

  return public.rpc_finalize_game(
    p_game_id,
    p_final_stats,
    p_score_home,
    p_score_away,
    p_final_minute,
    v_effective_updated_by
  );
end;
$$;


ALTER FUNCTION "public"."rpc_finalize_game_auth"("p_game_id" "uuid", "p_final_stats" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_game_access_context"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_game record;
begin
  select
    g.id,
    g.status,
    g.team_id,
    g.age_group_id
  into v_game
  from public.games g
  where g.id = p_game_id
  limit 1;

  if v_game.id is null then
    return jsonb_build_object(
      'exists', false,
      'canAccess', false,
      'canWrite', false,
      'canWriteLive', false,
      'isCoordinator', false,
      'status', null,
      'teamId', null,
      'ageGroupId', null
    );
  end if;

  if v_uid is null then
    return jsonb_build_object(
      'exists', true,
      'canAccess', false,
      'canWrite', false,
      'canWriteLive', false,
      'isCoordinator', false,
      'status', v_game.status,
      'teamId', v_game.team_id,
      'ageGroupId', v_game.age_group_id
    );
  end if;

  return jsonb_build_object(
    'exists', true,
    'canAccess', public.user_can_access_game(p_game_id),
    'canWrite', public.user_can_write_game(p_game_id),
    'canWriteLive', public.user_can_write_live_game(p_game_id),
    'isCoordinator', public.user_is_game_coordinator(p_game_id),
    'status', v_game.status,
    'teamId', v_game.team_id,
    'ageGroupId', v_game.age_group_id
  );
end;
$$;


ALTER FUNCTION "public"."rpc_game_access_context"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_merge_opponents"("p_keep_id" "uuid", "p_delete_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_keep_club UUID;
  v_delete_club UUID;
  v_keep_age_group UUID;
  v_delete_age_group UUID;
  v_games_updated INTEGER;
BEGIN
  IF p_keep_id IS NULL OR p_delete_id IS NULL THEN
    RAISE EXCEPTION 'p_keep_id e p_delete_id sao obrigatorios';
  END IF;

  IF p_keep_id = p_delete_id THEN
    RAISE EXCEPTION 'p_keep_id e p_delete_id sao iguais';
  END IF;

  SELECT club_id, age_group_id INTO v_keep_club, v_keep_age_group
  FROM public.opponents WHERE id = p_keep_id;

  SELECT club_id, age_group_id INTO v_delete_club, v_delete_age_group
  FROM public.opponents WHERE id = p_delete_id;

  IF v_keep_club IS NULL OR v_delete_club IS NULL THEN
    RAISE EXCEPTION 'Adversario nao encontrado (keep=% delete=%)', p_keep_id, p_delete_id;
  END IF;

  IF v_keep_club <> v_delete_club THEN
    RAISE EXCEPTION 'Adversarios pertencem a clubes diferentes';
  END IF;

  IF v_keep_age_group <> v_delete_age_group THEN
    RAISE EXCEPTION 'Adversarios pertencem a escaloes diferentes';
  END IF;

  -- Migrar todos os jogos do delete para o keep
  UPDATE public.games
  SET opponent_id = p_keep_id
  WHERE opponent_id = p_delete_id;

  GET DIAGNOSTICS v_games_updated = ROW_COUNT;

  -- Apagar o duplicado (CASCADE em age_group/club nao se aplica)
  DELETE FROM public.opponents WHERE id = p_delete_id;

  RETURN jsonb_build_object(
    'success', true,
    'games_migrated', v_games_updated,
    'kept_id', p_keep_id,
    'deleted_id', p_delete_id
  );
END;
$$;


ALTER FUNCTION "public"."rpc_merge_opponents"("p_keep_id" "uuid", "p_delete_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_merge_opponents"("p_keep_id" "uuid", "p_delete_id" "uuid") IS 'Merge manual de adversarios duplicados. Migra todos os jogos do delete_id para keep_id e apaga o delete_id. Valida que ambos pertencem ao mesmo clube + escalao.';



CREATE OR REPLACE FUNCTION "public"."rpc_promote_observations"("p_opponent_id" "uuid", "p_observation_ids" "uuid"[], "p_target_field" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_appended text;
  v_existing text;
BEGIN
  IF p_target_field NOT IN ('pontos_fortes','pontos_fracos','atletas_chave','notas_gerais') THEN
    RAISE EXCEPTION 'Campo de destino inválido: %', p_target_field;
  END IF;

  IF array_length(p_observation_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhuma observação seleccionada';
  END IF;

  SELECT string_agg('- ' || observation, E'\n' ORDER BY created_at)
    INTO v_appended
  FROM game_opponent_observations
  WHERE id = ANY(p_observation_ids)
    AND opponent_id = p_opponent_id
    AND promoted_to_opponent_at IS NULL;

  IF v_appended IS NULL OR v_appended = '' THEN
    RAISE EXCEPTION 'Nenhuma observação válida para promover';
  END IF;

  EXECUTE format('SELECT %I FROM opponents WHERE id = $1', p_target_field)
    INTO v_existing USING p_opponent_id;

  EXECUTE format(
    'UPDATE opponents SET %I = CASE
        WHEN $1 IS NULL OR btrim($1) = '''' THEN $2
        ELSE $1 || E''\n'' || $2
      END,
      updated_at = now()
     WHERE id = $3',
    p_target_field
  ) USING v_existing, v_appended, p_opponent_id;

  UPDATE game_opponent_observations
  SET promoted_to_field = p_target_field,
      promoted_to_opponent_at = now(),
      promoted_by = auth.uid(),
      updated_at = now()
  WHERE id = ANY(p_observation_ids)
    AND opponent_id = p_opponent_id
    AND promoted_to_opponent_at IS NULL;
END;
$_$;


ALTER FUNCTION "public"."rpc_promote_observations"("p_opponent_id" "uuid", "p_observation_ids" "uuid"[], "p_target_field" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_recalculate_game_summary"("p_game_id" "uuid", "p_rows" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.rpc_finalize_game(
    p_game_id,
    p_rows,
    p_score_home,
    p_score_away,
    p_final_minute,
    p_updated_by,
    false
  );
END;
$$;


ALTER FUNCTION "public"."rpc_recalculate_game_summary"("p_game_id" "uuid", "p_rows" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_recalculate_game_summary_auth"("p_game_id" "uuid", "p_rows" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_auth_user uuid := auth.uid();
  v_effective_updated_by uuid;
  v_status text;
begin
  if v_auth_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not public.game_exists(p_game_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  -- Permissão: todo o staff do escalão.
  if not public.user_can_write_game(p_game_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Status: bloquear apenas 'live' (engine activo) e 'scheduled' (não jogado).
  -- Permite 'completed', 'cancelled', e qualquer outro estado terminal.
  select coalesce(g.status, 'scheduled')
    into v_status
  from public.games g
  where g.id = p_game_id;

  if v_status = 'live' then
    raise exception 'game_in_progress' using errcode = '22023';
  end if;

  if v_status = 'scheduled' then
    raise exception 'game_not_started' using errcode = '22023';
  end if;

  v_effective_updated_by := coalesce(p_updated_by, v_auth_user);
  if v_effective_updated_by <> v_auth_user then
    raise exception 'updated_by_mismatch' using errcode = '42501';
  end if;

  return public.rpc_recalculate_game_summary(
    p_game_id,
    p_rows,
    p_score_home,
    p_score_away,
    p_final_minute,
    v_effective_updated_by
  );
end;
$$;


ALTER FUNCTION "public"."rpc_recalculate_game_summary_auth"("p_game_id" "uuid", "p_rows" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_redeem_age_coordinator_invite"("p_invite_code" "text", "p_user_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code TEXT := upper(trim(coalesce(p_invite_code, '')));
  v_email TEXT := nullif(lower(trim(coalesce(p_user_email, ''))), '');
  v_invite public.staff_invites%ROWTYPE;
  v_age_group_id uuid;
  v_age_group_name text;
  v_age_group_club_name text;
  v_age_group_club_id uuid;
  v_profile_exists BOOLEAN;
  v_already_linked BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_code');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('redeem_age_coord:' || v_code, 0));

  SELECT si.* INTO v_invite
  FROM public.staff_invites si
  WHERE upper(trim(si.invite_code)) = v_code
  LIMIT 1
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invite_not_found');
  END IF;

  IF v_invite.role <> 'age_group_coordinator' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'not_age_coordinator_invite');
  END IF;

  IF v_invite.email IS NOT NULL
     AND v_email IS NOT NULL
     AND lower(trim(v_invite.email)) <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'email_mismatch');
  END IF;

  IF v_invite.accepted_at IS NOT NULL
     AND v_invite.accepted_by IS NOT NULL
     AND v_invite.accepted_by <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invite_used_by_other');
  END IF;

  IF v_invite.age_group_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'age_group_id_missing');
  END IF;

  SELECT ag.id, ag.name, ag.club_name, ag.club_id
    INTO v_age_group_id, v_age_group_name, v_age_group_club_name, v_age_group_club_id
  FROM public.age_groups ag
  WHERE ag.id = v_invite.age_group_id
  LIMIT 1;

  IF v_age_group_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'age_group_not_found');
  END IF;

  -- Garantir profile existe
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid)
  INTO v_profile_exists;

  IF NOT v_profile_exists THEN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
      v_uid,
      coalesce(
        nullif(trim(coalesce(v_invite.first_name, '') || ' ' || coalesce(v_invite.last_name, '')), ''),
        'Utilizador'
      ),
      'coordinator'
    );
  ELSE
    UPDATE public.profiles
    SET role = 'coordinator'
    WHERE id = v_uid AND role NOT IN ('coordinator', 'admin');
  END IF;

  -- CORRECÇÃO: NÃO alterar age_groups.coordinator_id.
  -- coordinator_id é o DONO do escalão (club_coordinator que o criou).
  -- O age_group_coordinator é uma função de staff — adicionado via age_group_staff.

  -- Adicionar entrada em age_group_staff com role 'age_group_coordinator'
  SELECT EXISTS (
    SELECT 1 FROM public.age_group_staff
    WHERE profile_id = v_uid AND age_group_id = v_invite.age_group_id
  ) INTO v_already_linked;

  IF NOT v_already_linked THEN
    INSERT INTO public.age_group_staff (
      age_group_id,
      club_id,
      profile_id,
      role
    )
    VALUES (
      v_invite.age_group_id,
      v_age_group_club_id,
      v_uid,
      'age_group_coordinator'
    )
    ON CONFLICT (profile_id, age_group_id) DO UPDATE
      SET role = 'age_group_coordinator';
  END IF;

  -- Adicionar a club_memberships como 'staff' (não 'coordinator')
  IF v_age_group_club_id IS NOT NULL THEN
    INSERT INTO public.club_memberships (club_id, profile_id, role)
    VALUES (v_age_group_club_id, v_uid, 'staff')
    ON CONFLICT (club_id, profile_id) DO NOTHING;
  END IF;

  -- Marcar convite como aceite
  UPDATE public.staff_invites
  SET accepted_at = now(),
      accepted_by = v_uid,
      status = 'accepted'
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_linked', v_already_linked,
    'role', 'age_group_coordinator',
    'age_group_name', v_age_group_name,
    'age_group_club_name', v_age_group_club_name
  );
END;
$$;


ALTER FUNCTION "public"."rpc_redeem_age_coordinator_invite"("p_invite_code" "text", "p_user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_redeem_club_coordinator_invite"("p_invite_code" "text", "p_user_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code TEXT := upper(trim(coalesce(p_invite_code, '')));
  v_email TEXT := nullif(lower(trim(coalesce(p_user_email, ''))), '');
  v_invite public.staff_invites%ROWTYPE;
  v_profile_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_code');
  END IF;

  -- Lock por código
  PERFORM pg_advisory_xact_lock(hashtextextended('redeem_club_coord:' || v_code, 0));

  -- Buscar convite
  SELECT si.* INTO v_invite
  FROM public.staff_invites si
  WHERE upper(trim(si.invite_code)) = v_code
  LIMIT 1
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invite_not_found');
  END IF;

  -- Verificar que é convite de coordenador de clube
  IF v_invite.role <> 'club_coordinator' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'not_coordinator_invite');
  END IF;

  -- Verificar email
  IF v_invite.email IS NOT NULL
     AND v_email IS NOT NULL
     AND lower(trim(v_invite.email)) <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'email_mismatch');
  END IF;

  -- Verificar se já foi aceite por outro user
  IF v_invite.accepted_at IS NOT NULL
     AND v_invite.accepted_by IS NOT NULL
     AND v_invite.accepted_by <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invite_used_by_other');
  END IF;

  IF v_invite.club_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'club_id_missing');
  END IF;

  -- Garantir profile existe
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid)
  INTO v_profile_exists;

  IF NOT v_profile_exists THEN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
      v_uid,
      coalesce(
        nullif(trim(coalesce(v_invite.first_name, '') || ' ' || coalesce(v_invite.last_name, '')), ''),
        'Utilizador'
      ),
      'coordinator'
    );
  ELSE
    -- Actualizar role para coordinator se ainda não for
    UPDATE public.profiles
    SET role = 'coordinator'
    WHERE id = v_uid AND role <> 'coordinator';
  END IF;

  -- Criar club_membership (idempotente)
  INSERT INTO public.club_memberships (club_id, profile_id, role)
  VALUES (v_invite.club_id, v_uid, 'club_coordinator')
  ON CONFLICT (club_id, profile_id) DO NOTHING;

  -- Marcar convite como aceite
  UPDATE public.staff_invites
  SET accepted_at = now(),
      accepted_by = v_uid,
      status = 'accepted'
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'ok', true,
    'role', 'club_coordinator',
    'club_id', v_invite.club_id
  );
END;
$$;


ALTER FUNCTION "public"."rpc_redeem_club_coordinator_invite"("p_invite_code" "text", "p_user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_redeem_staff_invite"("p_invite_code" "text", "p_user_id" "uuid", "p_user_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_code text := upper(trim(coalesce(p_invite_code, '')));
  v_user_email text := nullif(lower(trim(coalesce(p_user_email, ''))), '');
  v_invite public.staff_invites%rowtype;
  v_team_id uuid;
  v_invite_club_id uuid;
  v_age_group_name text;
  v_age_group_club_name text;
  v_profile_full_name text;
  v_profile_exists boolean := false;
  v_already_linked boolean := false;
  v_profile_role text;
  v_age_group_staff_id uuid;
  v_perm jsonb;
begin
  if p_user_id is null then
    raise exception 'p_user_id e obrigatorio';
  end if;

  if v_code = '' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_code');
  end if;

  -- Lock por codigo para evitar corrida concorrente no mesmo convite.
  perform pg_advisory_xact_lock(hashtextextended('redeem_staff_invite:' || v_code, 0));

  begin
    select si.*
      into v_invite
    from public.staff_invites si
    where upper(trim(si.invite_code)) = v_code
    limit 1
    for update;
  exception
    when others then
      return jsonb_build_object('ok', false, 'error_code', 'invite_lookup_failed');
  end;

  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'invite_not_found');
  end if;

  if v_invite.email is not null
     and v_user_email is not null
     and lower(trim(v_invite.email)) <> v_user_email then
    return jsonb_build_object('ok', false, 'error_code', 'email_mismatch');
  end if;

  if v_invite.accepted_at is not null
     and v_invite.accepted_by is not null
     and v_invite.accepted_by <> p_user_id
     and not (
       v_invite.email is not null
       and v_user_email is not null
       and lower(trim(v_invite.email)) = v_user_email
     ) then
    return jsonb_build_object('ok', false, 'error_code', 'invite_used_by_other');
  end if;

  v_invite_club_id := v_invite.club_id;

  if v_invite_club_id is null then
    select ag.club_id
      into v_invite_club_id
    from public.age_groups ag
    where ag.id = v_invite.age_group_id
    limit 1;
  end if;

  if public.profile_has_conflicting_age_group_membership(p_user_id, v_invite.age_group_id) then
    return jsonb_build_object('ok', false, 'error_code', 'cross_age_group_forbidden');
  end if;

  select ag.name, ag.club_name
    into v_age_group_name, v_age_group_club_name
  from public.age_groups ag
  where ag.id = v_invite.age_group_id
  limit 1;

  if v_age_group_name is null then
    return jsonb_build_object('ok', false, 'error_code', 'age_group_not_found');
  end if;

  select t.id
    into v_team_id
  from public.teams t
  where t.age_group_id = v_invite.age_group_id
  order by t.created_at asc nulls last, t.id asc
  limit 1;

  if v_team_id is null then
    begin
      insert into public.teams (
        age_group_id,
        name,
        is_competitive
      )
      values (
        v_invite.age_group_id,
        trim(coalesce(v_age_group_club_name, '') || ' ' || coalesce(v_age_group_name, '')),
        true
      )
      returning id into v_team_id;
    exception
      when others then
        return jsonb_build_object('ok', false, 'error_code', 'team_create_failed');
    end;
  end if;

  select p.full_name
    into v_profile_full_name
  from public.profiles p
  where p.id = p_user_id
  limit 1;

  v_profile_exists := found;

  -- Mapeia o role do convite para profiles.role correcto.
  -- club_coordinator → 'coordinator'; todos os outros roles de staff → 'coach'
  -- (staff_invites.role nunca contém 'coordinator' puro — constraint proíbe)
  v_profile_role := case
    when v_invite.role = 'club_coordinator' then 'coordinator'
    else 'coach'
  end;

  if not v_profile_exists then
    begin
      insert into public.profiles (
        id,
        full_name,
        role
      )
      values (
        p_user_id,
        coalesce(
          nullif(trim(coalesce(v_invite.first_name, '') || ' ' || coalesce(v_invite.last_name, '')), ''),
          nullif(split_part(coalesce(v_user_email, ''), '@', 1), ''),
          'Utilizador'
        ),
        v_profile_role
      );
    exception
      when others then
        update public.profiles
        set role = v_profile_role
        where id = p_user_id;
    end;
  else
    update public.profiles
    set role = v_profile_role
    where id = p_user_id;
  end if;

  if v_profile_exists
     and coalesce(nullif(trim(v_profile_full_name), ''), '') = ''
     and v_invite.first_name is not null then
    update public.profiles
    set full_name = nullif(
      trim(coalesce(v_invite.first_name, '') || ' ' || coalesce(v_invite.last_name, '')),
      ''
    )
    where id = p_user_id;
  end if;

  -- Verificar se já existe entrada em age_group_staff (idempotente)
  select exists (
    select 1
    from public.age_group_staff ags
    where ags.profile_id = p_user_id
      and ags.age_group_id = v_invite.age_group_id
  )
  into v_already_linked;

  if not v_already_linked then
    begin
      perform set_config('coach11.current_staff_invite_id', v_invite.id::text, true);

      -- CORRECÇÃO: inserir em age_group_staff (não team_staff)
      -- O dashboard e resolveUserTeamContext verificam age_group_staff.
      insert into public.age_group_staff (
        age_group_id,
        club_id,
        profile_id,
        linked_team_id,
        role
      )
      values (
        v_invite.age_group_id,
        coalesce(v_invite.club_id, v_invite_club_id),
        p_user_id,
        v_team_id,
        v_invite.role
      )
      returning id into v_age_group_staff_id;
    exception
      when unique_violation then
        v_already_linked := true;
      when others then
        if SQLERRM = 'technical_staff_limit_reached' then
          return jsonb_build_object('ok', false, 'error_code', 'technical_staff_limit_reached');
        end if;

        return jsonb_build_object('ok', false, 'error_code', 'team_staff_insert_failed');
    end;

    -- Aplicar permissões iniciais do convite (se definidas pelo coordenador)
    if v_age_group_staff_id is not null
       and v_invite.initial_permissions is not null
       and jsonb_typeof(v_invite.initial_permissions) = 'array'
       and jsonb_array_length(v_invite.initial_permissions) > 0 then
      for v_perm in select * from jsonb_array_elements(v_invite.initial_permissions) loop
        begin
          insert into public.staff_permissions (
            staff_id,
            area,
            can_read,
            can_write,
            can_edit,
            can_delete
          )
          values (
            v_age_group_staff_id,
            v_perm->>'area',
            true,
            coalesce((v_perm->>'can_write')::boolean, false),
            coalesce((v_perm->>'can_edit')::boolean, false),
            coalesce((v_perm->>'can_delete')::boolean, false)
          )
          on conflict (staff_id, area) do nothing;
        exception
          when others then
            null; -- Permissão inválida ignorada silenciosamente
        end;
      end loop;
    end if;
  end if;

  update public.staff_invites
  set
    accepted_at = now(),
    accepted_by = p_user_id,
    status = 'accepted'
  where id = v_invite.id;

  return jsonb_build_object(
    'ok', true,
    'already_linked', v_already_linked,
    'role', v_invite.role,
    'age_group_name', v_age_group_name,
    'age_group_club_name', v_age_group_club_name
  );
end;
$$;


ALTER FUNCTION "public"."rpc_redeem_staff_invite"("p_invite_code" "text", "p_user_id" "uuid", "p_user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_redeem_staff_invite_auth"("p_invite_code" "text", "p_user_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_claim_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_effective_email text := nullif(lower(trim(coalesce(p_user_email, v_claim_email, ''))), '');
  v_code text := upper(trim(coalesce(p_invite_code, '')));
  v_invite_age_group_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_code = '' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_code');
  end if;

  select si.age_group_id
    into v_invite_age_group_id
  from public.staff_invites si
  where upper(trim(si.invite_code)) = v_code
  limit 1;

  if v_invite_age_group_id is not null
     and public.profile_has_conflicting_age_group_membership(v_uid, v_invite_age_group_id) then
    return jsonb_build_object('ok', false, 'error_code', 'cross_age_group_forbidden');
  end if;

  return public.rpc_redeem_staff_invite(v_code, v_uid, v_effective_email);
end;
$$;


ALTER FUNCTION "public"."rpc_redeem_staff_invite_auth"("p_invite_code" "text", "p_user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_register_substitution"("p_game_id" "uuid", "p_squad_out_id" "uuid", "p_squad_in_id" "uuid", "p_minute" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_squad_out_exists INT;
  v_squad_in_exists INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_can_write_game(p_game_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_squad_out_exists FROM public.game_squads
   WHERE id = p_squad_out_id AND game_id = p_game_id;
  SELECT COUNT(*) INTO v_squad_in_exists FROM public.game_squads
   WHERE id = p_squad_in_id AND game_id = p_game_id;

  IF v_squad_out_exists = 0 OR v_squad_in_exists = 0 THEN
    RAISE EXCEPTION 'squad_not_found_in_game' USING ERRCODE = '22023';
  END IF;

  IF p_squad_out_id = p_squad_in_id THEN
    RAISE EXCEPTION 'sub_out_equals_sub_in' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.game_events (
    game_id, event_type, minute,
    game_squad_id, related_game_squad_id,
    is_opponent_event, created_at
  ) VALUES
    (p_game_id, 'substitution_out', p_minute, p_squad_out_id, p_squad_in_id, false, NOW()),
    (p_game_id, 'substitution_in',  p_minute, p_squad_in_id,  p_squad_out_id, false, NOW());

  RETURN jsonb_build_object(
    'success', true,
    'squad_out_id', p_squad_out_id,
    'squad_in_id', p_squad_in_id,
    'minute', p_minute
  );
END;
$$;


ALTER FUNCTION "public"."rpc_register_substitution"("p_game_id" "uuid", "p_squad_out_id" "uuid", "p_squad_in_id" "uuid", "p_minute" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_statistics_players"("p_age_group_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_has_access boolean := false;
  v_accessible_age_group_ids uuid[] := '{}'::uuid[];
  v_target_age_group_ids uuid[] := '{}'::uuid[];
  v_players jsonb := '[]'::jsonb;
  v_player_ids uuid[] := '{}'::uuid[];
  v_session_ids uuid[] := '{}'::uuid[];
  v_game_ids uuid[] := '{}'::uuid[];
  v_convocation_ids uuid[] := '{}'::uuid[];
  v_attendance_rows jsonb := '[]'::jsonb;
  v_final_stats jsonb := '[]'::jsonb;
  v_convocations jsonb := '[]'::jsonb;
  v_convocation_players jsonb := '[]'::jsonb;
  v_game_events jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_authenticated');
  end if;

  if p_age_group_id is null then
    select coalesce(array_agg(ag.id), '{}'::uuid[])
      into v_accessible_age_group_ids
    from public.age_groups ag
    where public.user_can_access_age_group_v2(ag.id);

    if cardinality(v_accessible_age_group_ids) = 0 then
      return jsonb_build_object(
        'ok', true,
        'players', '[]'::jsonb,
        'attendanceRows', '[]'::jsonb,
        'finalStats', '[]'::jsonb,
        'convocations', '[]'::jsonb,
        'convocationPlayers', '[]'::jsonb,
        'gameIds', '[]'::jsonb,
        'gameEvents', '[]'::jsonb
      );
    end if;

    v_target_age_group_ids := v_accessible_age_group_ids;
  else
    select public.user_can_access_age_group_v2(p_age_group_id)
      into v_has_access;

    if not v_has_access then
      return jsonb_build_object('ok', false, 'error_code', 'forbidden');
    end if;

    v_target_age_group_ids := array[p_age_group_id];
  end if;

  select
    coalesce(jsonb_agg(to_jsonb(p) order by p.first_name asc, p.last_name asc), '[]'::jsonb),
    coalesce(array_agg(p.id), '{}'::uuid[])
  into v_players, v_player_ids
  from public.players p
  where p.age_group_id = any(v_target_age_group_ids)
    and p.status = 'active';

  select coalesce(array_agg(ts.id), '{}'::uuid[])
    into v_session_ids
  from public.training_sessions ts
  where ts.age_group_id = any(v_target_age_group_ids);

  if cardinality(v_session_ids) > 0 and cardinality(v_player_ids) > 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'player_id', ta.player_id,
          'status', ta.status
        )
      ),
      '[]'::jsonb
    )
    into v_attendance_rows
    from public.training_attendance ta
    where ta.training_session_id = any(v_session_ids)
      and ta.player_id = any(v_player_ids);
  end if;

  if cardinality(v_player_ids) > 0 then
    select coalesce(
      jsonb_agg(to_jsonb(fs)),
      '[]'::jsonb
    )
    into v_final_stats
    from (
      select
        gfs.player_id,
        gfs.goals,
        gfs.own_goals,
        gfs.assists,
        gfs.minutes_played,
        gfs.lineup_type,
        gfs.yellow_cards,
        gfs.red_cards,
        gfs.coach_rating,
        gfs.is_mvp,
        gfs.is_finalized,
        gfs.game_id
      from public.game_final_stats gfs
      where gfs.player_id = any(v_player_ids)
        and gfs.is_finalized = true
    ) fs;
  end if;

  if cardinality(v_player_ids) > 0 then
    select coalesce(array_agg(distinct g.id), '{}'::uuid[])
      into v_game_ids
    from public.games g
    where (
      g.age_group_id = any(v_target_age_group_ids)
    )
      or exists (
        select 1
        from public.game_squads gs
        where gs.game_id = g.id
          and gs.player_id = any(v_player_ids)
      );
  end if;

  if cardinality(v_game_ids) > 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'game_id', c.game_id
        )
      ),
      '[]'::jsonb
    )
    into v_convocations
    from public.convocations c
    where c.game_id = any(v_game_ids);

    select coalesce(array_agg(c.id), '{}'::uuid[])
      into v_convocation_ids
    from public.convocations c
    where c.game_id = any(v_game_ids);

    if cardinality(v_convocation_ids) > 0 and cardinality(v_player_ids) > 0 then
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'player_id', cp.player_id,
            'convocation_id', cp.convocation_id
          )
        ),
        '[]'::jsonb
      )
      into v_convocation_players
      from public.convocation_players cp
      where cp.convocation_id = any(v_convocation_ids)
        and cp.player_id = any(v_player_ids);
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'game_id', ge.game_id,
          'player_id', ge.player_id,
          'event_type', ge.event_type,
          'is_opponent_event', ge.is_opponent_event
        )
      ),
      '[]'::jsonb
    )
    into v_game_events
    from public.game_events ge
    where ge.game_id = any(v_game_ids)
      and ge.event_type = any(array['goal', 'penalty_goal', 'own_goal']);
  end if;

  return jsonb_build_object(
    'ok', true,
    'players', v_players,
    'attendanceRows', v_attendance_rows,
    'finalStats', v_final_stats,
    'convocations', v_convocations,
    'convocationPlayers', v_convocation_players,
    'gameIds', to_jsonb(v_game_ids),
    'gameEvents', v_game_events
  );
end;
$$;


ALTER FUNCTION "public"."rpc_statistics_players"("p_age_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_training_session_access_context"("p_training_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session record;
begin
  select
    ts.id,
    ts.status,
    ts.team_id,
    ts.age_group_id,
    ts.club_id,
    ts.session_date,
    ts.start_time,
    ts.end_time
  into v_session
  from public.training_sessions ts
  where ts.id = p_training_session_id
  limit 1;

  if v_session.id is null then
    return jsonb_build_object(
      'exists', false,
      'canAccess', false,
      'isCoordinator', false,
      'status', null,
      'teamId', null,
      'ageGroupId', null,
      'clubId', null,
      'sessionDate', null,
      'startTime', null,
      'endTime', null
    );
  end if;

  if v_uid is null then
    return jsonb_build_object(
      'exists', true,
      'canAccess', false,
      'isCoordinator', false,
      'status', v_session.status,
      'teamId', v_session.team_id,
      'ageGroupId', v_session.age_group_id,
      'clubId', v_session.club_id,
      'sessionDate', v_session.session_date,
      'startTime', v_session.start_time,
      'endTime', v_session.end_time
    );
  end if;

  return jsonb_build_object(
    'exists', true,
    'canAccess', public.user_can_access_training_session_v2(p_training_session_id),
    'isCoordinator', public.user_is_training_session_coordinator(p_training_session_id),
    'status', v_session.status,
    'teamId', v_session.team_id,
    'ageGroupId', v_session.age_group_id,
    'clubId', v_session.club_id,
    'sessionDate', v_session.session_date,
    'startTime', v_session.start_time,
    'endTime', v_session.end_time
  );
end;
$$;


ALTER FUNCTION "public"."rpc_training_session_access_context"("p_training_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_update_game_tactical_auth"("p_game_id" "uuid", "p_tactical_system" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_game_exists boolean := false;
  v_has_access boolean := false;
  v_normalized_tactical text := nullif(trim(coalesce(p_tactical_system, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
  )
  into v_game_exists;

  if not v_game_exists then
    return jsonb_build_object('ok', false, 'error_code', 'game_not_found');
  end if;

  select public.user_can_write_game(p_game_id)
    into v_has_access;

  if not v_has_access then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  update public.games
  set additional_info = v_normalized_tactical
  where id = p_game_id;

  return jsonb_build_object('ok', true, 'tactical_system', v_normalized_tactical);
end;
$$;


ALTER FUNCTION "public"."rpc_update_game_tactical_auth"("p_game_id" "uuid", "p_tactical_system" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."season_objectives_assign_club_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_club_id uuid;
begin
  select ag.club_id
    into v_club_id
  from public.age_groups ag
  where ag.id = new.age_group_id;

  if v_club_id is null then
    raise exception 'season_objectives.age_group_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."season_objectives_assign_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_updated_at"() IS 'Atualiza automaticamente a coluna updated_at para now().';



CREATE OR REPLACE FUNCTION "public"."staff_permissions_assign_club_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_club_id uuid;
begin
  select ags.club_id
    into v_club_id
  from public.age_group_staff ags
  where ags.id = new.staff_id;

  if v_club_id is null then
    raise exception 'staff_permissions.staff_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."staff_permissions_assign_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_age_group_staff_to_team_staff"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_age_group_id uuid;
  v_profile_id uuid;
  v_keep_team_id uuid;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_age_group_id := old.age_group_id;
    v_profile_id := old.profile_id;
    v_keep_team_id := null;
  else
    if tg_op = 'UPDATE'
       and (
         old.age_group_id is distinct from new.age_group_id
         or old.profile_id is distinct from new.profile_id
       ) then
      delete from public.team_staff ts
      using public.teams t
      where ts.team_id = t.id
        and t.age_group_id = old.age_group_id
        and ts.profile_id = old.profile_id;
    end if;

    v_age_group_id := new.age_group_id;
    v_profile_id := new.profile_id;
    v_keep_team_id := coalesce(new.linked_team_id, public.resolve_age_group_primary_team_id(new.age_group_id));
  end if;

  delete from public.team_staff ts
  using public.teams t
  where ts.team_id = t.id
    and t.age_group_id = v_age_group_id
    and ts.profile_id = v_profile_id
    and (
      v_keep_team_id is null
      or ts.team_id is distinct from v_keep_team_id
    );

  if tg_op <> 'DELETE' and v_keep_team_id is not null then
    insert into public.team_staff (
      profile_id,
      team_id,
      club_id,
      role
    )
    values (
      new.profile_id,
      v_keep_team_id,
      new.club_id,
      new.role
    )
    on conflict (team_id, profile_id)
    do update set
      club_id = excluded.club_id,
      role = excluded.role;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_age_group_staff_to_team_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_club_id_from_age_group_ref"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_club_id uuid;
begin
  if new.age_group_id is null then
    if new.club_id is null then
      new.club_id := public.user_default_club_id();
    end if;
    if new.club_id is null then
      select c.id into new.club_id from public.clubs c where c.slug = 'default' limit 1;
    end if;
    return new;
  end if;

  select ag.club_id
    into v_club_id
  from public.age_groups ag
  where ag.id = new.age_group_id;

  if v_club_id is null then
    raise exception 'age_group_id invalido para sincronizacao de club_id';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_club_id_from_age_group_ref"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_club_id_from_domain_refs"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."sync_club_id_from_domain_refs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_club_id_from_team_or_age_group_ref"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_team_club_id uuid;
  v_age_group_club_id uuid;
  v_resolved_club_id uuid;
begin
  if new.team_id is not null then
    select t.club_id
      into v_team_club_id
    from public.teams t
    where t.id = new.team_id;

    if v_team_club_id is null then
      raise exception 'team_id invalido para sincronizacao de club_id';
    end if;
  end if;

  if new.age_group_id is not null then
    select ag.club_id
      into v_age_group_club_id
    from public.age_groups ag
    where ag.id = new.age_group_id;

    if v_age_group_club_id is null then
      raise exception 'age_group_id invalido para sincronizacao de club_id';
    end if;
  end if;

  if v_team_club_id is not null and v_age_group_club_id is not null and v_team_club_id is distinct from v_age_group_club_id then
    raise exception 'team_id e age_group_id pertencem a clubes diferentes';
  end if;

  v_resolved_club_id := coalesce(v_team_club_id, v_age_group_club_id, new.club_id, public.user_default_club_id());

  if v_resolved_club_id is null then
    select c.id into v_resolved_club_id from public.clubs c where c.slug = 'default' limit 1;
  end if;

  new.club_id := v_resolved_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_club_id_from_team_or_age_group_ref"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_club_id_from_team_ref"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_club_id uuid;
begin
  if new.team_id is null then
    if new.club_id is null then
      new.club_id := public.user_default_club_id();
    end if;
    if new.club_id is null then
      select c.id into new.club_id from public.clubs c where c.slug = 'default' limit 1;
    end if;
    return new;
  end if;

  select t.club_id
    into v_club_id
  from public.teams t
  where t.id = new.team_id;

  if v_club_id is null then
    raise exception 'team_id invalido para sincronizacao de club_id';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_club_id_from_team_ref"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_team_staff_to_age_group_staff"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_age_group_id uuid;
  v_club_id uuid;
  v_coordinator_id uuid;
  v_role text;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    select t.age_group_id
      into v_age_group_id
    from public.teams t
    where t.id = old.team_id;

    if v_age_group_id is null then
      return old;
    end if;

    with replacement as (
      select
        t.age_group_id,
        t.club_id,
        ts.profile_id,
        ts.team_id as linked_team_id,
        case
          when ts.role in ('coach', 'head_coach', 'coordinator') then 'coach'
          when ts.role = 'assistant_coach' then 'assistant_coach'
          else null
        end as role
      from public.team_staff ts
      join public.teams t
        on t.id = ts.team_id
      where ts.profile_id = old.profile_id
        and t.age_group_id = v_age_group_id
        and ts.id <> old.id
        and ts.role in ('coach', 'head_coach', 'assistant_coach', 'coordinator')
      order by
        case
          when ts.role in ('coach', 'head_coach', 'coordinator') then 0
          else 1
        end,
        ts.created_at asc nulls last,
        ts.id asc
      limit 1
    )
    insert into public.age_group_staff (
      age_group_id,
      club_id,
      profile_id,
      linked_team_id,
      role
    )
    select
      replacement.age_group_id,
      replacement.club_id,
      replacement.profile_id,
      replacement.linked_team_id,
      replacement.role
    from replacement
    where replacement.role is not null
    on conflict (age_group_id, profile_id)
    do update set
      club_id = excluded.club_id,
      linked_team_id = excluded.linked_team_id,
      role = excluded.role,
      updated_at = now();

    if not exists (
      select 1
      from public.team_staff ts
      join public.teams t
        on t.id = ts.team_id
      where ts.profile_id = old.profile_id
        and t.age_group_id = v_age_group_id
        and ts.role in ('coach', 'head_coach', 'assistant_coach', 'coordinator')
    ) then
      delete from public.age_group_staff ags
      where ags.age_group_id = v_age_group_id
        and ags.profile_id = old.profile_id;
    end if;

    return old;
  end if;

  select
    t.age_group_id,
    t.club_id
  into
    v_age_group_id,
    v_club_id
  from public.teams t
  where t.id = new.team_id;

  if v_age_group_id is null then
    return new;
  end if;

  v_role :=
    case
      when new.role in ('coach', 'head_coach', 'coordinator') then 'coach'
      when new.role = 'assistant_coach' then 'assistant_coach'
      else null
    end;

  if v_role is null then
    return new;
  end if;

  select ag.coordinator_id
    into v_coordinator_id
  from public.age_groups ag
  where ag.id = v_age_group_id;

  if new.profile_id is not distinct from v_coordinator_id then
    delete from public.age_group_staff ags
    where ags.age_group_id = v_age_group_id
      and ags.profile_id = new.profile_id;
    return new;
  end if;

  insert into public.age_group_staff (
    age_group_id,
    club_id,
    profile_id,
    linked_team_id,
    role
  )
  values (
    v_age_group_id,
    v_club_id,
    new.profile_id,
    new.team_id,
    v_role
  )
  on conflict (age_group_id, profile_id)
  do update set
    club_id = excluded.club_id,
    linked_team_id = excluded.linked_team_id,
    role = excluded.role,
    updated_at = now();

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_team_staff_to_age_group_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."table_has_column"("p_table" "text", "p_column" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = p_table
      and c.column_name = p_column
  );
$$;


ALTER FUNCTION "public"."table_has_column"("p_table" "text", "p_column" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."team_staff_sync_club_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_club_id uuid;
begin
  select t.club_id
    into v_club_id
  from public.teams t
  where t.id = new.team_id;

  if v_club_id is not null and new.profile_id is not null then
    insert into public.club_memberships (club_id, profile_id, role)
    values (
      v_club_id,
      new.profile_id,
      case when new.role = 'coordinator' then 'coordinator' else 'staff' end
    )
    on conflict (club_id, profile_id)
    do update set role =
      case
        when public.club_memberships.role in ('owner', 'admin', 'coordinator') then public.club_memberships.role
        when excluded.role = 'coordinator' then 'coordinator'
        else public.club_memberships.role
      end;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."team_staff_sync_club_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."teams_assign_validate_club_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_age_group_club_id uuid;
begin
  if new.age_group_id is not null then
    select ag.club_id
      into v_age_group_club_id
    from public.age_groups ag
    where ag.id = new.age_group_id;

    if v_age_group_club_id is null then
      raise exception 'teams.age_group_id invalido ou sem club_id associado';
    end if;

    if new.club_id is null then
      new.club_id := v_age_group_club_id;
    elsif new.club_id is distinct from v_age_group_club_id then
      raise exception 'teams.club_id deve corresponder ao club_id do age_group';
    end if;
  elsif new.club_id is null then
    new.club_id := public.user_default_club_id();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."teams_assign_validate_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."training_phase_exercises_assign_validate_club_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_phase_club_id uuid;
  v_exercise_club_id uuid;
begin
  select tp.club_id
    into v_phase_club_id
  from public.training_phases tp
  where tp.id = new.phase_id;

  if v_phase_club_id is null then
    raise exception 'training_phase_exercises.phase_id invalido';
  end if;

  if new.exercise_id is not null then
    select e.club_id
      into v_exercise_club_id
    from public.exercises e
    where e.id = new.exercise_id;

    if v_exercise_club_id is null then
      raise exception 'training_phase_exercises.exercise_id invalido';
    end if;

    if v_exercise_club_id is distinct from v_phase_club_id then
      raise exception 'training_phase_exercises.exercise_id deve pertencer ao mesmo club da fase';
    end if;
  end if;

  new.club_id := v_phase_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."training_phase_exercises_assign_validate_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."training_phases_assign_club_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_club_id uuid;
begin
  select ts.club_id
    into v_club_id
  from public.training_sessions ts
  where ts.id = new.training_session_id;

  if v_club_id is null then
    raise exception 'training_phases.training_session_id invalido';
  end if;

  new.club_id := v_club_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."training_phases_assign_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_rows_club_id_by_age_group"("p_table" "text", "p_age_group_id" "uuid", "p_new_club_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
begin
  if p_new_club_id is null or p_age_group_id is null then
    return;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    return;
  end if;

  if not public.table_has_column(p_table, 'club_id') then
    return;
  end if;

  if not public.table_has_column(p_table, 'age_group_id') then
    return;
  end if;

  execute format(
    'update public.%I set club_id = $1 where age_group_id = $2',
    p_table
  )
  using p_new_club_id, p_age_group_id;
end;
$_$;


ALTER FUNCTION "public"."update_rows_club_id_by_age_group"("p_table" "text", "p_age_group_id" "uuid", "p_new_club_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_rows_club_id_by_ids"("p_table" "text", "p_column" "text", "p_ids" "uuid"[], "p_new_club_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
begin
  if p_new_club_id is null then
    return;
  end if;

  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    return;
  end if;

  if not public.table_has_column(p_table, 'club_id') then
    return;
  end if;

  if not public.table_has_column(p_table, p_column) then
    return;
  end if;

  execute format(
    'update public.%I set club_id = $1 where %I = any($2)',
    p_table,
    p_column
  )
  using p_new_club_id, p_ids;
end;
$_$;


ALTER FUNCTION "public"."update_rows_club_id_by_ids"("p_table" "text", "p_column" "text", "p_ids" "uuid"[], "p_new_club_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_age_group"("p_age_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.user_can_access_age_group_v2(p_age_group_id);
$$;


ALTER FUNCTION "public"."user_can_access_age_group"("p_age_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_age_group_v2"("p_age_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.age_groups ag
    WHERE ag.id = p_age_group_id
      AND (
        public.user_is_super_coordinator()
        OR ag.coordinator_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.age_group_staff ags
          WHERE ags.age_group_id = ag.id
            AND ags.profile_id = auth.uid()
        )
        -- Club coordinator: acesso a todos os escalões do clube
        OR EXISTS (
          SELECT 1
          FROM public.club_memberships cm
          WHERE cm.club_id = ag.club_id
            AND cm.profile_id = auth.uid()
        )
      )
  );
$$;


ALTER FUNCTION "public"."user_can_access_age_group_v2"("p_age_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_club"("p_club_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p_club_id is not null
    and (
      public.user_is_super_coordinator()
      or exists (
        select 1
        from public.age_groups ag
        where ag.club_id = p_club_id
          and public.user_can_access_age_group_v2(ag.id)
      )
    );
$$;


ALTER FUNCTION "public"."user_can_access_club"("p_club_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_can_access_club"("p_club_id" "uuid") IS 'Wrapper de compatibilidade. O acesso é derivado do domínio real age_group/team e não de club_memberships.';



CREATE OR REPLACE FUNCTION "public"."user_can_access_convocation"("p_convocation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.convocations c
    where c.id = p_convocation_id
      and public.user_can_access_game(c.game_id)
  );
$$;


ALTER FUNCTION "public"."user_can_access_convocation"("p_convocation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_game"("p_game_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.games g
    left join public.teams t
      on t.id = g.team_id
    where g.id = p_game_id
      and (
        (g.team_id is not null and public.user_can_access_team(g.team_id))
        or (g.age_group_id is not null and public.user_can_access_age_group(g.age_group_id))
        or (
          g.age_group_id is null
          and t.age_group_id is not null
          and public.user_can_access_age_group(t.age_group_id)
        )
      )
  );
$$;


ALTER FUNCTION "public"."user_can_access_game"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_notification_context"("p_notification_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.notifications n
    where n.id = p_notification_id
      and public.user_can_access_notification_scope_v2(n.age_group_id, n.team_id)
  );
$$;


ALTER FUNCTION "public"."user_can_access_notification_context"("p_notification_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_notification_scope_v2"("p_age_group_id" "uuid", "p_team_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (
      (p_team_id is not null and public.user_can_access_team_v2(p_team_id))
      or (p_age_group_id is not null and public.user_can_access_age_group_v2(p_age_group_id))
    )
    and (
      p_team_id is null
      or exists (
        select 1
        from public.teams t
        where t.id = p_team_id
          and (p_age_group_id is null or t.age_group_id = p_age_group_id)
      )
    );
$$;


ALTER FUNCTION "public"."user_can_access_notification_scope_v2"("p_age_group_id" "uuid", "p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_team"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.user_can_access_team_v2(p_team_id);
$$;


ALTER FUNCTION "public"."user_can_access_team"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_team_v2"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.teams t
    join public.age_groups ag
      on ag.id = t.age_group_id
    where t.id = p_team_id
      and (
        public.user_is_super_coordinator()
        or ag.coordinator_id = auth.uid()
        or exists (
          select 1
          from public.age_group_staff ags
          where ags.age_group_id = t.age_group_id
            and ags.profile_id = auth.uid()
            and (
              ags.linked_team_id is null
              or ags.linked_team_id = t.id
            )
        )
        -- Club coordinator tem acesso a todas as equipas do clube
        or exists (
          select 1 from public.club_memberships cm
          where cm.club_id = ag.club_id
            and cm.profile_id = auth.uid()
            and cm.role = 'club_coordinator'
        )
      )
  );
$$;


ALTER FUNCTION "public"."user_can_access_team_v2"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_training_session_v2"("p_training_session_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.training_sessions ts
    left join public.teams t
      on t.id = ts.team_id
    where ts.id = p_training_session_id
      and (
        (ts.team_id is not null and public.user_can_access_team_v2(ts.team_id))
        or (ts.age_group_id is not null and public.user_can_access_age_group_v2(ts.age_group_id))
        or (
          ts.age_group_id is null
          and t.age_group_id is not null
          and public.user_can_access_age_group_v2(t.age_group_id)
        )
      )
  );
$$;


ALTER FUNCTION "public"."user_can_access_training_session_v2"("p_training_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_manage_age_group_v2"("p_age_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.age_groups ag
    WHERE ag.id = p_age_group_id
      AND (
        public.user_is_super_coordinator()
        OR ag.coordinator_id = auth.uid()
        -- Coordenador do clube: pode gerir todos os escalões do seu clube
        OR EXISTS (
          SELECT 1
          FROM public.club_memberships cm
          WHERE cm.club_id = ag.club_id
            AND cm.profile_id = auth.uid()
            AND cm.role = 'club_coordinator'
        )
        -- Coordenador funcional do escalão: permissões de gestão no seu escalão
        OR EXISTS (
          SELECT 1
          FROM public.age_group_staff ags
          WHERE ags.age_group_id = ag.id
            AND ags.profile_id = auth.uid()
            AND ags.role = 'age_group_coordinator'
        )
      )
  );
$$;


ALTER FUNCTION "public"."user_can_manage_age_group_v2"("p_age_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_manage_club"("p_club_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p_club_id is not null
    and (
      public.user_is_super_coordinator()
      or exists (
        select 1
        from public.age_groups ag
        where ag.club_id = p_club_id
          and public.user_can_manage_age_group_v2(ag.id)
      )
    );
$$;


ALTER FUNCTION "public"."user_can_manage_club"("p_club_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_can_manage_club"("p_club_id" "uuid") IS 'Wrapper de compatibilidade. A gestão é derivada do coordenador do age_group, não de club_memberships.';



CREATE OR REPLACE FUNCTION "public"."user_can_read_club_scope"("p_club_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p_club_id is not null
    and (
      public.user_is_super_coordinator()
      or exists (
        select 1
        from public.age_groups ag
        where ag.club_id = p_club_id
          and ag.coordinator_id = auth.uid()
      )
      or exists (
        select 1
        from public.age_group_staff ags
        where ags.club_id = p_club_id
          and ags.profile_id = auth.uid()
      )
    );
$$;


ALTER FUNCTION "public"."user_can_read_club_scope"("p_club_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_write_age_group_scope"("p_age_group_id" "uuid", "p_club_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p_age_group_id is not null
    and p_club_id is not null
    and (
      public.user_is_super_coordinator()
      or exists (
        select 1
        from public.age_groups ag
        where ag.id = p_age_group_id
          and ag.club_id = p_club_id
          and ag.coordinator_id = auth.uid()
      )
      or exists (
        select 1
        from public.age_group_staff ags
        where ags.age_group_id = p_age_group_id
          and ags.club_id = p_club_id
          and ags.profile_id = auth.uid()
      )
    );
$$;


ALTER FUNCTION "public"."user_can_write_age_group_scope"("p_age_group_id" "uuid", "p_club_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_write_convocation"("p_convocation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.convocations c
    where c.id = p_convocation_id
      and public.user_can_write_game(c.game_id)
  );
$$;


ALTER FUNCTION "public"."user_can_write_convocation"("p_convocation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_write_game"("p_game_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.user_can_access_game(p_game_id);
$$;


ALTER FUNCTION "public"."user_can_write_game"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_write_live_game"("p_game_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and public.user_can_write_game(g.id)
      and (
        coalesce(g.status, 'scheduled') <> 'completed'
        or public.user_is_game_coordinator(g.id)
      )
  );
$$;


ALTER FUNCTION "public"."user_can_write_live_game"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_club_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select distinct ag.club_id
  from public.age_groups ag
  where ag.club_id is not null
    and public.user_can_access_age_group_v2(ag.id)

  union

  select c.id
  from public.clubs c
  where public.user_is_super_coordinator();
$$;


ALTER FUNCTION "public"."user_club_ids"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_club_ids"() IS 'Compatibilidade: devolve clubs técnicos acessíveis a partir do domínio real age_group/team.';



CREATE OR REPLACE FUNCTION "public"."user_default_club_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_club_id uuid;
begin
  select ag.club_id
    into v_club_id
  from public.age_groups ag
  where ag.coordinator_id = auth.uid()
    and ag.club_id is not null
  order by ag.created_at asc, ag.id asc
  limit 1;

  if v_club_id is null then
    select ags.club_id
      into v_club_id
    from public.age_group_staff ags
    where ags.profile_id = auth.uid()
      and ags.club_id is not null
    order by ags.created_at asc, ags.id asc
    limit 1;
  end if;

  if v_club_id is null then
    select cm.club_id
      into v_club_id
    from public.club_memberships cm
    where cm.profile_id = auth.uid()
    order by
      case cm.role
        when 'owner' then 1
        when 'admin' then 2
        when 'coordinator' then 3
        else 4
      end,
      cm.created_at asc
    limit 1;
  end if;

  if v_club_id is null then
    select c.id
      into v_club_id
    from public.clubs c
    where c.slug = 'default'
    limit 1;
  end if;

  return v_club_id;
end;
$$;


ALTER FUNCTION "public"."user_default_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_age_group_coordinator"("p_age_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.user_can_manage_age_group_v2(p_age_group_id);
$$;


ALTER FUNCTION "public"."user_is_age_group_coordinator"("p_age_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_game_coordinator"("p_game_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.games g
    left join public.age_groups ag on ag.id = g.age_group_id
    where g.id = p_game_id
      and (
        -- Super coordenador
        public.user_is_super_coordinator()
        -- Coordenador directo do escalão
        or (g.age_group_id is not null and ag.coordinator_id = auth.uid())
        -- Coordenador da equipa
        or (g.team_id is not null and public.user_is_team_coordinator(g.team_id))
        -- Coordenador funcional do escalão via age_group_staff
        or (g.age_group_id is not null and exists (
          select 1 from public.age_group_staff ags
          where ags.age_group_id = g.age_group_id
            and ags.profile_id = auth.uid()
            and ags.role = 'age_group_coordinator'
        ))
        -- Coordenador do clube via club_memberships
        or (ag.club_id is not null and exists (
          select 1 from public.club_memberships cm
          where cm.club_id = ag.club_id
            and cm.profile_id = auth.uid()
            and cm.role = 'club_coordinator'
        ))
      )
  );
$$;


ALTER FUNCTION "public"."user_is_game_coordinator"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_super_coordinator"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_super_coordinator = true
  );
$$;


ALTER FUNCTION "public"."user_is_super_coordinator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_team_coordinator"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and public.user_can_manage_age_group_v2(t.age_group_id)
  );
$$;


ALTER FUNCTION "public"."user_is_team_coordinator"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_training_session_coordinator"("p_training_session_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.training_sessions ts
    left join public.teams t
      on t.id = ts.team_id
    where ts.id = p_training_session_id
      and (
        (ts.age_group_id is not null and public.user_can_manage_age_group_v2(ts.age_group_id))
        or (
          ts.age_group_id is null
          and t.age_group_id is not null
          and public.user_can_manage_age_group_v2(t.age_group_id)
        )
      )
  );
$$;


ALTER FUNCTION "public"."user_is_training_session_coordinator"("p_training_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_matches_notification_recipient_scope_v2"("p_user_id" "uuid", "p_age_group_id" "uuid", "p_team_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    p_user_id is not null
    and p_age_group_id is not null
    and (
      exists (
        select 1
        from public.age_groups ag
        where ag.id = p_age_group_id
          and ag.coordinator_id = p_user_id
      )
      or exists (
        select 1
        from public.age_group_staff ags
        where ags.age_group_id = p_age_group_id
          and ags.profile_id = p_user_id
      )
    )
    and (
      p_team_id is null
      or exists (
        select 1
        from public.teams t
        where t.id = p_team_id
          and t.age_group_id = p_age_group_id
      )
    );
$$;


ALTER FUNCTION "public"."user_matches_notification_recipient_scope_v2"("p_user_id" "uuid", "p_age_group_id" "uuid", "p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_shares_club_with"("target_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM club_memberships me
    JOIN club_memberships them ON them.club_id = me.club_id
    WHERE me.profile_id = (select auth.uid())
      AND them.profile_id = target_profile_id
  );
$$;


ALTER FUNCTION "public"."user_shares_club_with"("target_profile_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."age_group_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."age_group_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."age_group_club_rehome_audit" (
    "age_group_id" "uuid" NOT NULL,
    "coordinator_id" "uuid",
    "old_club_id" "uuid",
    "new_club_id" "uuid" NOT NULL,
    "old_club_slug" "text",
    "new_club_slug" "text" NOT NULL,
    "before_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "after_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "executed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."age_group_club_rehome_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."age_group_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "age_group_id" "uuid",
    "club_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "linked_team_id" "uuid",
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "age_group_staff_role_check" CHECK (("role" = ANY (ARRAY['head_coach'::"text", 'assistant_coach'::"text", 'intern_coach'::"text", 'goalkeeper_coach'::"text", 'fitness_coach'::"text", 'physiotherapist'::"text", 'doctor'::"text", 'analyst'::"text", 'team_manager'::"text", 'age_group_coordinator'::"text"])))
);


ALTER TABLE "public"."age_group_staff" OWNER TO "postgres";


COMMENT ON TABLE "public"."age_group_staff" IS 'Fonte de verdade funcional da equipa técnica por escalão.';



CREATE TABLE IF NOT EXISTS "public"."age_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coordinator_id" "uuid" NOT NULL,
    "club_name" "text",
    "club_logo_url" "text",
    "name" "text" NOT NULL,
    "football_format" "text" NOT NULL,
    "season" "text" DEFAULT '2024/2025'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "club_short_name" "text",
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    "public_slug" "text",
    "public_access_enabled" boolean DEFAULT false NOT NULL,
    "public_access_count" integer DEFAULT 0 NOT NULL,
    "public_last_accessed_at" timestamp with time zone,
    "tactical_system" "text",
    "age_level" "text",
    "game_model" "jsonb",
    "category_id" "uuid",
    CONSTRAINT "age_groups_football_format_check" CHECK (("football_format" = ANY (ARRAY['5'::"text", '7'::"text", '9'::"text", '11'::"text"]))),
    CONSTRAINT "age_groups_public_access_count_check" CHECK (("public_access_count" >= 0))
);


ALTER TABLE "public"."age_groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."age_groups" IS 'Raiz funcional do domínio. age_groups.tactical_system é a fonte de verdade do sistema tático base do escalão.';



COMMENT ON COLUMN "public"."age_groups"."public_slug" IS 'Slug público estável do escalão usado em /public/[slug].';



COMMENT ON COLUMN "public"."age_groups"."public_access_enabled" IS 'Define se o link público fixo do escalão está ativo ou temporariamente pausado.';



COMMENT ON COLUMN "public"."age_groups"."public_access_count" IS 'Número total de acessos registados para o link público fixo do escalão.';



COMMENT ON COLUMN "public"."age_groups"."public_last_accessed_at" IS 'Momento do último acesso ao link público fixo do escalão.';



COMMENT ON COLUMN "public"."age_groups"."tactical_system" IS 'Fonte funcional de verdade do sistema tático base do escalão. Novas funcionalidades devem ler/escrever aqui.';



COMMENT ON COLUMN "public"."age_groups"."game_model" IS 'Modelo de Jogo — 4 momentos: org_ofensiva, org_defensiva, trans_ofensiva, trans_defensiva';



CREATE TABLE IF NOT EXISTS "public"."athlete_intake_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text",
    "dob" "date",
    "parent_name" "text",
    "height_cm" numeric(5,1),
    "weight_kg" numeric(5,1),
    "dominant_foot" "text",
    "preferred_position" "text",
    "previous_clubs" "text",
    "years_federated" "text",
    "time_without_club" "text",
    "individual_training" "text",
    "individual_detail" "text",
    "heel_pain_level" smallint,
    "heel_when" "text"[],
    "current_injuries" "text",
    "past_injuries" "text",
    "physiotherapy_status" "text",
    "self_ball_control" smallint,
    "self_speed" smallint,
    "self_dribbling" smallint,
    "self_finishing" smallint,
    "self_aerobic" smallint,
    "self_game_reading" smallint,
    "strongest_point" "text",
    "improvement_area" "text",
    "main_objective" "text",
    "target_clubs" "text",
    "idol_player" "text",
    "idol_reason" "text",
    "motivation_text" "text",
    "motivation_level" smallint,
    "available_days" "text"[],
    "preferred_time" "text",
    "sessions_per_week" "text",
    "training_location" "text",
    "parent_present" "text",
    "additional_notes" "text",
    "lang" "text" DEFAULT 'pt'::"text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "reviewed" boolean DEFAULT false,
    "reviewed_at" timestamp with time zone,
    "notes_coach" "text",
    CONSTRAINT "athlete_intake_submissions_dominant_foot_check" CHECK (("dominant_foot" = ANY (ARRAY['right'::"text", 'left'::"text", 'both'::"text"]))),
    CONSTRAINT "athlete_intake_submissions_heel_pain_level_check" CHECK ((("heel_pain_level" >= 0) AND ("heel_pain_level" <= 10))),
    CONSTRAINT "athlete_intake_submissions_motivation_level_check" CHECK ((("motivation_level" >= 1) AND ("motivation_level" <= 10))),
    CONSTRAINT "athlete_intake_submissions_self_aerobic_check" CHECK ((("self_aerobic" >= 1) AND ("self_aerobic" <= 5))),
    CONSTRAINT "athlete_intake_submissions_self_ball_control_check" CHECK ((("self_ball_control" >= 1) AND ("self_ball_control" <= 5))),
    CONSTRAINT "athlete_intake_submissions_self_dribbling_check" CHECK ((("self_dribbling" >= 1) AND ("self_dribbling" <= 5))),
    CONSTRAINT "athlete_intake_submissions_self_finishing_check" CHECK ((("self_finishing" >= 1) AND ("self_finishing" <= 5))),
    CONSTRAINT "athlete_intake_submissions_self_game_reading_check" CHECK ((("self_game_reading" >= 1) AND ("self_game_reading" <= 5))),
    CONSTRAINT "athlete_intake_submissions_self_speed_check" CHECK ((("self_speed" >= 1) AND ("self_speed" <= 5)))
);


ALTER TABLE "public"."athlete_intake_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "game_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "invite_type" "text" NOT NULL,
    "target_age_group_id" "uuid",
    "created_by_profile_id" "uuid",
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "beta_invites_email_lowercase_chk" CHECK (("email" = "lower"(TRIM(BOTH FROM "email")))),
    CONSTRAINT "beta_invites_invite_type_coordinator_only_chk" CHECK (("invite_type" = 'beta_coordinator'::"text")),
    CONSTRAINT "beta_invites_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text"]))),
    CONSTRAINT "beta_invites_target_age_group_null_chk" CHECK (("target_age_group_id" IS NULL))
);


ALTER TABLE "public"."beta_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."club_memberships" (
    "club_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'staff'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "club_memberships_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'club_coordinator'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."club_memberships" OWNER TO "postgres";


COMMENT ON TABLE "public"."club_memberships" IS 'Metadado técnico de compatibilidade para clubs. Não é fonte de verdade funcional para autorização.';



CREATE TABLE IF NOT EXISTS "public"."clubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "certification_level" "text" DEFAULT 'none'::"text" NOT NULL,
    "primary_color" "text" DEFAULT '#1A7F4B'::"text",
    "secondary_color" "text" DEFAULT '#0F172A'::"text",
    "custom_domain" "text",
    "short_name" "text",
    "morada" "text",
    "telefone" "text",
    "email_contacto" "text",
    "website" "text",
    "cor_primaria" "text",
    "cor_secundaria" "text",
    "distrito" "text",
    "associacao" "text",
    "plan_type" "text" DEFAULT 'club'::"text" NOT NULL,
    "tier" "text" DEFAULT 'standard'::"text" NOT NULL,
    "legal_name" "text",
    "nif" "text",
    "billing_address" "text",
    "billing_email" "text",
    "country" "text" DEFAULT 'PT'::"text" NOT NULL,
    "expected_age_groups_count" integer,
    "expected_players_count" integer,
    "expected_users_count" integer,
    "notes" "text",
    "pending_coordinator_name" "text",
    "pending_coordinator_email" "text",
    "pending_coordinator_phone" "text",
    "pending_coordinator_invite_sent_at" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "subscription_status" "text",
    "subscription_current_period_end" timestamp with time zone,
    "trial_ends_at" timestamp with time zone,
    "subscription_cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "trial_reminder_sent_at" timestamp with time zone,
    "data_purge_scheduled_at" timestamp with time zone,
    "purge_warning_d30_sent_at" timestamp with time zone,
    "purge_warning_d53_sent_at" timestamp with time zone,
    CONSTRAINT "clubs_certification_level_check" CHECK (("certification_level" = ANY (ARRAY['none'::"text", 'cbff'::"text", 'escola_1_2'::"text", 'formadora_3'::"text", 'formadora_4_5'::"text"]))),
    CONSTRAINT "clubs_plan_type_check" CHECK (("plan_type" = ANY (ARRAY['individual'::"text", 'club'::"text"]))),
    CONSTRAINT "clubs_subscription_status_check" CHECK ((("subscription_status" IS NULL) OR ("subscription_status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'incomplete'::"text", 'incomplete_expired'::"text", 'unpaid'::"text", 'paused'::"text"])))),
    CONSTRAINT "clubs_tier_check" CHECK (("tier" = ANY (ARRAY['individual'::"text", 'standard'::"text", 'pro'::"text"])))
);


ALTER TABLE "public"."clubs" OWNER TO "postgres";


COMMENT ON TABLE "public"."clubs" IS 'Camada técnica de tenancy/compatibilidade. Não é raiz funcional do produto; a autorização deve derivar de age_groups, age_group_staff e teams.';



COMMENT ON COLUMN "public"."clubs"."certification_level" IS 'Nivel de certificacao FPF. Controla quais modulos admin estao disponiveis.';



COMMENT ON COLUMN "public"."clubs"."plan_type" IS 'Segmentacao de produto: individual (treinador self-service) ou club (sales-led). Controla UI condicional, billing e onboarding.';



COMMENT ON COLUMN "public"."clubs"."tier" IS 'Tier comercial do cliente: individual (self-service), standard (sales-led DB partilhada), pro (sales-led DB propria). Controla pricing, features e provisioning.';



COMMENT ON COLUMN "public"."clubs"."legal_name" IS 'Razao social (se diferente do nome comercial). Opcional.';



COMMENT ON COLUMN "public"."clubs"."nif" IS 'NIF do clube (Portugal: 9 digitos). Recolhido no wizard de onboarding manual.';



COMMENT ON COLUMN "public"."clubs"."billing_address" IS 'Morada de faturacao. Recolhida no wizard.';



COMMENT ON COLUMN "public"."clubs"."billing_email" IS 'Email para envio de facturas (se diferente do email do coordenador). Opcional.';



COMMENT ON COLUMN "public"."clubs"."country" IS 'Codigo ISO 3166-1 alpha-2 do pais. Default PT.';



COMMENT ON COLUMN "public"."clubs"."expected_age_groups_count" IS 'Numero de escaloes que o cliente prevê gerir. Opcional. Sizing/pricing.';



COMMENT ON COLUMN "public"."clubs"."expected_players_count" IS 'Numero de atletas previsto. Opcional. Sizing/pricing.';



COMMENT ON COLUMN "public"."clubs"."expected_users_count" IS 'Numero total de utilizadores previsto (coordenadores + treinadores + staff). Opcional. Sizing.';



COMMENT ON COLUMN "public"."clubs"."notes" IS 'Notas internas do operador (Pedro) sobre o cliente — historia de suporte, condicoes especiais, etc. Nao visiveis ao coordenador do clube.';



COMMENT ON COLUMN "public"."clubs"."pending_coordinator_name" IS 'Nome do coordenador pendente, recolhido no wizard de onboarding manual. Limpa-se quando o coordenador se regista.';



COMMENT ON COLUMN "public"."clubs"."pending_coordinator_email" IS 'Email do coordenador pendente. Usado pelo endpoint invite-coordinator para enviar email.';



COMMENT ON COLUMN "public"."clubs"."pending_coordinator_phone" IS 'Telefone do coordenador pendente. Referencia interna.';



COMMENT ON COLUMN "public"."clubs"."pending_coordinator_invite_sent_at" IS 'Timestamp do ultimo envio de convite via /admin/clubs/[id]/invite-coordinator. NULL se ainda nao foi enviado.';



COMMENT ON COLUMN "public"."clubs"."stripe_customer_id" IS 'ID do customer Stripe (cus_...). NULL para clubes sales-led (plan_type=club).';



COMMENT ON COLUMN "public"."clubs"."stripe_subscription_id" IS 'ID da subscricao Stripe (sub_...). NULL para sales-led ou pre-Stripe.';



COMMENT ON COLUMN "public"."clubs"."subscription_status" IS 'Estado Stripe sincronizado via webhook. NULL = sem subscricao (sales-led ou onboarding incompleto).';



COMMENT ON COLUMN "public"."clubs"."subscription_current_period_end" IS 'Fim do periodo actual: data da proxima cobranca, OU fim de acesso se cancel_at_period_end=true.';



COMMENT ON COLUMN "public"."clubs"."trial_ends_at" IS 'Quando o trial termina. NULL apos active. Usado para banner UI e email reminder ao dia 5.';



COMMENT ON COLUMN "public"."clubs"."subscription_cancel_at_period_end" IS 'Se true, subscricao expira em current_period_end (canceled pelo user via Customer Portal).';



COMMENT ON COLUMN "public"."clubs"."trial_reminder_sent_at" IS 'Quando enviamos o email "trial a terminar". Idempotencia para o cron.';



COMMENT ON COLUMN "public"."clubs"."data_purge_scheduled_at" IS 'RGPD: momento em que os dados operacionais do clube serao purgados (fim da subscricao + 60 dias). Apenas plan_type=individual. NULL = sem purga agendada.';



CREATE TABLE IF NOT EXISTS "public"."competitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "season" "text" DEFAULT '2024/2025'::"text" NOT NULL,
    "phase" "text",
    "num_opponents" integer,
    "total_rounds" integer,
    "has_two_legs" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "team_label" "text" DEFAULT 'A'::"text" NOT NULL,
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    CONSTRAINT "competitions_team_label_check" CHECK (("team_label" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text"])))
);


ALTER TABLE "public"."competitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."convocation_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "convocation_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "is_present" boolean DEFAULT true,
    "response_status" "text" DEFAULT 'pending'::"text",
    "response_at" timestamp with time zone,
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    CONSTRAINT "convocation_players_response_status_check" CHECK (("response_status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."convocation_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."convocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "concentration_time" time without time zone,
    "location" "text",
    "ground_id" "uuid",
    "fp_jersey_kit_id" "uuid",
    "fp_shorts_kit_id" "uuid",
    "fp_socks_kit_id" "uuid",
    "gk_jersey_kit_id" "uuid",
    "gk_shorts_kit_id" "uuid",
    "gk_socks_kit_id" "uuid",
    "notes" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    CONSTRAINT "convocations_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'confirmed'::"text"])))
);


ALTER TABLE "public"."convocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "device_push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"])))
);


ALTER TABLE "public"."device_push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "objectives" "text",
    "success_criteria" "text",
    "category" "text" NOT NULL,
    "subcategory" "text",
    "game_format" "text",
    "duration_minutes" integer,
    "rest_minutes" integer DEFAULT 0 NOT NULL,
    "min_players" integer,
    "max_players" integer,
    "field_dimensions" "text",
    "material" "text",
    "diagram_url" "text",
    "is_shared" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "age_group_id" "uuid",
    "orientation" "text",
    "regime" "text",
    "notes" "text",
    "status" "text" DEFAULT 'active'::"text",
    CONSTRAINT "exercises_category_emjogo_v1" CHECK (("category" = ANY (ARRAY['attb'::"text", 'esquemas_taticos'::"text", 'estrategia'::"text", 'finalizacao'::"text", 'organizacao_defensiva'::"text", 'organizacao_ofensiva'::"text", 'principios_de_jogo'::"text", 'qualidades_fisicas'::"text", 'transicao_defensiva'::"text", 'transicao_ofensiva'::"text"]))),
    CONSTRAINT "exercises_orientation_check" CHECK (("orientation" = ANY (ARRAY['recovery'::"text", 'strength'::"text", 'endurance'::"text", 'speed'::"text", 'flexibility'::"text", 'other'::"text"]))),
    CONSTRAINT "exercises_regime_check" CHECK (("regime" = ANY (ARRAY['aerobic'::"text", 'anaerobic_lactic'::"text", 'anaerobic_alactic'::"text"]))),
    CONSTRAINT "exercises_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_player_convocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "jersey_number" integer NOT NULL,
    "position" "text" NOT NULL,
    "lineup_status" "text" DEFAULT 'substitute'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "external_player_convocations_jersey_number_check" CHECK ((("jersey_number" >= 0) AND ("jersey_number" <= 99))),
    CONSTRAINT "external_player_convocations_lineup_status_check" CHECK (("lineup_status" = ANY (ARRAY['on_field'::"text", 'substitute'::"text"]))),
    CONSTRAINT "external_player_convocations_name_check" CHECK (("char_length"(TRIM(BOTH FROM "name")) >= 2)),
    CONSTRAINT "external_player_convocations_position_check" CHECK (("char_length"(TRIM(BOTH FROM "position")) >= 1))
);


ALTER TABLE "public"."external_player_convocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "player_id" "uuid",
    "related_player_id" "uuid",
    "minute" integer NOT NULL,
    "is_opponent_event" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    "external_player_convocation_id" "uuid",
    "external_related_player_convocation_id" "uuid",
    "game_squad_id" "uuid",
    "related_game_squad_id" "uuid",
    CONSTRAINT "game_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['goal'::"text", 'penalty_goal'::"text", 'assist'::"text", 'own_goal'::"text", 'yellow_card'::"text", 'red_card'::"text", 'substitution_in'::"text", 'substitution_out'::"text"])))
);


ALTER TABLE "public"."game_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."game_events"."external_player_convocation_id" IS 'FK para game_squads(id) onde player_id IS NULL (externos). Reapontada em Mai 2026 do legacy external_player_convocations apos refactor unificado.';



COMMENT ON COLUMN "public"."game_events"."external_related_player_convocation_id" IS 'FK para game_squads(id) onde player_id IS NULL (externos). Reapontada em Mai 2026 do legacy external_player_convocations apos refactor unificado.';



CREATE TABLE IF NOT EXISTS "public"."game_final_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "lineup_type" "text" NOT NULL,
    "minutes_played" integer DEFAULT 0 NOT NULL,
    "goals" integer DEFAULT 0,
    "assists" integer DEFAULT 0,
    "yellow_cards" integer DEFAULT 0,
    "red_cards" integer DEFAULT 0,
    "own_goals" integer DEFAULT 0,
    "coach_rating" numeric(3,1),
    "notes" "text",
    "is_finalized" boolean DEFAULT false,
    "finalized_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_mvp" boolean DEFAULT false,
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    "edited_manually" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_final_stats_coach_rating_check" CHECK ((("coach_rating" >= (0)::numeric) AND ("coach_rating" <= (10)::numeric))),
    CONSTRAINT "game_final_stats_lineup_type_check" CHECK (("lineup_type" = ANY (ARRAY['starter'::"text", 'substitute'::"text"])))
);


ALTER TABLE "public"."game_final_stats" OWNER TO "postgres";


COMMENT ON COLUMN "public"."game_final_stats"."edited_manually" IS 'TRUE quando pelo menos um campo NUMÉRICO (minutes_played, goals, own_goals, assists, yellow_cards, red_cards) foi sobrescrito manualmente via UI. FALSE significa que reflecte o cálculo automático a partir de game_events. Reset via UI volta esta flag a false e recomputa. Nota: alterar apenas coach_rating, notes, is_mvp, ou lineup_type NÃO conta como manualidade.';



COMMENT ON COLUMN "public"."game_final_stats"."updated_at" IS 'Timestamp da última alteração da row. Mantido por trigger set_updated_at. Distinto de finalized_at, que regista o momento do finalize inicial.';



CREATE TABLE IF NOT EXISTS "public"."game_live_checkpoints" (
    "game_id" "uuid" NOT NULL,
    "phase" "text" NOT NULL,
    "base_seconds" integer DEFAULT 0 NOT NULL,
    "running_since_ms" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    CONSTRAINT "game_live_checkpoints_base_seconds_check" CHECK (("base_seconds" >= 0)),
    CONSTRAINT "game_live_checkpoints_phase_check" CHECK (("phase" = ANY (ARRAY['pre_match'::"text", 'first_half'::"text", 'halftime'::"text", 'second_half'::"text", 'review'::"text", 'completed'::"text"]))),
    CONSTRAINT "game_live_checkpoints_running_since_ms_check" CHECK ((("running_since_ms" IS NULL) OR ("running_since_ms" >= 0)))
);


ALTER TABLE "public"."game_live_checkpoints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_opponent_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "opponent_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "observation" "text" NOT NULL,
    "promoted_to_opponent_at" timestamp with time zone,
    "promoted_to_field" "text",
    "promoted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "minute" integer,
    CONSTRAINT "game_opponent_observations_observation_check" CHECK ((TRIM(BOTH FROM "observation") <> ''::"text")),
    CONSTRAINT "game_opponent_observations_promoted_to_field_check" CHECK (("promoted_to_field" = ANY (ARRAY['pontos_fortes'::"text", 'pontos_fracos'::"text", 'atletas_chave'::"text", 'notas_gerais'::"text"])))
);

ALTER TABLE ONLY "public"."game_opponent_observations" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_opponent_observations" OWNER TO "postgres";


COMMENT ON TABLE "public"."game_opponent_observations" IS 'Observações específicas de um jogo sobre o adversário. Capturadas durante o live ou pós-jogo. Podem ser promovidas para o perfil permanente do adversário (opponents.pontos_fortes/fracos/atletas_chave/notas_gerais) via modal de revisão (PR 3.3).';



COMMENT ON COLUMN "public"."game_opponent_observations"."promoted_to_field" IS 'Se NULL, observação ainda não foi promovida. Se preenchido, indica para que campo do opponent a observação foi promovida.';



COMMENT ON COLUMN "public"."game_opponent_observations"."minute" IS 'Minuto do jogo em que a observação foi capturada no live. NULL se capturada fora do jogo (ex: review).';



CREATE TABLE IF NOT EXISTS "public"."game_squads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "player_id" "uuid",
    "external_name" "text",
    "external_jersey_number" integer,
    "external_position" "text",
    "source_age_group_id" "uuid",
    "is_present" boolean,
    "response_status" "text",
    "response_at" timestamp with time zone,
    "initial_lineup_status" "text" NOT NULL,
    "jersey_number" integer,
    "evaluation_rating" numeric(3,1),
    "evaluation_notes" "text",
    "is_mvp" boolean DEFAULT false NOT NULL,
    "data_quality" "text" DEFAULT 'authoritative'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_squads_data_quality_check" CHECK (("data_quality" = ANY (ARRAY['authoritative'::"text", 'inferred_from_final_stats'::"text", 'inferred_default_substitute'::"text"]))),
    CONSTRAINT "game_squads_evaluation_rating_check" CHECK ((("evaluation_rating" IS NULL) OR (("evaluation_rating" >= (0)::numeric) AND ("evaluation_rating" <= (10)::numeric)))),
    CONSTRAINT "game_squads_external_jersey_number_check" CHECK ((("external_jersey_number" >= 0) AND ("external_jersey_number" <= 99))),
    CONSTRAINT "game_squads_initial_lineup_status_check" CHECK (("initial_lineup_status" = ANY (ARRAY['starter'::"text", 'substitute'::"text"]))),
    CONSTRAINT "game_squads_jersey_number_check" CHECK ((("jersey_number" >= 0) AND ("jersey_number" <= 99))),
    CONSTRAINT "game_squads_response_status_check" CHECK (("response_status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'declined'::"text"]))),
    CONSTRAINT "player_xor_external" CHECK (((("player_id" IS NOT NULL) AND ("external_name" IS NULL)) OR (("player_id" IS NULL) AND ("external_name" IS NOT NULL) AND ("char_length"(TRIM(BOTH FROM "external_name")) >= 2))))
);


ALTER TABLE "public"."game_squads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_stats_live" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'on_bench'::"text",
    "start_minute" integer DEFAULT 0,
    "end_minute" integer,
    "goals" integer DEFAULT 0,
    "assists" integer DEFAULT 0,
    "yellow_cards" integer DEFAULT 0,
    "red_cards" integer DEFAULT 0,
    "own_goals" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    CONSTRAINT "game_stats_live_status_check" CHECK (("status" = ANY (ARRAY['playing'::"text", 'substituted_out'::"text", 'on_bench'::"text", 'starter'::"text"])))
);


ALTER TABLE "public"."game_stats_live" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text",
    "game_datetime" timestamp without time zone NOT NULL,
    "opponent_name" "text",
    "location" "text",
    "is_home" boolean DEFAULT true,
    "status" "text" DEFAULT 'scheduled'::"text",
    "game_type" "text" DEFAULT 'league'::"text",
    "image_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "age_group_id" "uuid",
    "competition_id" "uuid",
    "concentration_time" "text",
    "equipment" "text" DEFAULT 'home'::"text",
    "opponent_tactical_system" "text",
    "additional_info" "text",
    "score_home" integer,
    "score_away" integer,
    "opponent_short_name" "text",
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "formatted_address" "text",
    "osm_place_id" "text",
    "location_source" "text",
    "end_time" time without time zone,
    "positive_aspects" "text",
    "negative_aspects" "text",
    "coach_notes" "text",
    "convocation_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "opponent_id" "uuid",
    "tactical_system" "text",
    "aspects_to_improve" "text",
    "team_notes" "text",
    "kit_fp_jersey_id" "uuid",
    "kit_fp_shorts_id" "uuid",
    "kit_fp_socks_id" "uuid",
    "kit_gk_jersey_id" "uuid",
    "kit_gk_shorts_id" "uuid",
    "kit_gk_socks_id" "uuid",
    CONSTRAINT "games_convocation_status_check" CHECK (("convocation_status" = ANY (ARRAY['draft'::"text", 'published'::"text"]))),
    CONSTRAINT "games_location_source_check" CHECK ((("location_source" IS NULL) OR ("location_source" = ANY (ARRAY['osm'::"text", 'manual'::"text"])))),
    CONSTRAINT "games_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'live'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."games" OWNER TO "postgres";


COMMENT ON COLUMN "public"."games"."notes" IS 'PÚBLICO — instruções pré-jogo para atletas e famílias (equipamento obrigatório, regras de pontualidade, ponto de encontro). Renderizado em markdown no link público. NÃO usar para notas internas — usar coach_notes ou team_notes.';



COMMENT ON COLUMN "public"."games"."latitude" IS 'Latitude do local do jogo (OSM/manual).';



COMMENT ON COLUMN "public"."games"."longitude" IS 'Longitude do local do jogo (OSM/manual).';



COMMENT ON COLUMN "public"."games"."formatted_address" IS 'Morada normalizada pelo provider de geocoding.';



COMMENT ON COLUMN "public"."games"."osm_place_id" IS 'Identificador OSM no formato N/W/R<ID>.';



COMMENT ON COLUMN "public"."games"."location_source" IS 'Origem da localização: osm ou manual.';



COMMENT ON COLUMN "public"."games"."end_time" IS 'Hora de fim prevista do jogo para apresentar intervalos públicos e duplicação de eventos.';



COMMENT ON COLUMN "public"."games"."positive_aspects" IS 'Aspectos positivos identificados pelo treinador neste jogo. Parte da ficha pós-jogo (Sprint 3). Interno.';



COMMENT ON COLUMN "public"."games"."negative_aspects" IS 'Aspectos menos positivos identificados pelo treinador neste jogo. Parte da ficha pós-jogo (Sprint 3). Interno.';



COMMENT ON COLUMN "public"."games"."coach_notes" IS 'Notas privadas do treinador sobre o jogo. Parte da ficha pós-jogo (Sprint 3). Interno — privado.';



COMMENT ON COLUMN "public"."games"."tactical_system" IS 'Sistema táctico do nosso clube neste jogo (ex: "1-4-3-3"). Dropdown filtrado pelo football_format do escalão. Parte da ficha pós-jogo (Sprint 3).';



COMMENT ON COLUMN "public"."games"."aspects_to_improve" IS 'Aspectos a melhorar para próximos jogos/treinos. Parte da ficha pós-jogo (Sprint 3). Interno.';



COMMENT ON COLUMN "public"."games"."team_notes" IS 'Notas tácticas e operacionais da equipa sobre o jogo. Parte da ficha pós-jogo (Sprint 3). Interno — visível ao staff do escalão, não ao público.';



COMMENT ON COLUMN "public"."games"."kit_fp_jersey_id" IS 'Camisola dos jogadores de campo para este jogo (FK kit_pieces).';



COMMENT ON COLUMN "public"."games"."kit_fp_shorts_id" IS 'Calções dos jogadores de campo para este jogo.';



COMMENT ON COLUMN "public"."games"."kit_fp_socks_id" IS 'Meias dos jogadores de campo para este jogo.';



COMMENT ON COLUMN "public"."games"."kit_gk_jersey_id" IS 'Camisola do guarda-redes para este jogo.';



COMMENT ON COLUMN "public"."games"."kit_gk_shorts_id" IS 'Calções do guarda-redes para este jogo.';



COMMENT ON COLUMN "public"."games"."kit_gk_socks_id" IS 'Meias do guarda-redes para este jogo.';



CREATE TABLE IF NOT EXISTS "public"."gdpr_purge_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "club_name" "text" NOT NULL,
    "stripe_customer_id" "text",
    "trigger_reason" "text" DEFAULT 'subscription_canceled'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "executed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dry_run" boolean DEFAULT false NOT NULL,
    "deleted_counts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gdpr_purge_audit" OWNER TO "postgres";


COMMENT ON TABLE "public"."gdpr_purge_audit" IS 'Prova de conformidade RGPD: uma linha por purga executada (ou simulada em dry-run), com counts de linhas eliminadas por tabela. Zero PII. Sem auto-expiracao.';



CREATE TABLE IF NOT EXISTS "public"."grounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "city" "text",
    "maps_url" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."grounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "period_start" "date",
    "period_end" "date",
    "issued_at" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "paid_at" "date",
    "pdf_path" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "invoices_currency_check" CHECK (("length"("currency") = 3)),
    CONSTRAINT "invoices_due_after_issued" CHECK (("due_date" >= "issued_at")),
    CONSTRAINT "invoices_paid_requires_paid_at" CHECK ((("status" <> 'paid'::"text") OR ("paid_at" IS NOT NULL))),
    CONSTRAINT "invoices_period_order" CHECK ((("period_end" IS NULL) OR ("period_start" IS NULL) OR ("period_end" >= "period_start"))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['issued'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


COMMENT ON TABLE "public"."invoices" IS 'Facturas emitidas fora da plataforma (B1, sales-led). Tracking de pagamento, sem processamento. PDF guardado no bucket invoices.';



COMMENT ON COLUMN "public"."invoices"."invoice_number" IS 'Numero/referencia da factura no software fiscal externo. Unico por clube.';



COMMENT ON COLUMN "public"."invoices"."amount_cents" IS 'Valor total em centimos da moeda indicada. Inteiro para evitar floating-point.';



COMMENT ON COLUMN "public"."invoices"."status" IS 'issued = em aberto (pode estar overdue se due_date < hoje); paid = paga; cancelled = anulada.';



COMMENT ON COLUMN "public"."invoices"."pdf_path" IS 'Path do PDF no bucket invoices. Formato: {club_id}/{invoice_id}.pdf. PDF obrigatorio em B1.';



CREATE TABLE IF NOT EXISTS "public"."kit_pieces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_type" "text" NOT NULL,
    "piece_type" "text" NOT NULL,
    "kit_number" integer NOT NULL,
    "color_name" "text" NOT NULL,
    "color_hex" "text",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    CONSTRAINT "kit_pieces_kit_number_check" CHECK (("kit_number" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "kit_pieces_piece_type_check" CHECK (("piece_type" = ANY (ARRAY['jersey'::"text", 'shorts'::"text", 'socks'::"text"]))),
    CONSTRAINT "kit_pieces_player_type_check" CHECK (("player_type" = ANY (ARRAY['field_player'::"text", 'goalkeeper'::"text"])))
);


ALTER TABLE "public"."kit_pieces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lineup_corrections_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "player_id" "uuid",
    "game_squad_id" "uuid",
    "old_status" "text" NOT NULL,
    "new_status" "text" NOT NULL,
    "corrected_by" "uuid",
    "corrected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reason" "text",
    "club_id" "uuid"
);


ALTER TABLE "public"."lineup_corrections_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matchdays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "matchday_number" integer NOT NULL,
    "opponent_id" "uuid" NOT NULL,
    "is_home" boolean NOT NULL,
    "match_date" "date",
    "match_time" time without time zone,
    "ground_id" "uuid",
    "leg" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "matchdays_leg_check" CHECK (("leg" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."matchdays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."microciclos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "age_group_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "week_number" integer,
    "objective" "text",
    "intensity" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "microciclos_intensity_check" CHECK (("intensity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'recovery'::"text"])))
);


ALTER TABLE "public"."microciclos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_recipients" (
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone,
    "cleared_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "age_group_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "actor_id" "uuid",
    "type" "text" NOT NULL,
    "entity_id" "uuid",
    "title" "text" NOT NULL,
    "body" "text",
    "link_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."notification_inbox" WITH ("security_invoker"='true') AS
 SELECT "nr"."notification_id" AS "id",
    "nr"."user_id",
    "nr"."read_at",
    "nr"."cleared_at",
    "nr"."created_at" AS "recipient_created_at",
    "n"."created_at",
    "n"."club_id",
    "n"."team_id",
    "n"."age_group_id",
    "n"."actor_id",
    "n"."type",
    "n"."entity_id",
    "n"."payload",
    COALESCE(NULLIF(("n"."payload" ->> 'title'::"text"), ''::"text"), "n"."title") AS "title",
    COALESCE(("n"."payload" ->> 'body'::"text"), "n"."body") AS "body",
    COALESCE(("n"."payload" ->> 'link_path'::"text"), "n"."link_path") AS "link_path"
   FROM ("public"."notification_recipients" "nr"
     JOIN "public"."notifications" "n" ON (("n"."id" = "nr"."notification_id")));


ALTER VIEW "public"."notification_inbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opponents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid",
    "name" "text" NOT NULL,
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "short_name" "text",
    "age_group_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "tactical_formation" "text",
    "pontos_fortes" "text",
    "pontos_fracos" "text",
    "atletas_chave" "text",
    "notas_gerais" "text",
    "home_ground" "text",
    "coach_name" "text",
    "contact_info" "text",
    "youth_academy_notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "home_ground_address" "text",
    "home_ground_lat" numeric(9,6),
    "home_ground_lng" numeric(9,6),
    "phone" "text"
);

ALTER TABLE ONLY "public"."opponents" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."opponents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."opponents"."competition_id" IS 'Competição inicial em que o adversário foi registado (opcional, ON DELETE SET NULL). Adversário existe independente de competição — usar para tracking histórico ou criação inicial. Após back-fill PR 2.1, todos os opponents têm valor NULL.';



COMMENT ON COLUMN "public"."opponents"."home_ground" IS 'Nome do campo do adversario (ex: "Campo Municipal de Lourel"). A morada vai em home_ground_address.';



COMMENT ON COLUMN "public"."opponents"."contact_info" IS 'Contactos diversos (email, redes sociais, outros telefones). Texto livre.';



COMMENT ON COLUMN "public"."opponents"."home_ground_address" IS 'Morada completa do campo, formato livre. Usado para preencher jogos fora de casa.';



COMMENT ON COLUMN "public"."opponents"."home_ground_lat" IS 'Latitude do campo (preenchida por autocomplete ou manualmente).';



COMMENT ON COLUMN "public"."opponents"."home_ground_lng" IS 'Longitude do campo.';



COMMENT ON COLUMN "public"."opponents"."phone" IS 'Telefone principal de contacto. Validacao formato PT no client (regex Zod).';



CREATE TABLE IF NOT EXISTS "public"."player_age_group_eligibility" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "age_group_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."player_age_group_eligibility" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_behavioral_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "season" "text" NOT NULL,
    "eval_type" "text" NOT NULL,
    "rating" integer,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "player_behavioral_assessments_eval_type_check" CHECK (("eval_type" = ANY (ARRAY['behavioral'::"text", 'performance'::"text", 'general'::"text"]))),
    CONSTRAINT "player_behavioral_assessments_rating_check" CHECK ((("rating" >= 0) AND ("rating" <= 10)))
);


ALTER TABLE "public"."player_behavioral_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "doc_type" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_name" "text",
    "valid_from" "date",
    "valid_until" "date",
    "status" "text" DEFAULT 'valid'::"text" NOT NULL,
    "notes" "text",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "player_documents_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['id_card'::"text", 'birth_certificate'::"text", 'sports_insurance'::"text", 'medical_exam'::"text", 'authorization'::"text", 'photo'::"text", 'other'::"text"]))),
    CONSTRAINT "player_documents_status_check" CHECK (("status" = ANY (ARRAY['valid'::"text", 'expiring'::"text", 'expired'::"text", 'missing'::"text"])))
);


ALTER TABLE "public"."player_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "season" "text" NOT NULL,
    "registration_type" "text" NOT NULL,
    "registration_date" "date" NOT NULL,
    "exit_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "player_registrations_registration_type_check" CHECK (("registration_type" = ANY (ARRAY['club'::"text", 'competition'::"text", 'transfer_in'::"text", 'transfer_out'::"text"]))),
    CONSTRAINT "player_registrations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'transferred'::"text"])))
);


ALTER TABLE "public"."player_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "age_group_id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "birth_date" "date",
    "preferred_position" "text",
    "secondary_position" "text",
    "jersey_number" integer,
    "phone" "text",
    "email" "text",
    "avatar_url" "text",
    "status" "text" DEFAULT 'active'::"text",
    "profile_id" "uuid",
    "invite_code" "text",
    "invite_method" "text",
    "invite_sent_at" timestamp with time zone,
    "invite_accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    "primary_age_group_id" "uuid",
    "photo_consent_given" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "parent_email" "text",
    "parent_phone" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "players_invite_method_check" CHECK (("invite_method" = ANY (ARRAY['email'::"text", 'phone'::"text", 'code'::"text"]))),
    CONSTRAINT "players_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'injured'::"text", 'suspended'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."players" OWNER TO "postgres";


COMMENT ON COLUMN "public"."players"."avatar_url" IS 'Path interno no bucket players-photos (formato: {ageGroupId}/{playerId}.webp). NÃO é URL pública — o bucket é privado, requer signed URL gerada server-side via /api/players/[id].';



COMMENT ON COLUMN "public"."players"."photo_consent_given" IS 'Flag de consentimento RGPD para apresentação da foto. UI de recolha entra em sprint futura — esta sprint apenas regista o flag.';



COMMENT ON COLUMN "public"."players"."notes" IS 'Observações livres do staff técnico sobre o atleta. Texto livre, sem limite enforced no DB (limite no Zod).';



COMMENT ON COLUMN "public"."players"."parent_email" IS 'Contacto de email do encarregado de educação. Sem CHECK de formato no DB — validação aplicacional.';



COMMENT ON COLUMN "public"."players"."parent_phone" IS 'Contacto telefónico do encarregado de educação. Sem CHECK de formato no DB — validação aplicacional.';



CREATE TABLE IF NOT EXISTS "public"."training_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "training_session_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'present'::"text" NOT NULL,
    "justification" "text",
    "marked_at" timestamp with time zone DEFAULT "now"(),
    "marked_by" "uuid",
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    CONSTRAINT "training_attendance_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'late'::"text", 'absent'::"text", 'injured'::"text"])))
);


ALTER TABLE "public"."training_attendance" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."player_season_stats" WITH ("security_invoker"='true') AS
 SELECT "p"."id" AS "player_id",
    (("p"."first_name" || ' '::"text") || "p"."last_name") AS "full_name",
    "p"."preferred_position",
    "p"."jersey_number",
    "p"."age_group_id",
    COALESCE("ta"."trainings_present", (0)::bigint) AS "trainings_present",
    COALESCE("ta"."trainings_absent", (0)::bigint) AS "trainings_absent",
    COALESCE("ta"."trainings_injured", (0)::bigint) AS "trainings_injured",
    COALESCE("g"."matches_started", (0)::bigint) AS "matches_started",
    COALESCE("g"."matches_substitute", (0)::bigint) AS "matches_substitute",
    COALESCE("g"."total_minutes", (0)::bigint) AS "total_minutes",
    COALESCE("g"."goals", (0)::bigint) AS "goals",
    COALESCE("g"."assists", (0)::bigint) AS "assists",
    COALESCE("g"."own_goals", (0)::bigint) AS "own_goals",
    COALESCE("g"."yellow_cards", (0)::bigint) AS "yellow_cards",
    COALESCE("g"."red_cards", (0)::bigint) AS "red_cards",
    "g"."avg_rating",
    COALESCE("ta"."trainings_late", (0)::bigint) AS "trainings_late"
   FROM (("public"."players" "p"
     LEFT JOIN ( SELECT "training_attendance"."player_id",
            "count"(*) FILTER (WHERE ("training_attendance"."status" = 'present'::"text")) AS "trainings_present",
            "count"(*) FILTER (WHERE ("training_attendance"."status" = 'absent'::"text")) AS "trainings_absent",
            "count"(*) FILTER (WHERE ("training_attendance"."status" = 'injured'::"text")) AS "trainings_injured",
            "count"(*) FILTER (WHERE ("training_attendance"."status" = 'late'::"text")) AS "trainings_late"
           FROM "public"."training_attendance"
          GROUP BY "training_attendance"."player_id") "ta" ON (("ta"."player_id" = "p"."id")))
     LEFT JOIN ( SELECT "game_final_stats"."player_id",
            "count"(*) FILTER (WHERE ("game_final_stats"."lineup_type" = 'starter'::"text")) AS "matches_started",
            "count"(*) FILTER (WHERE ("game_final_stats"."lineup_type" = 'substitute'::"text")) AS "matches_substitute",
            COALESCE("sum"("game_final_stats"."minutes_played"), (0)::bigint) AS "total_minutes",
            COALESCE("sum"("game_final_stats"."goals"), (0)::bigint) AS "goals",
            COALESCE("sum"("game_final_stats"."assists"), (0)::bigint) AS "assists",
            COALESCE("sum"("game_final_stats"."own_goals"), (0)::bigint) AS "own_goals",
            COALESCE("sum"("game_final_stats"."yellow_cards"), (0)::bigint) AS "yellow_cards",
            COALESCE("sum"("game_final_stats"."red_cards"), (0)::bigint) AS "red_cards",
            "round"("avg"("game_final_stats"."coach_rating"), 1) AS "avg_rating"
           FROM "public"."game_final_stats"
          WHERE ("game_final_stats"."is_finalized" = true)
          GROUP BY "game_final_stats"."player_id") "g" ON (("g"."player_id" = "p"."id")));


ALTER VIEW "public"."player_season_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" DEFAULT 'coordinator'::"text" NOT NULL,
    "phone" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "is_super_coordinator" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_email_lowercase_chk" CHECK ((("email" IS NULL) OR ("email" = "lower"(TRIM(BOTH FROM "email"))))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['coordinator'::"text", 'coach'::"text", 'player'::"text", 'parent'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pse_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "training_session_id" "uuid",
    "game_id" "uuid",
    "pse_value" integer NOT NULL,
    "notes" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    CONSTRAINT "pse_records_check" CHECK (((("training_session_id" IS NOT NULL) AND ("game_id" IS NULL)) OR (("training_session_id" IS NULL) AND ("game_id" IS NOT NULL)))),
    CONSTRAINT "pse_records_pse_value_check" CHECK ((("pse_value" >= 0) AND ("pse_value" <= 10)))
);


ALTER TABLE "public"."pse_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_rate_limit_counters" (
    "scope" "text" NOT NULL,
    "scope_key" "text" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "public_rate_limit_counters_count_check" CHECK (("count" >= 0)),
    CONSTRAINT "public_rate_limit_counters_scope_check" CHECK (("scope" = ANY (ARRAY['public_share_ip_minute'::"text", 'public_share_token_hour'::"text"])))
);


ALTER TABLE "public"."public_rate_limit_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_share_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token_hash" "text" NOT NULL,
    "age_group_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "last_accessed_at" timestamp with time zone,
    "access_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "token_encrypted" "text",
    CONSTRAINT "public_share_tokens_access_count_check" CHECK (("access_count" >= 0)),
    CONSTRAINT "public_share_tokens_token_hash_len_chk" CHECK (("length"("token_hash") = 64))
);


ALTER TABLE "public"."public_share_tokens" OWNER TO "postgres";


COMMENT ON COLUMN "public"."public_share_tokens"."token_encrypted" IS 'Token publico cifrado para reexibir o URL em áreas privadas; nunca usado para lookup público.';



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "platform" "text" DEFAULT 'web'::"text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."season_objectives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "age_group_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "season" "text" NOT NULL,
    "objectives_text" "text" NOT NULL,
    "review_notes" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "season_objectives_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."season_objectives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "age_group_id" "uuid" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "role" "text" DEFAULT 'coach'::"text" NOT NULL,
    "invite_code" "text" NOT NULL,
    "invite_sent_at" timestamp with time zone DEFAULT "now"(),
    "accepted_at" timestamp with time zone,
    "profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "accepted_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    "initial_permissions" "jsonb",
    "age_group_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    CONSTRAINT "staff_invites_role_check" CHECK (("role" = ANY (ARRAY['club_coordinator'::"text", 'age_group_coordinator'::"text", 'head_coach'::"text", 'assistant_coach'::"text", 'intern_coach'::"text", 'goalkeeper_coach'::"text", 'fitness_coach'::"text", 'physiotherapist'::"text", 'doctor'::"text", 'analyst'::"text", 'team_manager'::"text"])))
);


ALTER TABLE "public"."staff_invites" OWNER TO "postgres";


COMMENT ON COLUMN "public"."staff_invites"."initial_permissions" IS 'Snapshot de permissões definido pelo coordenador no convite. Formato: array de {area, can_read, can_write, can_edit, can_delete}. Aplicado automaticamente em staff_permissions quando o convite é aceite.';



CREATE TABLE IF NOT EXISTS "public"."staff_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "area" "text" NOT NULL,
    "can_read" boolean DEFAULT true NOT NULL,
    "can_write" boolean DEFAULT false NOT NULL,
    "can_edit" boolean DEFAULT false NOT NULL,
    "can_delete" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "age_group_id" "uuid",
    "scope" "text" DEFAULT 'age_group'::"text" NOT NULL,
    CONSTRAINT "staff_permissions_area_check" CHECK (("area" = ANY (ARRAY['players'::"text", 'trainings'::"text", 'attendance'::"text", 'games'::"text", 'convocations'::"text", 'live_events'::"text", 'statistics'::"text", 'exercises'::"text", 'documents'::"text", 'registrations'::"text"]))),
    CONSTRAINT "staff_permissions_scope_check" CHECK (("scope" = ANY (ARRAY['age_group'::"text", 'club'::"text"])))
);


ALTER TABLE "public"."staff_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."staff_permissions" IS 'Permissoes granulares por area funcional. Configuradas pelo Coordenador do Clube. Treinador Principal tem RWED automatico em tudo (verificado no codigo, nao na tabela).';



CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "api_version" "text",
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb"
);


ALTER TABLE "public"."stripe_webhook_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_webhook_events" IS 'Audit log de webhooks Stripe processados. Idempotencia: row existente = ja processado.';



CREATE TABLE IF NOT EXISTS "public"."team_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    CONSTRAINT "team_staff_role_check" CHECK (("role" = ANY (ARRAY['head_coach'::"text", 'assistant_coach'::"text", 'intern_coach'::"text", 'goalkeeper_coach'::"text", 'fitness_coach'::"text", 'physiotherapist'::"text", 'doctor'::"text", 'analyst'::"text", 'team_manager'::"text", 'age_group_coordinator'::"text"])))
);


ALTER TABLE "public"."team_staff" OWNER TO "postgres";


COMMENT ON TABLE "public"."team_staff" IS 'Projeção compatível derivada de age_group_staff. Não escrever diretamente a partir de fluxos de produto.';



CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "age_group_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_competitive" boolean DEFAULT true,
    "home_ground_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


COMMENT ON TABLE "public"."teams" IS 'Entidade filha de age_groups para contexto competitivo/calendário. Não tem configuração tática própria.';



CREATE TABLE IF NOT EXISTS "public"."training_phase_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "exercise_id" "uuid",
    "club_id" "uuid" NOT NULL,
    "exercise_order" integer DEFAULT 0 NOT NULL,
    "custom_name" "text",
    "custom_description" "text",
    "custom_objectives" "text",
    "custom_game_format" "text",
    "custom_duration_minutes" integer,
    "custom_rest_minutes" integer,
    "custom_num_players" integer,
    "custom_field_dimensions" "text",
    "custom_material" "text",
    "custom_diagram_url" "text",
    "planned_time_minutes" integer,
    "repetitions" integer DEFAULT 1 NOT NULL,
    "total_athletes" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."training_phase_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_phases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "training_session_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "phase_type" "text" NOT NULL,
    "phase_name" "text",
    "phase_order" integer DEFAULT 0 NOT NULL,
    "duration_minutes" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_phases_phase_type_check" CHECK (("phase_type" = ANY (ARRAY['initial'::"text", 'main'::"text", 'final'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."training_phases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "training_id" "uuid",
    "team_id" "uuid" NOT NULL,
    "session_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone,
    "ground_id" "uuid",
    "notes" "text",
    "status" "text" DEFAULT 'scheduled'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "title" "text",
    "location" "text",
    "image_url" "text",
    "age_group_id" "uuid",
    "club_id" "uuid" DEFAULT "public"."user_default_club_id"() NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "formatted_address" "text",
    "osm_place_id" "text",
    "location_source" "text",
    "ut_number" integer,
    "microcycle_number" integer,
    "mesocycle_number" integer,
    "period_type" "text",
    "initial_instruction" "text",
    "objective" "text",
    "complementary_objectives" "text",
    "focus" "text",
    "intensity" "text",
    "material" "text",
    "field_area" "text",
    "week_start_date" "date",
    CONSTRAINT "training_sessions_focus_check" CHECK (("focus" = ANY (ARRAY['tactical'::"text", 'technical'::"text", 'physical'::"text", 'mixed'::"text"]))),
    CONSTRAINT "training_sessions_intensity_check" CHECK (("intensity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'very_high'::"text"]))),
    CONSTRAINT "training_sessions_location_source_check" CHECK ((("location_source" IS NULL) OR ("location_source" = ANY (ARRAY['osm'::"text", 'manual'::"text"])))),
    CONSTRAINT "training_sessions_period_type_check" CHECK (("period_type" = ANY (ARRAY['pre_season'::"text", 'competitive'::"text", 'transition'::"text"]))),
    CONSTRAINT "training_sessions_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."training_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."training_sessions"."latitude" IS 'Latitude do local do treino (OSM/manual).';



COMMENT ON COLUMN "public"."training_sessions"."longitude" IS 'Longitude do local do treino (OSM/manual).';



COMMENT ON COLUMN "public"."training_sessions"."formatted_address" IS 'Morada normalizada pelo provider de geocoding.';



COMMENT ON COLUMN "public"."training_sessions"."osm_place_id" IS 'Identificador OSM no formato N/W/R<ID>.';



COMMENT ON COLUMN "public"."training_sessions"."location_source" IS 'Origem da localização: osm ou manual.';



CREATE TABLE IF NOT EXISTS "public"."trainings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone,
    "ground_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "trainings_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."trainings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "source" "text" DEFAULT 'landing_page'::"text",
    "persona" "text",
    "full_name" "text",
    "phone" "text",
    "club_name" "text",
    "message" "text",
    CONSTRAINT "waitlist_persona_check" CHECK ((("persona" IS NULL) OR ("persona" = ANY (ARRAY['individual'::"text", 'club'::"text"]))))
);


ALTER TABLE "public"."waitlist" OWNER TO "postgres";


ALTER TABLE ONLY "public"."age_group_categories"
    ADD CONSTRAINT "age_group_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."age_group_club_rehome_audit"
    ADD CONSTRAINT "age_group_club_rehome_audit_pkey" PRIMARY KEY ("age_group_id");



ALTER TABLE ONLY "public"."age_group_staff"
    ADD CONSTRAINT "age_group_staff_age_group_id_profile_id_key" UNIQUE ("age_group_id", "profile_id");



ALTER TABLE ONLY "public"."age_group_staff"
    ADD CONSTRAINT "age_group_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."age_groups"
    ADD CONSTRAINT "age_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_intake_submissions"
    ADD CONSTRAINT "athlete_intake_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_invites"
    ADD CONSTRAINT "beta_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."club_memberships"
    ADD CONSTRAINT "club_memberships_pkey" PRIMARY KEY ("club_id", "profile_id");



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."convocation_players"
    ADD CONSTRAINT "convocation_players_convocation_id_player_id_key" UNIQUE ("convocation_id", "player_id");



ALTER TABLE ONLY "public"."convocation_players"
    ADD CONSTRAINT "convocation_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."convocations"
    ADD CONSTRAINT "convocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_player_convocations"
    ADD CONSTRAINT "external_player_convocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_events"
    ADD CONSTRAINT "game_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_final_stats"
    ADD CONSTRAINT "game_final_stats_game_id_player_id_key" UNIQUE ("game_id", "player_id");



ALTER TABLE ONLY "public"."game_final_stats"
    ADD CONSTRAINT "game_final_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_live_checkpoints"
    ADD CONSTRAINT "game_live_checkpoints_pkey" PRIMARY KEY ("game_id");



ALTER TABLE ONLY "public"."game_opponent_observations"
    ADD CONSTRAINT "game_opponent_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_squads"
    ADD CONSTRAINT "game_squads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_stats_live"
    ADD CONSTRAINT "game_stats_live_game_id_player_id_key" UNIQUE ("game_id", "player_id");



ALTER TABLE ONLY "public"."game_stats_live"
    ADD CONSTRAINT "game_stats_live_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gdpr_purge_audit"
    ADD CONSTRAINT "gdpr_purge_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grounds"
    ADD CONSTRAINT "grounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_unique_number_per_club" UNIQUE ("club_id", "invoice_number");



ALTER TABLE ONLY "public"."kit_pieces"
    ADD CONSTRAINT "kit_pieces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lineup_corrections_log"
    ADD CONSTRAINT "lineup_corrections_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matchdays"
    ADD CONSTRAINT "matchdays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."microciclos"
    ADD CONSTRAINT "microciclos_age_group_id_week_start_date_key" UNIQUE ("age_group_id", "week_start_date");



ALTER TABLE ONLY "public"."microciclos"
    ADD CONSTRAINT "microciclos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_recipients"
    ADD CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("notification_id", "user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opponents"
    ADD CONSTRAINT "opponents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_age_group_eligibility"
    ADD CONSTRAINT "player_age_group_eligibility_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_age_group_eligibility"
    ADD CONSTRAINT "player_age_group_eligibility_player_id_age_group_id_key" UNIQUE ("player_id", "age_group_id");



ALTER TABLE ONLY "public"."player_behavioral_assessments"
    ADD CONSTRAINT "player_behavioral_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_documents"
    ADD CONSTRAINT "player_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_registrations"
    ADD CONSTRAINT "player_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pse_records"
    ADD CONSTRAINT "pse_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_rate_limit_counters"
    ADD CONSTRAINT "public_rate_limit_counters_pkey" PRIMARY KEY ("scope", "scope_key", "window_start");



ALTER TABLE ONLY "public"."public_share_tokens"
    ADD CONSTRAINT "public_share_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."season_objectives"
    ADD CONSTRAINT "season_objectives_age_group_id_season_key" UNIQUE ("age_group_id", "season");



ALTER TABLE ONLY "public"."season_objectives"
    ADD CONSTRAINT "season_objectives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_permissions"
    ADD CONSTRAINT "staff_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_permissions"
    ADD CONSTRAINT "staff_permissions_staff_id_area_key" UNIQUE ("staff_id", "area");



ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_staff"
    ADD CONSTRAINT "team_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_staff"
    ADD CONSTRAINT "team_staff_team_id_profile_id_key" UNIQUE ("team_id", "profile_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_attendance"
    ADD CONSTRAINT "training_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_attendance"
    ADD CONSTRAINT "training_attendance_training_session_id_player_id_key" UNIQUE ("training_session_id", "player_id");



ALTER TABLE ONLY "public"."training_phase_exercises"
    ADD CONSTRAINT "training_phase_exercises_phase_id_exercise_order_key" UNIQUE ("phase_id", "exercise_order");



ALTER TABLE ONLY "public"."training_phase_exercises"
    ADD CONSTRAINT "training_phase_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_phases"
    ADD CONSTRAINT "training_phases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_phases"
    ADD CONSTRAINT "training_phases_training_session_id_phase_order_key" UNIQUE ("training_session_id", "phase_order");



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_training_id_session_date_key" UNIQUE ("training_id", "session_date");



ALTER TABLE ONLY "public"."trainings"
    ADD CONSTRAINT "trainings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id");



CREATE INDEX "age_group_club_rehome_audit_new_club_idx" ON "public"."age_group_club_rehome_audit" USING "btree" ("new_club_id");



CREATE INDEX "age_group_staff_age_group_id_idx" ON "public"."age_group_staff" USING "btree" ("age_group_id");



CREATE INDEX "age_group_staff_club_id_idx" ON "public"."age_group_staff" USING "btree" ("club_id");



CREATE INDEX "age_group_staff_linked_team_id_idx" ON "public"."age_group_staff" USING "btree" ("linked_team_id");



CREATE INDEX "age_group_staff_profile_id_idx" ON "public"."age_group_staff" USING "btree" ("profile_id");



CREATE INDEX "age_groups_club_id_idx" ON "public"."age_groups" USING "btree" ("club_id");



CREATE INDEX "age_groups_coordinator_id_idx" ON "public"."age_groups" USING "btree" ("coordinator_id");



CREATE UNIQUE INDEX "age_groups_public_slug_unique_idx" ON "public"."age_groups" USING "btree" ("public_slug") WHERE ("public_slug" IS NOT NULL);



CREATE INDEX "audit_logs_actor_created_idx" ON "public"."audit_logs" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "audit_logs_game_created_idx" ON "public"."audit_logs" USING "btree" ("game_id", "created_at" DESC);



CREATE UNIQUE INDEX "beta_invites_email_unique_idx" ON "public"."beta_invites" USING "btree" ("email");



CREATE INDEX "beta_invites_invite_type_status_idx" ON "public"."beta_invites" USING "btree" ("invite_type", "status");



CREATE INDEX "beta_invites_target_age_group_idx" ON "public"."beta_invites" USING "btree" ("target_age_group_id");



CREATE INDEX "club_memberships_club_id_idx" ON "public"."club_memberships" USING "btree" ("club_id");



CREATE INDEX "club_memberships_profile_id_idx" ON "public"."club_memberships" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "clubs_stripe_customer_id_unique" ON "public"."clubs" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE UNIQUE INDEX "clubs_stripe_subscription_id_unique" ON "public"."clubs" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "clubs_trial_ends_at_idx" ON "public"."clubs" USING "btree" ("trial_ends_at") WHERE ("trial_reminder_sent_at" IS NULL);



CREATE INDEX "competitions_club_id_idx" ON "public"."competitions" USING "btree" ("club_id");



CREATE INDEX "competitions_club_team_idx" ON "public"."competitions" USING "btree" ("club_id", "team_id");



CREATE INDEX "convocation_players_club_convocation_idx" ON "public"."convocation_players" USING "btree" ("club_id", "convocation_id");



CREATE INDEX "convocation_players_club_id_idx" ON "public"."convocation_players" USING "btree" ("club_id");



CREATE INDEX "convocation_players_player_id_idx" ON "public"."convocation_players" USING "btree" ("player_id");



CREATE INDEX "convocations_club_game_idx" ON "public"."convocations" USING "btree" ("club_id", "game_id");



CREATE INDEX "convocations_club_id_idx" ON "public"."convocations" USING "btree" ("club_id");



CREATE UNIQUE INDEX "device_push_tokens_token_active_idx" ON "public"."device_push_tokens" USING "btree" ("token") WHERE ("revoked_at" IS NULL);



CREATE INDEX "device_push_tokens_user_active_seen_idx" ON "public"."device_push_tokens" USING "btree" ("user_id", "last_seen_at" DESC) WHERE ("revoked_at" IS NULL);



CREATE INDEX "exercises_age_group_id_idx" ON "public"."exercises" USING "btree" ("age_group_id");



CREATE INDEX "exercises_club_id_category_idx" ON "public"."exercises" USING "btree" ("club_id", "category");



CREATE INDEX "exercises_club_id_idx" ON "public"."exercises" USING "btree" ("club_id");



CREATE INDEX "external_player_convocations_club_id_idx" ON "public"."external_player_convocations" USING "btree" ("club_id");



CREATE INDEX "external_player_convocations_game_id_idx" ON "public"."external_player_convocations" USING "btree" ("game_id", "created_at");



CREATE INDEX "game_events_club_game_idx" ON "public"."game_events" USING "btree" ("club_id", "game_id");



CREATE INDEX "game_events_club_id_idx" ON "public"."game_events" USING "btree" ("club_id");



CREATE INDEX "game_events_external_player_convocation_id_idx" ON "public"."game_events" USING "btree" ("external_player_convocation_id");



CREATE INDEX "game_events_external_related_player_convocation_id_idx" ON "public"."game_events" USING "btree" ("external_related_player_convocation_id");



CREATE INDEX "game_events_game_squad_id_idx" ON "public"."game_events" USING "btree" ("game_squad_id");



CREATE INDEX "game_events_player_id_idx" ON "public"."game_events" USING "btree" ("player_id");



CREATE INDEX "game_events_related_player_id_idx" ON "public"."game_events" USING "btree" ("related_player_id");



CREATE INDEX "game_final_stats_club_game_idx" ON "public"."game_final_stats" USING "btree" ("club_id", "game_id");



CREATE INDEX "game_final_stats_club_id_idx" ON "public"."game_final_stats" USING "btree" ("club_id");



CREATE INDEX "game_final_stats_player_id_idx" ON "public"."game_final_stats" USING "btree" ("player_id");



CREATE INDEX "game_live_checkpoints_club_game_idx" ON "public"."game_live_checkpoints" USING "btree" ("club_id", "game_id");



CREATE INDEX "game_live_checkpoints_club_id_idx" ON "public"."game_live_checkpoints" USING "btree" ("club_id");



CREATE INDEX "game_squads_club_id_idx" ON "public"."game_squads" USING "btree" ("club_id");



CREATE INDEX "game_squads_game_id_idx" ON "public"."game_squads" USING "btree" ("game_id");



CREATE UNIQUE INDEX "game_squads_one_mvp_per_game" ON "public"."game_squads" USING "btree" ("game_id") WHERE ("is_mvp" = true);



CREATE INDEX "game_squads_player_id_idx" ON "public"."game_squads" USING "btree" ("player_id");



CREATE UNIQUE INDEX "game_squads_unique_player" ON "public"."game_squads" USING "btree" ("game_id", "player_id") WHERE ("player_id" IS NOT NULL);



CREATE INDEX "game_stats_live_club_game_idx" ON "public"."game_stats_live" USING "btree" ("club_id", "game_id");



CREATE INDEX "game_stats_live_club_id_idx" ON "public"."game_stats_live" USING "btree" ("club_id");



CREATE INDEX "game_stats_live_player_id_idx" ON "public"."game_stats_live" USING "btree" ("player_id");



CREATE INDEX "games_club_id_idx" ON "public"."games" USING "btree" ("club_id");



CREATE INDEX "games_club_team_idx" ON "public"."games" USING "btree" ("club_id", "team_id");



CREATE INDEX "idx_age_group_categories_club" ON "public"."age_group_categories" USING "btree" ("club_id");



CREATE INDEX "idx_age_groups_category" ON "public"."age_groups" USING "btree" ("category_id");



CREATE INDEX "idx_game_live_checkpoints_updated_at" ON "public"."game_live_checkpoints" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_games_opponent_id" ON "public"."games" USING "btree" ("opponent_id");



CREATE INDEX "idx_goo_club_id" ON "public"."game_opponent_observations" USING "btree" ("club_id");



CREATE INDEX "idx_goo_game_id" ON "public"."game_opponent_observations" USING "btree" ("game_id");



CREATE INDEX "idx_goo_not_promoted" ON "public"."game_opponent_observations" USING "btree" ("opponent_id") WHERE ("promoted_to_opponent_at" IS NULL);



CREATE INDEX "idx_goo_opponent_id" ON "public"."game_opponent_observations" USING "btree" ("opponent_id");



CREATE INDEX "idx_lineup_corrections_game" ON "public"."lineup_corrections_log" USING "btree" ("game_id");



CREATE INDEX "idx_lineup_corrections_user" ON "public"."lineup_corrections_log" USING "btree" ("corrected_by");



CREATE INDEX "idx_opponents_age_group_id" ON "public"."opponents" USING "btree" ("age_group_id");



CREATE INDEX "idx_opponents_club_id" ON "public"."opponents" USING "btree" ("club_id");



CREATE INDEX "idx_opponents_competition_id" ON "public"."opponents" USING "btree" ("competition_id");



CREATE INDEX "idx_player_eligibility_age_group" ON "public"."player_age_group_eligibility" USING "btree" ("age_group_id");



CREATE INDEX "idx_player_eligibility_club" ON "public"."player_age_group_eligibility" USING "btree" ("club_id");



CREATE INDEX "idx_player_eligibility_player" ON "public"."player_age_group_eligibility" USING "btree" ("player_id");



CREATE INDEX "idx_players_primary_age_group" ON "public"."players" USING "btree" ("primary_age_group_id") WHERE ("primary_age_group_id" IS NOT NULL);



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_staff_invites_code" ON "public"."staff_invites" USING "btree" ("invite_code");



CREATE INDEX "idx_staff_invites_email" ON "public"."staff_invites" USING "btree" ("email");



CREATE INDEX "idx_staff_permissions_age_group" ON "public"."staff_permissions" USING "btree" ("age_group_id") WHERE ("age_group_id" IS NOT NULL);



CREATE INDEX "idx_team_staff_team_id" ON "public"."team_staff" USING "btree" ("team_id");



CREATE INDEX "invoices_club_id_idx" ON "public"."invoices" USING "btree" ("club_id");



CREATE INDEX "invoices_issued_at_idx" ON "public"."invoices" USING "btree" ("issued_at" DESC);



CREATE INDEX "invoices_status_due_idx" ON "public"."invoices" USING "btree" ("status", "due_date");



CREATE INDEX "kit_pieces_club_id_idx" ON "public"."kit_pieces" USING "btree" ("club_id");



CREATE INDEX "kit_pieces_club_team_idx" ON "public"."kit_pieces" USING "btree" ("club_id", "team_id");



CREATE INDEX "microciclos_age_group_week_idx" ON "public"."microciclos" USING "btree" ("age_group_id", "week_start_date");



CREATE INDEX "notification_recipients_notification_id_idx" ON "public"."notification_recipients" USING "btree" ("notification_id");



CREATE INDEX "notification_recipients_user_created_active_idx" ON "public"."notification_recipients" USING "btree" ("user_id", "created_at" DESC) WHERE ("cleared_at" IS NULL);



CREATE INDEX "notification_recipients_user_unread_active_idx" ON "public"."notification_recipients" USING "btree" ("user_id", "created_at" DESC) WHERE (("cleared_at" IS NULL) AND ("read_at" IS NULL));



CREATE INDEX "notifications_club_id_idx" ON "public"."notifications" USING "btree" ("club_id");



CREATE INDEX "notifications_club_user_created_idx" ON "public"."notifications" USING "btree" ("club_id", "user_id", "created_at" DESC);



CREATE INDEX "notifications_created_at_desc_idx" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "notifications_type_created_at_desc_idx" ON "public"."notifications" USING "btree" ("type", "created_at" DESC);



CREATE INDEX "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notifications_user_unread_idx" ON "public"."notifications" USING "btree" ("user_id", "read_at", "created_at" DESC);



CREATE UNIQUE INDEX "opponents_name_age_group_unique_ci" ON "public"."opponents" USING "btree" ("lower"(TRIM(BOTH FROM "name")), "age_group_id");



COMMENT ON INDEX "public"."opponents_name_age_group_unique_ci" IS 'Garante unicidade case-insensitive e trim-insensitive de (name, age_group_id). Substitui constraint UNIQUE simples para prevenir duplicados como "Casa Pia" vs "casa pia".';



CREATE INDEX "player_behavioral_assessments_club_id_idx" ON "public"."player_behavioral_assessments" USING "btree" ("club_id");



CREATE INDEX "player_behavioral_assessments_player_id_season_idx" ON "public"."player_behavioral_assessments" USING "btree" ("player_id", "season");



CREATE INDEX "player_documents_club_id_status_idx" ON "public"."player_documents" USING "btree" ("club_id", "status");



CREATE INDEX "player_documents_player_id_idx" ON "public"."player_documents" USING "btree" ("player_id");



CREATE INDEX "player_registrations_club_id_idx" ON "public"."player_registrations" USING "btree" ("club_id");



CREATE INDEX "player_registrations_player_id_season_idx" ON "public"."player_registrations" USING "btree" ("player_id", "season");



CREATE INDEX "player_registrations_team_id_idx" ON "public"."player_registrations" USING "btree" ("team_id");



CREATE INDEX "players_club_age_group_idx" ON "public"."players" USING "btree" ("club_id", "age_group_id");



CREATE INDEX "players_club_id_idx" ON "public"."players" USING "btree" ("club_id");



CREATE INDEX "profiles_email_lookup_idx" ON "public"."profiles" USING "btree" ("lower"("email"));



CREATE UNIQUE INDEX "profiles_single_super_idx" ON "public"."profiles" USING "btree" ((1)) WHERE ("is_super_coordinator" = true);



CREATE INDEX "pse_records_club_game_idx" ON "public"."pse_records" USING "btree" ("club_id", "game_id");



CREATE INDEX "pse_records_club_id_idx" ON "public"."pse_records" USING "btree" ("club_id");



CREATE INDEX "pse_records_club_training_session_idx" ON "public"."pse_records" USING "btree" ("club_id", "training_session_id");



CREATE INDEX "public_rate_limit_counters_window_idx" ON "public"."public_rate_limit_counters" USING "btree" ("window_start");



CREATE UNIQUE INDEX "public_share_tokens_active_age_group_unique_idx" ON "public"."public_share_tokens" USING "btree" ("age_group_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "public_share_tokens_age_group_idx" ON "public"."public_share_tokens" USING "btree" ("age_group_id");



CREATE INDEX "public_share_tokens_token_hash_active_idx" ON "public"."public_share_tokens" USING "btree" ("token_hash") WHERE ("revoked_at" IS NULL);



CREATE UNIQUE INDEX "public_share_tokens_token_hash_unique_idx" ON "public"."public_share_tokens" USING "btree" ("token_hash");



CREATE INDEX "push_subscriptions_active_endpoint_idx" ON "public"."push_subscriptions" USING "btree" ("endpoint") WHERE ("revoked_at" IS NULL);



CREATE INDEX "push_subscriptions_last_seen_idx" ON "public"."push_subscriptions" USING "btree" ("last_seen_at" DESC);



CREATE INDEX "push_subscriptions_user_active_idx" ON "public"."push_subscriptions" USING "btree" ("user_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "push_subscriptions_user_active_seen_idx" ON "public"."push_subscriptions" USING "btree" ("user_id", "last_seen_at" DESC) WHERE ("revoked_at" IS NULL);



CREATE INDEX "season_objectives_club_id_idx" ON "public"."season_objectives" USING "btree" ("club_id");



CREATE INDEX "staff_invites_club_age_group_idx" ON "public"."staff_invites" USING "btree" ("club_id", "age_group_id");



CREATE INDEX "staff_invites_club_id_idx" ON "public"."staff_invites" USING "btree" ("club_id");



CREATE INDEX "staff_permissions_club_id_idx" ON "public"."staff_permissions" USING "btree" ("club_id");



CREATE INDEX "staff_permissions_staff_id_area_idx" ON "public"."staff_permissions" USING "btree" ("staff_id", "area");



CREATE INDEX "staff_permissions_staff_id_idx" ON "public"."staff_permissions" USING "btree" ("staff_id");



CREATE INDEX "stripe_webhook_events_processed_at_idx" ON "public"."stripe_webhook_events" USING "btree" ("processed_at" DESC);



CREATE INDEX "stripe_webhook_events_type_idx" ON "public"."stripe_webhook_events" USING "btree" ("type");



CREATE INDEX "team_staff_club_id_idx" ON "public"."team_staff" USING "btree" ("club_id");



CREATE INDEX "team_staff_club_profile_idx" ON "public"."team_staff" USING "btree" ("club_id", "profile_id");



CREATE INDEX "team_staff_profile_id_idx" ON "public"."team_staff" USING "btree" ("profile_id");



CREATE INDEX "teams_club_id_idx" ON "public"."teams" USING "btree" ("club_id");



CREATE INDEX "training_attendance_club_id_idx" ON "public"."training_attendance" USING "btree" ("club_id");



CREATE INDEX "training_attendance_club_training_session_idx" ON "public"."training_attendance" USING "btree" ("club_id", "training_session_id");



CREATE INDEX "training_phase_exercises_club_id_idx" ON "public"."training_phase_exercises" USING "btree" ("club_id");



CREATE INDEX "training_phase_exercises_exercise_id_idx" ON "public"."training_phase_exercises" USING "btree" ("exercise_id");



CREATE INDEX "training_phase_exercises_phase_id_idx" ON "public"."training_phase_exercises" USING "btree" ("phase_id");



CREATE INDEX "training_phases_club_id_idx" ON "public"."training_phases" USING "btree" ("club_id");



CREATE INDEX "training_phases_training_session_id_idx" ON "public"."training_phases" USING "btree" ("training_session_id");



CREATE INDEX "training_sessions_club_id_idx" ON "public"."training_sessions" USING "btree" ("club_id");



CREATE INDEX "training_sessions_club_id_ut_number_idx" ON "public"."training_sessions" USING "btree" ("club_id", "ut_number");



CREATE INDEX "training_sessions_club_id_week_start_date_idx" ON "public"."training_sessions" USING "btree" ("club_id", "week_start_date");



CREATE INDEX "training_sessions_club_team_idx" ON "public"."training_sessions" USING "btree" ("club_id", "team_id");



CREATE OR REPLACE TRIGGER "game_final_stats_set_updated_at" BEFORE UPDATE ON "public"."game_final_stats" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "game_squads_immutable_initial_lineup" BEFORE UPDATE ON "public"."game_squads" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_initial_lineup_immutability"();



CREATE OR REPLACE TRIGGER "game_squads_set_updated_at" BEFORE UPDATE ON "public"."game_squads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "game_squads_sync_club_id" BEFORE INSERT OR UPDATE OF "game_id" ON "public"."game_squads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_domain_refs"();



CREATE OR REPLACE TRIGGER "invoices_set_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "players_set_updated_at" BEFORE UPDATE ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_game_opponent_observations" BEFORE UPDATE ON "public"."game_opponent_observations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_opponents" BEFORE UPDATE ON "public"."opponents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_age_group_staff_assign_validate_refs" BEFORE INSERT OR UPDATE OF "age_group_id", "club_id", "linked_team_id" ON "public"."age_group_staff" FOR EACH ROW EXECUTE FUNCTION "public"."age_group_staff_assign_validate_refs"();



CREATE OR REPLACE TRIGGER "trg_age_group_staff_set_updated_at" BEFORE UPDATE ON "public"."age_group_staff" FOR EACH ROW EXECUTE FUNCTION "public"."age_group_staff_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_age_group_staff_sync_club_membership" AFTER INSERT OR DELETE OR UPDATE ON "public"."age_group_staff" FOR EACH ROW EXECUTE FUNCTION "public"."age_group_staff_sync_club_membership"();



CREATE OR REPLACE TRIGGER "trg_age_group_staff_sync_team_staff" AFTER INSERT OR DELETE OR UPDATE ON "public"."age_group_staff" FOR EACH ROW EXECUTE FUNCTION "public"."sync_age_group_staff_to_team_staff"();



CREATE OR REPLACE TRIGGER "trg_age_groups_assign_club_id" BEFORE INSERT OR UPDATE OF "club_id" ON "public"."age_groups" FOR EACH ROW EXECUTE FUNCTION "public"."age_groups_assign_club_id"();



CREATE OR REPLACE TRIGGER "trg_age_groups_sync_coordinator_membership" AFTER INSERT OR UPDATE OF "coordinator_id", "club_id" ON "public"."age_groups" FOR EACH ROW EXECUTE FUNCTION "public"."age_groups_sync_coordinator_membership"();



CREATE OR REPLACE TRIGGER "trg_competitions_sync_club_id" BEFORE INSERT OR UPDATE OF "team_id", "club_id" ON "public"."competitions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_team_ref"();



CREATE OR REPLACE TRIGGER "trg_convocation_players_sync_club_id" BEFORE INSERT OR UPDATE ON "public"."convocation_players" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_domain_refs"();



CREATE OR REPLACE TRIGGER "trg_convocations_sync_club_id" BEFORE INSERT OR UPDATE ON "public"."convocations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_domain_refs"();



CREATE OR REPLACE TRIGGER "trg_exercises_assign_club_id" BEFORE INSERT OR UPDATE OF "age_group_id", "club_id" ON "public"."exercises" FOR EACH ROW EXECUTE FUNCTION "public"."exercises_assign_club_id"();



CREATE OR REPLACE TRIGGER "trg_exercises_set_updated_at" BEFORE UPDATE ON "public"."exercises" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_external_player_convocations_sync_club_id" BEFORE INSERT OR UPDATE ON "public"."external_player_convocations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_domain_refs"();



CREATE OR REPLACE TRIGGER "trg_game_events_sync_club_id" BEFORE INSERT OR UPDATE ON "public"."game_events" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_domain_refs"();



CREATE OR REPLACE TRIGGER "trg_game_final_stats_sync_club_id" BEFORE INSERT OR UPDATE ON "public"."game_final_stats" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_domain_refs"();



CREATE OR REPLACE TRIGGER "trg_game_live_checkpoints_sync_club_id" BEFORE INSERT OR UPDATE ON "public"."game_live_checkpoints" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_domain_refs"();



CREATE OR REPLACE TRIGGER "trg_game_stats_live_sync_club_id" BEFORE INSERT OR UPDATE ON "public"."game_stats_live" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_domain_refs"();



CREATE OR REPLACE TRIGGER "trg_games_sync_club_id" BEFORE INSERT OR UPDATE OF "team_id", "age_group_id", "club_id" ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_team_or_age_group_ref"();



CREATE OR REPLACE TRIGGER "trg_kit_pieces_sync_club_id" BEFORE INSERT OR UPDATE OF "team_id", "club_id" ON "public"."kit_pieces" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_team_ref"();



CREATE OR REPLACE TRIGGER "trg_microciclos_assign_club_id" BEFORE INSERT OR UPDATE OF "age_group_id", "club_id" ON "public"."microciclos" FOR EACH ROW EXECUTE FUNCTION "public"."microciclos_assign_club_id"();



CREATE OR REPLACE TRIGGER "trg_microciclos_set_updated_at" BEFORE UPDATE ON "public"."microciclos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_notifications_sync_club_id" BEFORE INSERT OR UPDATE OF "team_id", "age_group_id", "club_id" ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_team_or_age_group_ref"();



CREATE OR REPLACE TRIGGER "trg_player_behavioral_assessments_assign_club_id" BEFORE INSERT OR UPDATE OF "player_id", "club_id" ON "public"."player_behavioral_assessments" FOR EACH ROW EXECUTE FUNCTION "public"."player_behavioral_assessments_assign_club_id"();



CREATE OR REPLACE TRIGGER "trg_player_behavioral_assessments_set_updated_at" BEFORE UPDATE ON "public"."player_behavioral_assessments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_player_documents_assign_club_id" BEFORE INSERT OR UPDATE OF "player_id", "club_id" ON "public"."player_documents" FOR EACH ROW EXECUTE FUNCTION "public"."player_documents_assign_club_id"();



CREATE OR REPLACE TRIGGER "trg_player_documents_set_updated_at" BEFORE UPDATE ON "public"."player_documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_player_registrations_assign_validate_club_id" BEFORE INSERT OR UPDATE OF "player_id", "team_id", "club_id" ON "public"."player_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."player_registrations_assign_validate_club_id"();



CREATE OR REPLACE TRIGGER "trg_player_registrations_set_updated_at" BEFORE UPDATE ON "public"."player_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_players_sync_club_id" BEFORE INSERT OR UPDATE OF "age_group_id", "club_id" ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_age_group_ref"();



CREATE OR REPLACE TRIGGER "trg_profiles_auto_default_club_membership" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_auto_default_club_membership"();



CREATE OR REPLACE TRIGGER "trg_profiles_guard_super_coordinator" BEFORE INSERT OR UPDATE OF "email", "is_super_coordinator" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_guard_super_coordinator"();



CREATE OR REPLACE TRIGGER "trg_pse_records_sync_club_id" BEFORE INSERT OR UPDATE ON "public"."pse_records" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_domain_refs"();



CREATE OR REPLACE TRIGGER "trg_season_objectives_assign_club_id" BEFORE INSERT OR UPDATE OF "age_group_id", "club_id" ON "public"."season_objectives" FOR EACH ROW EXECUTE FUNCTION "public"."season_objectives_assign_club_id"();



CREATE OR REPLACE TRIGGER "trg_season_objectives_set_updated_at" BEFORE UPDATE ON "public"."season_objectives" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_staff_invites_sync_club_id" BEFORE INSERT OR UPDATE OF "age_group_id", "club_id" ON "public"."staff_invites" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_age_group_ref"();



CREATE OR REPLACE TRIGGER "trg_staff_permissions_assign_club_id" BEFORE INSERT OR UPDATE OF "staff_id", "club_id" ON "public"."staff_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."staff_permissions_assign_club_id"();



CREATE OR REPLACE TRIGGER "trg_staff_permissions_set_updated_at" BEFORE UPDATE ON "public"."staff_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_team_staff_normalize_role_v2" BEFORE INSERT OR UPDATE OF "role" ON "public"."team_staff" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_team_staff_role_v2"();



CREATE OR REPLACE TRIGGER "trg_team_staff_projection_only_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."team_staff" FOR EACH ROW EXECUTE FUNCTION "public"."guard_team_staff_projection_only"();



CREATE OR REPLACE TRIGGER "trg_team_staff_sync_club_id" BEFORE INSERT OR UPDATE OF "team_id", "club_id" ON "public"."team_staff" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_team_ref"();



CREATE OR REPLACE TRIGGER "trg_teams_assign_validate_club_id" BEFORE INSERT OR UPDATE OF "age_group_id", "club_id" ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."teams_assign_validate_club_id"();



CREATE OR REPLACE TRIGGER "trg_training_attendance_sync_club_id" BEFORE INSERT OR UPDATE ON "public"."training_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_domain_refs"();



CREATE OR REPLACE TRIGGER "trg_training_phase_exercises_assign_validate_club_id" BEFORE INSERT OR UPDATE OF "phase_id", "exercise_id", "club_id" ON "public"."training_phase_exercises" FOR EACH ROW EXECUTE FUNCTION "public"."training_phase_exercises_assign_validate_club_id"();



CREATE OR REPLACE TRIGGER "trg_training_phases_assign_club_id" BEFORE INSERT OR UPDATE OF "training_session_id", "club_id" ON "public"."training_phases" FOR EACH ROW EXECUTE FUNCTION "public"."training_phases_assign_club_id"();



CREATE OR REPLACE TRIGGER "trg_training_phases_set_updated_at" BEFORE UPDATE ON "public"."training_phases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_training_sessions_sync_club_id" BEFORE INSERT OR UPDATE OF "team_id", "age_group_id", "club_id" ON "public"."training_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_club_id_from_team_or_age_group_ref"();



ALTER TABLE ONLY "public"."age_group_categories"
    ADD CONSTRAINT "age_group_categories_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."age_group_staff"
    ADD CONSTRAINT "age_group_staff_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."age_group_staff"
    ADD CONSTRAINT "age_group_staff_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."age_group_staff"
    ADD CONSTRAINT "age_group_staff_linked_team_id_fkey" FOREIGN KEY ("linked_team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."age_group_staff"
    ADD CONSTRAINT "age_group_staff_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."age_groups"
    ADD CONSTRAINT "age_groups_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."age_group_categories"("id");



ALTER TABLE ONLY "public"."age_groups"
    ADD CONSTRAINT "age_groups_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."age_groups"
    ADD CONSTRAINT "age_groups_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_invites"
    ADD CONSTRAINT "beta_invites_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."beta_invites"
    ADD CONSTRAINT "beta_invites_target_age_group_id_fkey" FOREIGN KEY ("target_age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."club_memberships"
    ADD CONSTRAINT "club_memberships_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."club_memberships"
    ADD CONSTRAINT "club_memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."convocation_players"
    ADD CONSTRAINT "convocation_players_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."convocation_players"
    ADD CONSTRAINT "convocation_players_convocation_id_fkey" FOREIGN KEY ("convocation_id") REFERENCES "public"."convocations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."convocation_players"
    ADD CONSTRAINT "convocation_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."convocations"
    ADD CONSTRAINT "convocations_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."convocations"
    ADD CONSTRAINT "convocations_fp_jersey_kit_id_fkey" FOREIGN KEY ("fp_jersey_kit_id") REFERENCES "public"."kit_pieces"("id");



ALTER TABLE ONLY "public"."convocations"
    ADD CONSTRAINT "convocations_fp_shorts_kit_id_fkey" FOREIGN KEY ("fp_shorts_kit_id") REFERENCES "public"."kit_pieces"("id");



ALTER TABLE ONLY "public"."convocations"
    ADD CONSTRAINT "convocations_fp_socks_kit_id_fkey" FOREIGN KEY ("fp_socks_kit_id") REFERENCES "public"."kit_pieces"("id");



ALTER TABLE ONLY "public"."convocations"
    ADD CONSTRAINT "convocations_gk_jersey_kit_id_fkey" FOREIGN KEY ("gk_jersey_kit_id") REFERENCES "public"."kit_pieces"("id");



ALTER TABLE ONLY "public"."convocations"
    ADD CONSTRAINT "convocations_gk_shorts_kit_id_fkey" FOREIGN KEY ("gk_shorts_kit_id") REFERENCES "public"."kit_pieces"("id");



ALTER TABLE ONLY "public"."convocations"
    ADD CONSTRAINT "convocations_gk_socks_kit_id_fkey" FOREIGN KEY ("gk_socks_kit_id") REFERENCES "public"."kit_pieces"("id");



ALTER TABLE ONLY "public"."convocations"
    ADD CONSTRAINT "convocations_ground_id_fkey" FOREIGN KEY ("ground_id") REFERENCES "public"."grounds"("id");



ALTER TABLE ONLY "public"."device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."external_player_convocations"
    ADD CONSTRAINT "external_player_convocations_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_player_convocations"
    ADD CONSTRAINT "external_player_convocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."external_player_convocations"
    ADD CONSTRAINT "external_player_convocations_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_events"
    ADD CONSTRAINT "game_events_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_events"
    ADD CONSTRAINT "game_events_external_player_convocation_id_fkey" FOREIGN KEY ("external_player_convocation_id") REFERENCES "public"."game_squads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."game_events"
    ADD CONSTRAINT "game_events_external_related_player_convocation_id_fkey" FOREIGN KEY ("external_related_player_convocation_id") REFERENCES "public"."game_squads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."game_events"
    ADD CONSTRAINT "game_events_game_squad_id_fkey" FOREIGN KEY ("game_squad_id") REFERENCES "public"."game_squads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_events"
    ADD CONSTRAINT "game_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."game_events"
    ADD CONSTRAINT "game_events_related_game_squad_id_fkey" FOREIGN KEY ("related_game_squad_id") REFERENCES "public"."game_squads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."game_events"
    ADD CONSTRAINT "game_events_related_player_id_fkey" FOREIGN KEY ("related_player_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."game_final_stats"
    ADD CONSTRAINT "game_final_stats_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_final_stats"
    ADD CONSTRAINT "game_final_stats_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_final_stats"
    ADD CONSTRAINT "game_final_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_live_checkpoints"
    ADD CONSTRAINT "game_live_checkpoints_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_live_checkpoints"
    ADD CONSTRAINT "game_live_checkpoints_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_live_checkpoints"
    ADD CONSTRAINT "game_live_checkpoints_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."game_opponent_observations"
    ADD CONSTRAINT "game_opponent_observations_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_opponent_observations"
    ADD CONSTRAINT "game_opponent_observations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."game_opponent_observations"
    ADD CONSTRAINT "game_opponent_observations_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_opponent_observations"
    ADD CONSTRAINT "game_opponent_observations_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "public"."opponents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_opponent_observations"
    ADD CONSTRAINT "game_opponent_observations_promoted_by_fkey" FOREIGN KEY ("promoted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."game_squads"
    ADD CONSTRAINT "game_squads_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id");



ALTER TABLE ONLY "public"."game_squads"
    ADD CONSTRAINT "game_squads_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_squads"
    ADD CONSTRAINT "game_squads_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."game_squads"
    ADD CONSTRAINT "game_squads_source_age_group_id_fkey" FOREIGN KEY ("source_age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."game_stats_live"
    ADD CONSTRAINT "game_stats_live_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_stats_live"
    ADD CONSTRAINT "game_stats_live_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_kit_fp_jersey_id_fkey" FOREIGN KEY ("kit_fp_jersey_id") REFERENCES "public"."kit_pieces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_kit_fp_shorts_id_fkey" FOREIGN KEY ("kit_fp_shorts_id") REFERENCES "public"."kit_pieces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_kit_fp_socks_id_fkey" FOREIGN KEY ("kit_fp_socks_id") REFERENCES "public"."kit_pieces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_kit_gk_jersey_id_fkey" FOREIGN KEY ("kit_gk_jersey_id") REFERENCES "public"."kit_pieces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_kit_gk_shorts_id_fkey" FOREIGN KEY ("kit_gk_shorts_id") REFERENCES "public"."kit_pieces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_kit_gk_socks_id_fkey" FOREIGN KEY ("kit_gk_socks_id") REFERENCES "public"."kit_pieces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "public"."opponents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grounds"
    ADD CONSTRAINT "grounds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."kit_pieces"
    ADD CONSTRAINT "kit_pieces_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kit_pieces"
    ADD CONSTRAINT "kit_pieces_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lineup_corrections_log"
    ADD CONSTRAINT "lineup_corrections_log_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lineup_corrections_log"
    ADD CONSTRAINT "lineup_corrections_log_corrected_by_fkey" FOREIGN KEY ("corrected_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lineup_corrections_log"
    ADD CONSTRAINT "lineup_corrections_log_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lineup_corrections_log"
    ADD CONSTRAINT "lineup_corrections_log_game_squad_id_fkey" FOREIGN KEY ("game_squad_id") REFERENCES "public"."game_squads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lineup_corrections_log"
    ADD CONSTRAINT "lineup_corrections_log_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matchdays"
    ADD CONSTRAINT "matchdays_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matchdays"
    ADD CONSTRAINT "matchdays_ground_id_fkey" FOREIGN KEY ("ground_id") REFERENCES "public"."grounds"("id");



ALTER TABLE ONLY "public"."matchdays"
    ADD CONSTRAINT "matchdays_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "public"."opponents"("id");



ALTER TABLE ONLY "public"."microciclos"
    ADD CONSTRAINT "microciclos_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."microciclos"
    ADD CONSTRAINT "microciclos_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."microciclos"
    ADD CONSTRAINT "microciclos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_recipients"
    ADD CONSTRAINT "notification_recipients_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_recipients"
    ADD CONSTRAINT "notification_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opponents"
    ADD CONSTRAINT "opponents_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opponents"
    ADD CONSTRAINT "opponents_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opponents"
    ADD CONSTRAINT "opponents_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_age_group_eligibility"
    ADD CONSTRAINT "player_age_group_eligibility_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_age_group_eligibility"
    ADD CONSTRAINT "player_age_group_eligibility_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_age_group_eligibility"
    ADD CONSTRAINT "player_age_group_eligibility_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_behavioral_assessments"
    ADD CONSTRAINT "player_behavioral_assessments_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_behavioral_assessments"
    ADD CONSTRAINT "player_behavioral_assessments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_behavioral_assessments"
    ADD CONSTRAINT "player_behavioral_assessments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_documents"
    ADD CONSTRAINT "player_documents_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_documents"
    ADD CONSTRAINT "player_documents_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_documents"
    ADD CONSTRAINT "player_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_registrations"
    ADD CONSTRAINT "player_registrations_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_registrations"
    ADD CONSTRAINT "player_registrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_registrations"
    ADD CONSTRAINT "player_registrations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_registrations"
    ADD CONSTRAINT "player_registrations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_primary_age_group_id_fkey" FOREIGN KEY ("primary_age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pse_records"
    ADD CONSTRAINT "pse_records_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pse_records"
    ADD CONSTRAINT "pse_records_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pse_records"
    ADD CONSTRAINT "pse_records_training_session_id_fkey" FOREIGN KEY ("training_session_id") REFERENCES "public"."training_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_share_tokens"
    ADD CONSTRAINT "public_share_tokens_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_share_tokens"
    ADD CONSTRAINT "public_share_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."season_objectives"
    ADD CONSTRAINT "season_objectives_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."season_objectives"
    ADD CONSTRAINT "season_objectives_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."season_objectives"
    ADD CONSTRAINT "season_objectives_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_permissions"
    ADD CONSTRAINT "staff_permissions_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_permissions"
    ADD CONSTRAINT "staff_permissions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_permissions"
    ADD CONSTRAINT "staff_permissions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."age_group_staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_staff"
    ADD CONSTRAINT "team_staff_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_staff"
    ADD CONSTRAINT "team_staff_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_staff"
    ADD CONSTRAINT "team_staff_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_home_ground_id_fkey" FOREIGN KEY ("home_ground_id") REFERENCES "public"."grounds"("id");



ALTER TABLE ONLY "public"."training_attendance"
    ADD CONSTRAINT "training_attendance_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_attendance"
    ADD CONSTRAINT "training_attendance_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."training_attendance"
    ADD CONSTRAINT "training_attendance_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_attendance"
    ADD CONSTRAINT "training_attendance_training_session_id_fkey" FOREIGN KEY ("training_session_id") REFERENCES "public"."training_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_phase_exercises"
    ADD CONSTRAINT "training_phase_exercises_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_phase_exercises"
    ADD CONSTRAINT "training_phase_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."training_phase_exercises"
    ADD CONSTRAINT "training_phase_exercises_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."training_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_phases"
    ADD CONSTRAINT "training_phases_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_phases"
    ADD CONSTRAINT "training_phases_training_session_id_fkey" FOREIGN KEY ("training_session_id") REFERENCES "public"."training_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_age_group_id_fkey" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_ground_id_fkey" FOREIGN KEY ("ground_id") REFERENCES "public"."grounds"("id");



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trainings"
    ADD CONSTRAINT "trainings_ground_id_fkey" FOREIGN KEY ("ground_id") REFERENCES "public"."grounds"("id");



ALTER TABLE ONLY "public"."trainings"
    ADD CONSTRAINT "trainings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



CREATE POLICY "Age group access games" ON "public"."games" TO "authenticated" USING ((("age_group_id" IN ( SELECT "age_groups"."id"
   FROM "public"."age_groups"
  WHERE ("age_groups"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("team_id" IN ( SELECT "t"."id"
   FROM ("public"."teams" "t"
     JOIN "public"."age_groups" "ag" ON (("ag"."id" = "t"."age_group_id")))
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Age group access training sessions" ON "public"."training_sessions" TO "authenticated" USING ((("age_group_id" IN ( SELECT "age_groups"."id"
   FROM "public"."age_groups"
  WHERE ("age_groups"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("team_id" IN ( SELECT "t"."id"
   FROM ("public"."teams" "t"
     JOIN "public"."age_groups" "ag" ON (("ag"."id" = "t"."age_group_id")))
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Anyone can join waitlist" ON "public"."waitlist" FOR INSERT WITH CHECK (true);



CREATE POLICY "Coordinator manages invites" ON "public"."staff_invites" TO "authenticated" USING ((("age_group_id" IN ( SELECT "age_groups"."id"
   FROM "public"."age_groups"
  WHERE ("age_groups"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("invited_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Coordinators manage age groups" ON "public"."age_groups" TO "authenticated" USING (("coordinator_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Only authenticated users can read waitlist" ON "public"."waitlist" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



CREATE POLICY "Player access" ON "public"."players" TO "authenticated" USING (("age_group_id" IN ( SELECT "age_groups"."id"
   FROM "public"."age_groups"
  WHERE ("age_groups"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Team access" ON "public"."teams" TO "authenticated" USING ((("age_group_id" IN ( SELECT "age_groups"."id"
   FROM "public"."age_groups"
  WHERE ("age_groups"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("id" IN ( SELECT "team_staff"."team_id"
   FROM "public"."team_staff"
  WHERE ("team_staff"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Team access competitions" ON "public"."competitions" TO "authenticated" USING (("team_id" IN ( SELECT "t"."id"
   FROM ("public"."teams" "t"
     JOIN "public"."age_groups" "ag" ON (("ag"."id" = "t"."age_group_id")))
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Team access games" ON "public"."games" TO "authenticated" USING (("team_id" IN ( SELECT "t"."id"
   FROM ("public"."teams" "t"
     JOIN "public"."age_groups" "ag" ON (("ag"."id" = "t"."age_group_id")))
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("team_id" IN ( SELECT "t"."id"
   FROM ("public"."teams" "t"
     JOIN "public"."age_groups" "ag" ON (("ag"."id" = "t"."age_group_id")))
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Team access kits" ON "public"."kit_pieces" TO "authenticated" USING (("team_id" IN ( SELECT "t"."id"
   FROM ("public"."teams" "t"
     JOIN "public"."age_groups" "ag" ON (("ag"."id" = "t"."age_group_id")))
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Team access training_sessions" ON "public"."training_sessions" TO "authenticated" USING (("team_id" IN ( SELECT "t"."id"
   FROM ("public"."teams" "t"
     JOIN "public"."age_groups" "ag" ON (("ag"."id" = "t"."age_group_id")))
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("team_id" IN ( SELECT "t"."id"
   FROM ("public"."teams" "t"
     JOIN "public"."age_groups" "ag" ON (("ag"."id" = "t"."age_group_id")))
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Team access trainings" ON "public"."trainings" TO "authenticated" USING (("team_id" IN ( SELECT "t"."id"
   FROM ("public"."teams" "t"
     JOIN "public"."age_groups" "ag" ON (("ag"."id" = "t"."age_group_id")))
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."age_group_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."age_group_club_rehome_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."age_group_staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "age_group_staff_coordinator_delete_v1" ON "public"."age_group_staff" FOR DELETE TO "authenticated" USING ("public"."user_can_manage_age_group_v2"("age_group_id"));



CREATE POLICY "age_group_staff_coordinator_insert_v1" ON "public"."age_group_staff" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_can_manage_age_group_v2"("age_group_id") AND (EXISTS ( SELECT 1
   FROM "public"."age_groups" "ag"
  WHERE (("ag"."id" = "age_group_staff"."age_group_id") AND ("ag"."club_id" = "age_group_staff"."club_id"))))));



CREATE POLICY "age_group_staff_coordinator_update_v1" ON "public"."age_group_staff" FOR UPDATE TO "authenticated" USING ("public"."user_can_manage_age_group_v2"("age_group_id")) WITH CHECK (("public"."user_can_manage_age_group_v2"("age_group_id") AND (EXISTS ( SELECT 1
   FROM "public"."age_groups" "ag"
  WHERE (("ag"."id" = "age_group_staff"."age_group_id") AND ("ag"."club_id" = "age_group_staff"."club_id"))))));



CREATE POLICY "age_group_staff_domain_boundary_v2" ON "public"."age_group_staff" AS RESTRICTIVE TO "authenticated" USING ((("profile_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_can_access_age_group"("age_group_id"))) WITH CHECK (("public"."user_can_manage_age_group_v2"("age_group_id") AND (EXISTS ( SELECT 1
   FROM "public"."age_groups" "ag"
  WHERE (("ag"."id" = "age_group_staff"."age_group_id") AND ("ag"."club_id" = "age_group_staff"."club_id"))))));



CREATE POLICY "age_group_staff_select_v1" ON "public"."age_group_staff" FOR SELECT TO "authenticated" USING ((("profile_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_can_access_age_group_v2"("age_group_id")));



ALTER TABLE "public"."age_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "age_groups_club_delete_v1" ON "public"."age_groups" FOR DELETE TO "authenticated" USING ("public"."user_can_manage_age_group_v2"("id"));



CREATE POLICY "age_groups_club_insert_v1" ON "public"."age_groups" FOR INSERT TO "authenticated" WITH CHECK ((("coordinator_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_is_super_coordinator"()));



CREATE POLICY "age_groups_club_select_v1" ON "public"."age_groups" FOR SELECT TO "authenticated" USING ("public"."user_can_access_age_group_v2"("id"));



CREATE POLICY "age_groups_club_update_v1" ON "public"."age_groups" FOR UPDATE TO "authenticated" USING ("public"."user_can_manage_age_group_v2"("id")) WITH CHECK ("public"."user_can_manage_age_group_v2"("id"));



CREATE POLICY "anyone_can_read_invite_by_code" ON "public"."staff_invites" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



ALTER TABLE "public"."athlete_intake_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_can_insert_staff" ON "public"."team_staff" FOR INSERT TO "authenticated" WITH CHECK (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "authenticated_can_update_invite" ON "public"."staff_invites" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



ALTER TABLE "public"."beta_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "club_admins_can_update" ON "public"."clubs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."club_memberships"
  WHERE (("club_memberships"."club_id" = "clubs"."id") AND ("club_memberships"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("club_memberships"."role" = 'admin'::"text")))));



CREATE POLICY "club_members_can_read" ON "public"."clubs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."club_memberships"
  WHERE (("club_memberships"."club_id" = "clubs"."id") AND ("club_memberships"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "club_members_can_read_categories" ON "public"."age_group_categories" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."club_memberships"
  WHERE (("club_memberships"."club_id" = "age_group_categories"."club_id") AND ("club_memberships"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."club_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "club_memberships_admin_delete_v1" ON "public"."club_memberships" FOR DELETE USING ("public"."user_can_manage_club"("club_id"));



CREATE POLICY "club_memberships_admin_insert_v1" ON "public"."club_memberships" FOR INSERT WITH CHECK ("public"."user_can_manage_club"("club_id"));



CREATE POLICY "club_memberships_admin_update_v1" ON "public"."club_memberships" FOR UPDATE USING ("public"."user_can_manage_club"("club_id")) WITH CHECK ("public"."user_can_manage_club"("club_id"));



CREATE POLICY "club_memberships_own_select" ON "public"."club_memberships" FOR SELECT TO "authenticated" USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "club_memberships_self_or_admin_select_v1" ON "public"."club_memberships" FOR SELECT USING ((("profile_id" = "auth"."uid"()) OR "public"."user_can_manage_club"("club_id")));



ALTER TABLE "public"."clubs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clubs_member_select_v1" ON "public"."clubs" FOR SELECT USING ("public"."user_can_access_club"("id"));



CREATE POLICY "clubs_member_update_v1" ON "public"."clubs" FOR UPDATE USING ("public"."user_can_manage_club"("id")) WITH CHECK ("public"."user_can_manage_club"("id"));



CREATE POLICY "clubs_select_member" ON "public"."clubs" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."club_memberships" "cm"
  WHERE (("cm"."club_id" = "clubs"."id") AND ("cm"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."age_groups" "ag"
  WHERE (("ag"."club_id" = "ag"."id") AND ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."competitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competitions_delete_v1" ON "public"."competitions" FOR DELETE TO "authenticated" USING ("public"."user_can_access_team"("team_id"));



CREATE POLICY "competitions_domain_boundary_v2" ON "public"."competitions" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_access_team"("team_id")) WITH CHECK (("public"."user_can_access_team"("team_id") AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "competitions"."team_id") AND ("t"."club_id" = "competitions"."club_id"))))));



CREATE POLICY "competitions_insert_v1" ON "public"."competitions" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_access_team"("team_id"));



CREATE POLICY "competitions_select_v1" ON "public"."competitions" FOR SELECT TO "authenticated" USING ("public"."user_can_access_team"("team_id"));



CREATE POLICY "competitions_staff_delete_v1" ON "public"."competitions" FOR DELETE TO "authenticated" USING ("public"."user_can_access_team"("team_id"));



CREATE POLICY "competitions_staff_insert_v1" ON "public"."competitions" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_can_access_team"("team_id") AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "competitions"."team_id") AND ("t"."club_id" = "competitions"."club_id"))))));



CREATE POLICY "competitions_staff_select_v1" ON "public"."competitions" FOR SELECT TO "authenticated" USING ("public"."user_can_access_team"("team_id"));



CREATE POLICY "competitions_staff_update_v1" ON "public"."competitions" FOR UPDATE TO "authenticated" USING ("public"."user_can_access_team"("team_id")) WITH CHECK (("public"."user_can_access_team"("team_id") AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "competitions"."team_id") AND ("t"."club_id" = "competitions"."club_id"))))));



CREATE POLICY "competitions_update_v1" ON "public"."competitions" FOR UPDATE TO "authenticated" USING ("public"."user_can_access_team"("team_id")) WITH CHECK ("public"."user_can_access_team"("team_id"));



ALTER TABLE "public"."convocation_players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "convocation_players_domain_boundary_v2" ON "public"."convocation_players" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_access_convocation"("convocation_id")) WITH CHECK ("public"."user_can_access_convocation"("convocation_id"));



CREATE POLICY "convocation_players_read_v1" ON "public"."convocation_players" FOR SELECT TO "authenticated" USING ("public"."user_can_access_convocation"("convocation_id"));



CREATE POLICY "convocation_players_write_delete_v1" ON "public"."convocation_players" FOR DELETE TO "authenticated" USING ("public"."user_can_access_convocation"("convocation_id"));



CREATE POLICY "convocation_players_write_insert_v1" ON "public"."convocation_players" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_access_convocation"("convocation_id"));



CREATE POLICY "convocation_players_write_update_v1" ON "public"."convocation_players" FOR UPDATE TO "authenticated" USING ("public"."user_can_access_convocation"("convocation_id")) WITH CHECK ("public"."user_can_access_convocation"("convocation_id"));



ALTER TABLE "public"."convocations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "convocations_domain_boundary_v2" ON "public"."convocations" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_access_game"("game_id")) WITH CHECK ("public"."user_can_access_game"("game_id"));



CREATE POLICY "convocations_read_v1" ON "public"."convocations" FOR SELECT TO "authenticated" USING ("public"."user_can_access_game"("game_id"));



CREATE POLICY "convocations_write_delete_v1" ON "public"."convocations" FOR DELETE TO "authenticated" USING ("public"."user_can_write_game"("game_id"));



CREATE POLICY "convocations_write_insert_v1" ON "public"."convocations" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_game"("game_id"));



CREATE POLICY "convocations_write_update_v1" ON "public"."convocations" FOR UPDATE TO "authenticated" USING ("public"."user_can_write_game"("game_id")) WITH CHECK ("public"."user_can_write_game"("game_id"));



CREATE POLICY "coordenadores_gerem_elegibilidade" ON "public"."player_age_group_eligibility" TO "authenticated" USING (("club_id" IN ( SELECT "cm"."club_id"
   FROM "public"."club_memberships" "cm"
  WHERE ("cm"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))
UNION
 SELECT "ag"."club_id"
   FROM "public"."age_groups" "ag"
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("club_id" IN ( SELECT "cm"."club_id"
   FROM "public"."club_memberships" "cm"
  WHERE ("cm"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))
UNION
 SELECT "ag"."club_id"
   FROM "public"."age_groups" "ag"
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "coordinator_can_delete_invite" ON "public"."staff_invites" FOR DELETE TO "authenticated" USING (("age_group_id" IN ( SELECT "age_groups"."id"
   FROM "public"."age_groups"
  WHERE ("age_groups"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "coordinator_can_delete_staff" ON "public"."team_staff" FOR DELETE TO "authenticated" USING (("team_id" IN ( SELECT "age_groups"."id"
   FROM "public"."age_groups"
  WHERE ("age_groups"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "coordinator_can_insert_invite" ON "public"."staff_invites" FOR INSERT TO "authenticated" WITH CHECK (("age_group_id" IN ( SELECT "age_groups"."id"
   FROM "public"."age_groups"
  WHERE ("age_groups"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "coordinator_can_manage_invites" ON "public"."staff_invites" FOR SELECT TO "authenticated" USING (("age_group_id" IN ( SELECT "age_groups"."id"
   FROM "public"."age_groups"
  WHERE ("age_groups"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "coordinator_can_view_staff" ON "public"."team_staff" FOR SELECT TO "authenticated" USING (("team_id" IN ( SELECT "age_groups"."id"
   FROM "public"."age_groups"
  WHERE ("age_groups"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."device_push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "device_push_tokens_owner_delete_v1" ON "public"."device_push_tokens" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "device_push_tokens_owner_insert_v1" ON "public"."device_push_tokens" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "device_push_tokens_owner_select_v1" ON "public"."device_push_tokens" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "device_push_tokens_owner_update_v1" ON "public"."device_push_tokens" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercises_delete_v1" ON "public"."exercises" FOR DELETE TO "authenticated" USING ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "exercises_domain_boundary_v2" ON "public"."exercises" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id")) WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "exercises_insert_v1" ON "public"."exercises" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "exercises_select_v1" ON "public"."exercises" FOR SELECT TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id"));



CREATE POLICY "exercises_update_v1" ON "public"."exercises" FOR UPDATE TO "authenticated" USING ("public"."user_can_write_age_group_scope"("age_group_id", "club_id")) WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



ALTER TABLE "public"."external_player_convocations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "external_player_convocations_domain_boundary_v2" ON "public"."external_player_convocations" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_access_game"("game_id")) WITH CHECK ("public"."user_can_write_game"("game_id"));



CREATE POLICY "external_player_convocations_read_v1" ON "public"."external_player_convocations" FOR SELECT TO "authenticated" USING ("public"."user_can_access_game"("game_id"));



CREATE POLICY "external_player_convocations_write_delete_v1" ON "public"."external_player_convocations" FOR DELETE TO "authenticated" USING ("public"."user_can_write_game"("game_id"));



CREATE POLICY "external_player_convocations_write_insert_v1" ON "public"."external_player_convocations" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_game"("game_id"));



CREATE POLICY "external_player_convocations_write_update_v1" ON "public"."external_player_convocations" FOR UPDATE TO "authenticated" USING ("public"."user_can_write_game"("game_id")) WITH CHECK ("public"."user_can_write_game"("game_id"));



ALTER TABLE "public"."game_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_events_domain_boundary_v2" ON "public"."game_events" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_access_game"("game_id")) WITH CHECK ("public"."user_can_access_game"("game_id"));



CREATE POLICY "game_events_read_v1" ON "public"."game_events" FOR SELECT TO "authenticated" USING ("public"."user_can_access_game"("game_id"));



CREATE POLICY "game_events_write_delete_v1" ON "public"."game_events" FOR DELETE TO "authenticated" USING ("public"."user_can_write_game"("game_id"));



CREATE POLICY "game_events_write_insert_v1" ON "public"."game_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_game"("game_id"));



ALTER TABLE "public"."game_final_stats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_final_stats_domain_boundary_v2" ON "public"."game_final_stats" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_access_game"("game_id")) WITH CHECK ("public"."user_can_access_game"("game_id"));



CREATE POLICY "game_final_stats_read_v1" ON "public"."game_final_stats" FOR SELECT TO "authenticated" USING ("public"."user_can_access_game"("game_id"));



CREATE POLICY "game_final_stats_write_delete_v1" ON "public"."game_final_stats" FOR DELETE TO "authenticated" USING ("public"."user_is_game_coordinator"("game_id"));



ALTER TABLE "public"."game_live_checkpoints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_live_checkpoints_domain_boundary_v2" ON "public"."game_live_checkpoints" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_access_game"("game_id")) WITH CHECK ("public"."user_can_access_game"("game_id"));



CREATE POLICY "game_live_checkpoints_read_v1" ON "public"."game_live_checkpoints" FOR SELECT TO "authenticated" USING ("public"."user_can_access_game"("game_id"));



CREATE POLICY "game_live_checkpoints_write_delete_v1" ON "public"."game_live_checkpoints" FOR DELETE TO "authenticated" USING ("public"."user_is_game_coordinator"("game_id"));



CREATE POLICY "game_live_checkpoints_write_insert_v1" ON "public"."game_live_checkpoints" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_game"("game_id"));



CREATE POLICY "game_live_checkpoints_write_update_v1" ON "public"."game_live_checkpoints" FOR UPDATE TO "authenticated" USING ("public"."user_can_write_game"("game_id")) WITH CHECK ("public"."user_can_write_game"("game_id"));



ALTER TABLE "public"."game_opponent_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_squads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_squads_domain_boundary_v1" ON "public"."game_squads" TO "authenticated" USING ("public"."user_can_access_game"("game_id")) WITH CHECK ("public"."user_can_write_game"("game_id"));



CREATE POLICY "game_squads_read_v1" ON "public"."game_squads" FOR SELECT TO "authenticated" USING ("public"."user_can_access_game"("game_id"));



CREATE POLICY "game_squads_write_delete_v1" ON "public"."game_squads" FOR DELETE TO "authenticated" USING ("public"."user_is_game_coordinator"("game_id"));



CREATE POLICY "game_squads_write_insert_v1" ON "public"."game_squads" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_game"("game_id"));



CREATE POLICY "game_squads_write_update_v1" ON "public"."game_squads" FOR UPDATE TO "authenticated" USING ("public"."user_can_write_game"("game_id")) WITH CHECK ("public"."user_can_write_game"("game_id"));



ALTER TABLE "public"."game_stats_live" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_stats_live_domain_boundary_v2" ON "public"."game_stats_live" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_access_game"("game_id")) WITH CHECK ("public"."user_can_access_game"("game_id"));



CREATE POLICY "game_stats_live_read_v1" ON "public"."game_stats_live" FOR SELECT TO "authenticated" USING ("public"."user_can_access_game"("game_id"));



CREATE POLICY "game_stats_live_write_delete_v1" ON "public"."game_stats_live" FOR DELETE TO "authenticated" USING ("public"."user_is_game_coordinator"("game_id"));



CREATE POLICY "game_stats_live_write_insert_v1" ON "public"."game_stats_live" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_game"("game_id"));



CREATE POLICY "game_stats_live_write_update_v1" ON "public"."game_stats_live" FOR UPDATE TO "authenticated" USING ("public"."user_can_write_game"("game_id")) WITH CHECK ("public"."user_can_write_game"("game_id"));



ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "games_delete_v1" ON "public"."games" FOR DELETE TO "authenticated" USING ("public"."user_can_manage_age_group_v2"("age_group_id"));



CREATE POLICY "games_domain_boundary_v1" ON "public"."games" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id")) WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "games_domain_boundary_v2" ON "public"."games" AS RESTRICTIVE TO "authenticated" USING (((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id")))) WITH CHECK (((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id"))));



CREATE POLICY "games_insert_v1" ON "public"."games" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "games_select_v1" ON "public"."games" FOR SELECT TO "authenticated" USING ("public"."user_can_access_age_group"("age_group_id"));



CREATE POLICY "games_staff_delete_v1" ON "public"."games" FOR DELETE TO "authenticated" USING (((("team_id" IS NOT NULL) AND "public"."user_is_team_coordinator"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_is_age_group_coordinator"("age_group_id"))));



CREATE POLICY "games_staff_insert_v1" ON "public"."games" FOR INSERT TO "authenticated" WITH CHECK ((((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "games"."team_id") AND (("games"."age_group_id" IS NULL) OR ("games"."age_group_id" = "t"."age_group_id")))))));



CREATE POLICY "games_staff_select_v1" ON "public"."games" FOR SELECT TO "authenticated" USING (((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id"))));



CREATE POLICY "games_staff_update_v1" ON "public"."games" FOR UPDATE TO "authenticated" USING ((((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id"))) AND ((COALESCE("status", 'scheduled'::"text") <> 'completed'::"text") OR (("team_id" IS NOT NULL) AND "public"."user_is_team_coordinator"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_is_age_group_coordinator"("age_group_id"))))) WITH CHECK ((((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id"))) AND ((COALESCE("status", 'scheduled'::"text") <> 'completed'::"text") OR (("team_id" IS NOT NULL) AND "public"."user_is_team_coordinator"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_is_age_group_coordinator"("age_group_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "games"."team_id") AND (("games"."age_group_id" IS NULL) OR ("games"."age_group_id" = "t"."age_group_id")))))));



CREATE POLICY "games_update_v1" ON "public"."games" FOR UPDATE TO "authenticated" USING ("public"."user_can_write_age_group_scope"("age_group_id", "club_id")) WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



ALTER TABLE "public"."gdpr_purge_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goo_delete_age_group_staff" ON "public"."game_opponent_observations" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_opponent_observations"."game_id") AND "public"."user_can_access_age_group"("g"."age_group_id")))));



CREATE POLICY "goo_insert_age_group_staff" ON "public"."game_opponent_observations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_opponent_observations"."game_id") AND "public"."user_can_access_age_group"("g"."age_group_id")))));



CREATE POLICY "goo_select_age_group_staff" ON "public"."game_opponent_observations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_opponent_observations"."game_id") AND "public"."user_can_access_age_group"("g"."age_group_id")))));



CREATE POLICY "goo_update_age_group_staff" ON "public"."game_opponent_observations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_opponent_observations"."game_id") AND "public"."user_can_access_age_group"("g"."age_group_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_opponent_observations"."game_id") AND "public"."user_can_access_age_group"("g"."age_group_id")))));



ALTER TABLE "public"."grounds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "intake_insert_public" ON "public"."athlete_intake_submissions" FOR INSERT WITH CHECK (true);



CREATE POLICY "intake_select_auth" ON "public"."athlete_intake_submissions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



CREATE POLICY "intake_update_auth" ON "public"."athlete_intake_submissions" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_club_manager_select" ON "public"."invoices" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."club_memberships" "cm"
  WHERE (("cm"."club_id" = "invoices"."club_id") AND ("cm"."profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'coordinator'::"text"]))))));



CREATE POLICY "invoices_super_admin_all" ON "public"."invoices" TO "authenticated" USING ("public"."user_is_super_coordinator"()) WITH CHECK ("public"."user_is_super_coordinator"());



ALTER TABLE "public"."kit_pieces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kit_pieces_delete_v1" ON "public"."kit_pieces" FOR DELETE TO "authenticated" USING ("public"."user_can_access_team"("team_id"));



CREATE POLICY "kit_pieces_domain_boundary_v2" ON "public"."kit_pieces" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_access_team"("team_id")) WITH CHECK (("public"."user_can_access_team"("team_id") AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "kit_pieces"."team_id") AND ("t"."club_id" = "kit_pieces"."club_id"))))));



CREATE POLICY "kit_pieces_insert_v1" ON "public"."kit_pieces" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_access_team"("team_id"));



CREATE POLICY "kit_pieces_select_v1" ON "public"."kit_pieces" FOR SELECT TO "authenticated" USING ("public"."user_can_access_team"("team_id"));



CREATE POLICY "kit_pieces_staff_delete_v1" ON "public"."kit_pieces" FOR DELETE TO "authenticated" USING ("public"."user_can_access_team"("team_id"));



CREATE POLICY "kit_pieces_staff_insert_v1" ON "public"."kit_pieces" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_can_access_team"("team_id") AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "kit_pieces"."team_id") AND ("t"."club_id" = "kit_pieces"."club_id"))))));



CREATE POLICY "kit_pieces_staff_select_v1" ON "public"."kit_pieces" FOR SELECT TO "authenticated" USING ("public"."user_can_access_team"("team_id"));



CREATE POLICY "kit_pieces_staff_update_v1" ON "public"."kit_pieces" FOR UPDATE TO "authenticated" USING ("public"."user_can_access_team"("team_id")) WITH CHECK (("public"."user_can_access_team"("team_id") AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "kit_pieces"."team_id") AND ("t"."club_id" = "kit_pieces"."club_id"))))));



CREATE POLICY "kit_pieces_update_v1" ON "public"."kit_pieces" FOR UPDATE TO "authenticated" USING ("public"."user_can_access_team"("team_id")) WITH CHECK ("public"."user_can_access_team"("team_id"));



ALTER TABLE "public"."lineup_corrections_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lineup_corrections_log_select" ON "public"."lineup_corrections_log" FOR SELECT TO "authenticated" USING ("public"."user_is_game_coordinator"("game_id"));



ALTER TABLE "public"."matchdays" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."microciclos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "microciclos_delete_v1" ON "public"."microciclos" FOR DELETE TO "authenticated" USING ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "microciclos_domain_boundary_v1" ON "public"."microciclos" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id")) WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "microciclos_insert_v1" ON "public"."microciclos" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "microciclos_select_v1" ON "public"."microciclos" FOR SELECT TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id"));



CREATE POLICY "microciclos_update_v1" ON "public"."microciclos" FOR UPDATE TO "authenticated" USING ("public"."user_can_write_age_group_scope"("age_group_id", "club_id")) WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



ALTER TABLE "public"."notification_recipients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_recipients_owner_select_v1" ON "public"."notification_recipients" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."user_can_access_notification_context"("notification_id")));



CREATE POLICY "notification_recipients_owner_update_v1" ON "public"."notification_recipients" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."user_can_access_notification_context"("notification_id"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."user_can_access_notification_context"("notification_id")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_actor_insert_v1" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (((("actor_id" IS NULL) OR ("actor_id" = ( SELECT "auth"."uid"() AS "uid"))) AND "public"."user_can_access_notification_scope_v2"("age_group_id", "team_id") AND (("user_id" IS NULL) OR "public"."user_matches_notification_recipient_scope_v2"("user_id", "age_group_id", "team_id"))));



CREATE POLICY "notifications_domain_boundary_v2" ON "public"."notifications" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_access_notification_scope_v2"("age_group_id", "team_id")) WITH CHECK ("public"."user_can_access_notification_scope_v2"("age_group_id", "team_id"));



CREATE POLICY "notifications_owner_delete_v1" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("team_id" IS NULL) OR "public"."user_can_access_team"("team_id")) AND "public"."user_can_access_age_group"("age_group_id")));



CREATE POLICY "notifications_owner_select_v1" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("team_id" IS NULL) OR "public"."user_can_access_team"("team_id")) AND "public"."user_can_access_age_group"("age_group_id")));



CREATE POLICY "notifications_owner_update_v1" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("team_id" IS NULL) OR "public"."user_can_access_team"("team_id")) AND "public"."user_can_access_age_group"("age_group_id"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."opponents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "opponents_delete_v1" ON "public"."opponents" FOR DELETE TO "authenticated" USING ("public"."user_can_access_age_group"("age_group_id"));



CREATE POLICY "opponents_insert_v1" ON "public"."opponents" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_access_age_group"("age_group_id"));



CREATE POLICY "opponents_select_v1" ON "public"."opponents" FOR SELECT TO "authenticated" USING ("public"."user_can_access_age_group"("age_group_id"));



CREATE POLICY "opponents_update_v1" ON "public"."opponents" FOR UPDATE TO "authenticated" USING ("public"."user_can_access_age_group"("age_group_id")) WITH CHECK ("public"."user_can_access_age_group"("age_group_id"));



ALTER TABLE "public"."player_age_group_eligibility" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_behavioral_assessments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "player_behavioral_assessments_club_access" ON "public"."player_behavioral_assessments" USING ("public"."user_can_access_club"("club_id")) WITH CHECK ("public"."user_can_access_club"("club_id"));



CREATE POLICY "player_behavioral_assessments_delete_v1" ON "public"."player_behavioral_assessments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_behavioral_assessments"."player_id") AND ("p"."club_id" = "player_behavioral_assessments"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_behavioral_assessments"."club_id")))));



CREATE POLICY "player_behavioral_assessments_domain_boundary_v2" ON "public"."player_behavioral_assessments" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id")) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_behavioral_assessments"."player_id") AND ("p"."club_id" = "player_behavioral_assessments"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_behavioral_assessments"."club_id")))));



CREATE POLICY "player_behavioral_assessments_insert_v1" ON "public"."player_behavioral_assessments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_behavioral_assessments"."player_id") AND ("p"."club_id" = "player_behavioral_assessments"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_behavioral_assessments"."club_id")))));



CREATE POLICY "player_behavioral_assessments_select_v1" ON "public"."player_behavioral_assessments" FOR SELECT TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id"));



CREATE POLICY "player_behavioral_assessments_update_v1" ON "public"."player_behavioral_assessments" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_behavioral_assessments"."player_id") AND ("p"."club_id" = "player_behavioral_assessments"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_behavioral_assessments"."club_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_behavioral_assessments"."player_id") AND ("p"."club_id" = "player_behavioral_assessments"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_behavioral_assessments"."club_id")))));



ALTER TABLE "public"."player_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "player_documents_club_access" ON "public"."player_documents" USING ("public"."user_can_access_club"("club_id")) WITH CHECK ("public"."user_can_access_club"("club_id"));



CREATE POLICY "player_documents_delete_v1" ON "public"."player_documents" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_documents"."player_id") AND ("p"."club_id" = "player_documents"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_documents"."club_id")))));



CREATE POLICY "player_documents_domain_boundary_v2" ON "public"."player_documents" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id")) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_documents"."player_id") AND ("p"."club_id" = "player_documents"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_documents"."club_id")))));



CREATE POLICY "player_documents_insert_v1" ON "public"."player_documents" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_documents"."player_id") AND ("p"."club_id" = "player_documents"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_documents"."club_id")))));



CREATE POLICY "player_documents_select_v1" ON "public"."player_documents" FOR SELECT TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id"));



CREATE POLICY "player_documents_update_v1" ON "public"."player_documents" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_documents"."player_id") AND ("p"."club_id" = "player_documents"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_documents"."club_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_documents"."player_id") AND ("p"."club_id" = "player_documents"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_documents"."club_id")))));



ALTER TABLE "public"."player_registrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "player_registrations_club_access" ON "public"."player_registrations" USING ("public"."user_can_access_club"("club_id")) WITH CHECK ("public"."user_can_access_club"("club_id"));



CREATE POLICY "player_registrations_delete_v1" ON "public"."player_registrations" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_registrations"."player_id") AND ("p"."club_id" = "player_registrations"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_registrations"."club_id")))));



CREATE POLICY "player_registrations_domain_boundary_v2" ON "public"."player_registrations" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id")) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_registrations"."player_id") AND ("p"."club_id" = "player_registrations"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_registrations"."club_id")))) AND (("team_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "player_registrations"."team_id") AND ("t"."club_id" = "player_registrations"."club_id")))))));



CREATE POLICY "player_registrations_insert_v1" ON "public"."player_registrations" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_registrations"."player_id") AND ("p"."club_id" = "player_registrations"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_registrations"."club_id")))) AND (("team_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "player_registrations"."team_id") AND ("t"."club_id" = "player_registrations"."club_id")))))));



CREATE POLICY "player_registrations_select_v1" ON "public"."player_registrations" FOR SELECT TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id"));



CREATE POLICY "player_registrations_update_v1" ON "public"."player_registrations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_registrations"."player_id") AND ("p"."club_id" = "player_registrations"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_registrations"."club_id"))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "player_registrations"."player_id") AND ("p"."club_id" = "player_registrations"."club_id") AND "public"."user_can_write_age_group_scope"("p"."age_group_id", "player_registrations"."club_id")))) AND (("team_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "player_registrations"."team_id") AND ("t"."club_id" = "player_registrations"."club_id")))))));



ALTER TABLE "public"."players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "players_delete_v1" ON "public"."players" FOR DELETE TO "authenticated" USING ("public"."user_can_manage_age_group_v2"("age_group_id"));



CREATE POLICY "players_domain_boundary_v2" ON "public"."players" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_access_age_group"("age_group_id")) WITH CHECK ("public"."user_can_access_age_group"("age_group_id"));



CREATE POLICY "players_insert_v1" ON "public"."players" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "players_select_v1" ON "public"."players" FOR SELECT TO "authenticated" USING ("public"."user_can_access_age_group"("age_group_id"));



CREATE POLICY "players_staff_insert_v1" ON "public"."players" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_access_age_group"("age_group_id"));



CREATE POLICY "players_staff_select_v1" ON "public"."players" FOR SELECT TO "authenticated" USING ("public"."user_can_access_age_group"("age_group_id"));



CREATE POLICY "players_staff_update_v1" ON "public"."players" FOR UPDATE TO "authenticated" USING ("public"."user_can_access_age_group"("age_group_id")) WITH CHECK ("public"."user_can_access_age_group"("age_group_id"));



CREATE POLICY "players_update_v1" ON "public"."players" FOR UPDATE TO "authenticated" USING ("public"."user_can_write_age_group_scope"("age_group_id", "club_id")) WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_own_all_v1" ON "public"."profiles" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_read_same_club_v1" ON "public"."profiles" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "id") OR "public"."user_shares_club_with"("id") OR "public"."user_is_super_coordinator"()));



ALTER TABLE "public"."pse_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pse_records_delete_v1" ON "public"."pse_records" FOR DELETE TO "authenticated" USING (((("game_id" IS NOT NULL) AND "public"."user_is_game_coordinator"("game_id")) OR (("training_session_id" IS NOT NULL) AND "public"."user_is_training_session_coordinator"("training_session_id"))));



CREATE POLICY "pse_records_domain_boundary_v2" ON "public"."pse_records" AS RESTRICTIVE TO "authenticated" USING (((("game_id" IS NOT NULL) AND "public"."user_can_access_game"("game_id")) OR (("training_session_id" IS NOT NULL) AND "public"."user_can_access_training_session_v2"("training_session_id")) OR (("player_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "pse_records"."player_id") AND "public"."user_can_access_age_group"("p"."age_group_id"))))))) WITH CHECK (((("game_id" IS NOT NULL) AND "public"."user_can_access_game"("game_id")) OR (("training_session_id" IS NOT NULL) AND "public"."user_can_access_training_session_v2"("training_session_id")) OR (("player_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "pse_records"."player_id") AND "public"."user_can_access_age_group"("p"."age_group_id")))))));



CREATE POLICY "pse_records_read_v1" ON "public"."pse_records" FOR SELECT TO "authenticated" USING (((("game_id" IS NOT NULL) AND "public"."user_can_access_game"("game_id")) OR (("training_session_id" IS NOT NULL) AND "public"."user_can_access_training_session_v2"("training_session_id")) OR (("player_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."players" "p"
  WHERE (("p"."id" = "pse_records"."player_id") AND "public"."user_can_access_age_group"("p"."age_group_id")))))));



ALTER TABLE "public"."public_rate_limit_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_share_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_subscriptions_owner_delete_v1" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_subscriptions_owner_insert_v1" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_subscriptions_owner_select_v1" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_subscriptions_owner_update_v1" ON "public"."push_subscriptions" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "rehome_audit_read_super" ON "public"."age_group_club_rehome_audit" FOR SELECT TO "authenticated" USING ("public"."user_is_super_coordinator"());



ALTER TABLE "public"."season_objectives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "season_objectives_club_access" ON "public"."season_objectives" USING ("public"."user_can_access_club"("club_id")) WITH CHECK ("public"."user_can_access_club"("club_id"));



CREATE POLICY "season_objectives_delete_v1" ON "public"."season_objectives" FOR DELETE TO "authenticated" USING ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "season_objectives_domain_boundary_v2" ON "public"."season_objectives" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id")) WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "season_objectives_insert_v1" ON "public"."season_objectives" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "season_objectives_select_v1" ON "public"."season_objectives" FOR SELECT TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id"));



CREATE POLICY "season_objectives_update_v1" ON "public"."season_objectives" FOR UPDATE TO "authenticated" USING ("public"."user_can_write_age_group_scope"("age_group_id", "club_id")) WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "staff_can_view_own" ON "public"."team_staff" FOR SELECT TO "authenticated" USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "staff_clube_le_elegibilidade" ON "public"."player_age_group_eligibility" FOR SELECT TO "authenticated" USING (("club_id" IN ( SELECT "ags"."club_id"
   FROM "public"."age_group_staff" "ags"
  WHERE ("ags"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))
UNION
 SELECT "cm"."club_id"
   FROM "public"."club_memberships" "cm"
  WHERE ("cm"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))
UNION
 SELECT "ag"."club_id"
   FROM "public"."age_groups" "ag"
  WHERE ("ag"."coordinator_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."staff_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_invites_coordinator_delete_v1" ON "public"."staff_invites" FOR DELETE TO "authenticated" USING ("public"."user_can_manage_age_group_v2"("age_group_id"));



CREATE POLICY "staff_invites_coordinator_insert_v1" ON "public"."staff_invites" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_can_manage_age_group_v2"("age_group_id") AND (("invited_by" IS NULL) OR ("invited_by" = ( SELECT "auth"."uid"() AS "uid"))) AND (EXISTS ( SELECT 1
   FROM "public"."age_groups" "ag"
  WHERE (("ag"."id" = "staff_invites"."age_group_id") AND ("ag"."club_id" = "staff_invites"."club_id"))))));



CREATE POLICY "staff_invites_coordinator_update_v1" ON "public"."staff_invites" FOR UPDATE TO "authenticated" USING ("public"."user_can_manage_age_group_v2"("age_group_id")) WITH CHECK (("public"."user_can_manage_age_group_v2"("age_group_id") AND (EXISTS ( SELECT 1
   FROM "public"."age_groups" "ag"
  WHERE (("ag"."id" = "staff_invites"."age_group_id") AND ("ag"."club_id" = "staff_invites"."club_id"))))));



CREATE POLICY "staff_invites_domain_boundary_v2" ON "public"."staff_invites" AS RESTRICTIVE TO "authenticated" USING (("public"."user_can_access_age_group"("age_group_id") OR (("email" IS NOT NULL) AND ("lower"("email") = "lower"(COALESCE((( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::"text"), ''::"text")))))) WITH CHECK (("public"."user_can_manage_age_group_v2"("age_group_id") AND (EXISTS ( SELECT 1
   FROM "public"."age_groups" "ag"
  WHERE (("ag"."id" = "staff_invites"."age_group_id") AND ("ag"."club_id" = "staff_invites"."club_id"))))));



CREATE POLICY "staff_invites_select_v1" ON "public"."staff_invites" FOR SELECT TO "authenticated" USING (("public"."user_can_access_age_group_v2"("age_group_id") OR (("email" IS NOT NULL) AND ("lower"("email") = "lower"(COALESCE((( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::"text"), ''::"text"))))));



ALTER TABLE "public"."staff_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_permissions_delete_v1" ON "public"."staff_permissions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."age_group_staff" "target_ags"
  WHERE (("target_ags"."id" = "staff_permissions"."staff_id") AND ("target_ags"."club_id" = "staff_permissions"."club_id") AND "public"."user_can_write_age_group_scope"("target_ags"."age_group_id", "staff_permissions"."club_id")))));



CREATE POLICY "staff_permissions_domain_boundary_v2" ON "public"."staff_permissions" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id")) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."age_group_staff" "target_ags"
  WHERE (("target_ags"."id" = "staff_permissions"."staff_id") AND ("target_ags"."club_id" = "staff_permissions"."club_id") AND "public"."user_can_write_age_group_scope"("target_ags"."age_group_id", "staff_permissions"."club_id")))));



CREATE POLICY "staff_permissions_insert_v1" ON "public"."staff_permissions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."age_group_staff" "target_ags"
  WHERE (("target_ags"."id" = "staff_permissions"."staff_id") AND ("target_ags"."club_id" = "staff_permissions"."club_id") AND "public"."user_can_write_age_group_scope"("target_ags"."age_group_id", "staff_permissions"."club_id")))));



CREATE POLICY "staff_permissions_select_v1" ON "public"."staff_permissions" FOR SELECT TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id"));



CREATE POLICY "staff_permissions_update_v1" ON "public"."staff_permissions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."age_group_staff" "target_ags"
  WHERE (("target_ags"."id" = "staff_permissions"."staff_id") AND ("target_ags"."club_id" = "staff_permissions"."club_id") AND "public"."user_can_write_age_group_scope"("target_ags"."age_group_id", "staff_permissions"."club_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."age_group_staff" "target_ags"
  WHERE (("target_ags"."id" = "staff_permissions"."staff_id") AND ("target_ags"."club_id" = "staff_permissions"."club_id") AND "public"."user_can_write_age_group_scope"("target_ags"."age_group_id", "staff_permissions"."club_id")))));



ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stripe_webhook_events_super_admin_select" ON "public"."stripe_webhook_events" FOR SELECT TO "authenticated" USING ("public"."user_is_super_coordinator"());



ALTER TABLE "public"."team_staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_staff_coordinator_delete_v1" ON "public"."team_staff" FOR DELETE TO "authenticated" USING ("public"."user_is_team_coordinator"("team_id"));



CREATE POLICY "team_staff_coordinator_insert_v1" ON "public"."team_staff" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_is_team_coordinator"("team_id") AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_staff"."team_id") AND ("t"."club_id" = "team_staff"."club_id"))))));



CREATE POLICY "team_staff_coordinator_update_v1" ON "public"."team_staff" FOR UPDATE TO "authenticated" USING ("public"."user_is_team_coordinator"("team_id")) WITH CHECK (("public"."user_is_team_coordinator"("team_id") AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_staff"."team_id") AND ("t"."club_id" = "team_staff"."club_id"))))));



CREATE POLICY "team_staff_domain_boundary_v2" ON "public"."team_staff" AS RESTRICTIVE TO "authenticated" USING ((("profile_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_can_access_team"("team_id"))) WITH CHECK (("public"."user_is_team_coordinator"("team_id") AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_staff"."team_id") AND ("t"."club_id" = "team_staff"."club_id"))))));



CREATE POLICY "team_staff_member_select_v1" ON "public"."team_staff" FOR SELECT TO "authenticated" USING ((("profile_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_can_access_team"("team_id")));



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_club_delete_v1" ON "public"."teams" FOR DELETE TO "authenticated" USING ("public"."user_can_manage_age_group_v2"("age_group_id"));



CREATE POLICY "teams_club_insert_v1" ON "public"."teams" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_can_manage_age_group_v2"("age_group_id") AND (EXISTS ( SELECT 1
   FROM "public"."age_groups" "ag"
  WHERE (("ag"."id" = "teams"."age_group_id") AND ("ag"."club_id" = "teams"."club_id"))))));



CREATE POLICY "teams_club_select_v1" ON "public"."teams" FOR SELECT TO "authenticated" USING ("public"."user_can_access_team_v2"("id"));



CREATE POLICY "teams_club_update_v1" ON "public"."teams" FOR UPDATE TO "authenticated" USING ("public"."user_can_manage_age_group_v2"("age_group_id")) WITH CHECK (("public"."user_can_manage_age_group_v2"("age_group_id") AND (EXISTS ( SELECT 1
   FROM "public"."age_groups" "ag"
  WHERE (("ag"."id" = "teams"."age_group_id") AND ("ag"."club_id" = "teams"."club_id"))))));



ALTER TABLE "public"."training_attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_attendance_delete_v1" ON "public"."training_attendance" FOR DELETE TO "authenticated" USING ((("training_session_id" IS NOT NULL) AND "public"."user_is_training_session_coordinator"("training_session_id")));



CREATE POLICY "training_attendance_domain_boundary_v2" ON "public"."training_attendance" AS RESTRICTIVE TO "authenticated" USING ((("training_session_id" IS NOT NULL) AND "public"."user_can_access_training_session_v2"("training_session_id"))) WITH CHECK ((("training_session_id" IS NOT NULL) AND "public"."user_can_access_training_session_v2"("training_session_id")));



CREATE POLICY "training_attendance_staff_delete_v1" ON "public"."training_attendance" FOR DELETE TO "authenticated" USING ((("training_session_id" IS NOT NULL) AND "public"."user_can_access_training_session_v2"("training_session_id")));



CREATE POLICY "training_attendance_staff_insert_v1" ON "public"."training_attendance" FOR INSERT TO "authenticated" WITH CHECK ((("training_session_id" IS NOT NULL) AND "public"."user_can_access_training_session_v2"("training_session_id")));



CREATE POLICY "training_attendance_staff_select_v1" ON "public"."training_attendance" FOR SELECT TO "authenticated" USING ((("training_session_id" IS NOT NULL) AND "public"."user_can_access_training_session_v2"("training_session_id")));



CREATE POLICY "training_attendance_staff_update_v1" ON "public"."training_attendance" FOR UPDATE TO "authenticated" USING ((("training_session_id" IS NOT NULL) AND "public"."user_can_access_training_session_v2"("training_session_id"))) WITH CHECK ((("training_session_id" IS NOT NULL) AND "public"."user_can_access_training_session_v2"("training_session_id")));



ALTER TABLE "public"."training_phase_exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_phase_exercises_club_access" ON "public"."training_phase_exercises" USING ("public"."user_can_access_club"("club_id")) WITH CHECK ("public"."user_can_access_club"("club_id"));



CREATE POLICY "training_phase_exercises_delete_v1" ON "public"."training_phase_exercises" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."training_phases" "tp"
     JOIN "public"."training_sessions" "ts" ON (("ts"."id" = "tp"."training_session_id")))
     LEFT JOIN "public"."teams" "t" ON (("t"."id" = "ts"."team_id")))
  WHERE (("tp"."id" = "training_phase_exercises"."phase_id") AND ("tp"."club_id" = "training_phase_exercises"."club_id") AND ("ts"."club_id" = "training_phase_exercises"."club_id") AND "public"."user_can_write_age_group_scope"(COALESCE("ts"."age_group_id", "t"."age_group_id"), "training_phase_exercises"."club_id")))));



CREATE POLICY "training_phase_exercises_domain_boundary_v2" ON "public"."training_phase_exercises" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id")) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."training_phases" "tp"
     JOIN "public"."training_sessions" "ts" ON (("ts"."id" = "tp"."training_session_id")))
     LEFT JOIN "public"."teams" "t" ON (("t"."id" = "ts"."team_id")))
  WHERE (("tp"."id" = "training_phase_exercises"."phase_id") AND ("tp"."club_id" = "training_phase_exercises"."club_id") AND ("ts"."club_id" = "training_phase_exercises"."club_id") AND "public"."user_can_write_age_group_scope"(COALESCE("ts"."age_group_id", "t"."age_group_id"), "training_phase_exercises"."club_id")))));



CREATE POLICY "training_phase_exercises_insert_v1" ON "public"."training_phase_exercises" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."training_phases" "tp"
     JOIN "public"."training_sessions" "ts" ON (("ts"."id" = "tp"."training_session_id")))
     LEFT JOIN "public"."teams" "t" ON (("t"."id" = "ts"."team_id")))
  WHERE (("tp"."id" = "training_phase_exercises"."phase_id") AND ("tp"."club_id" = "training_phase_exercises"."club_id") AND ("ts"."club_id" = "training_phase_exercises"."club_id") AND "public"."user_can_write_age_group_scope"(COALESCE("ts"."age_group_id", "t"."age_group_id"), "training_phase_exercises"."club_id")))));



CREATE POLICY "training_phase_exercises_select_v1" ON "public"."training_phase_exercises" FOR SELECT TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id"));



CREATE POLICY "training_phase_exercises_update_v1" ON "public"."training_phase_exercises" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."training_phases" "tp"
     JOIN "public"."training_sessions" "ts" ON (("ts"."id" = "tp"."training_session_id")))
     LEFT JOIN "public"."teams" "t" ON (("t"."id" = "ts"."team_id")))
  WHERE (("tp"."id" = "training_phase_exercises"."phase_id") AND ("tp"."club_id" = "training_phase_exercises"."club_id") AND ("ts"."club_id" = "training_phase_exercises"."club_id") AND "public"."user_can_write_age_group_scope"(COALESCE("ts"."age_group_id", "t"."age_group_id"), "training_phase_exercises"."club_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."training_phases" "tp"
     JOIN "public"."training_sessions" "ts" ON (("ts"."id" = "tp"."training_session_id")))
     LEFT JOIN "public"."teams" "t" ON (("t"."id" = "ts"."team_id")))
  WHERE (("tp"."id" = "training_phase_exercises"."phase_id") AND ("tp"."club_id" = "training_phase_exercises"."club_id") AND ("ts"."club_id" = "training_phase_exercises"."club_id") AND "public"."user_can_write_age_group_scope"(COALESCE("ts"."age_group_id", "t"."age_group_id"), "training_phase_exercises"."club_id")))));



ALTER TABLE "public"."training_phases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_phases_delete_v1" ON "public"."training_phases" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."training_sessions" "ts"
     LEFT JOIN "public"."teams" "t" ON (("t"."id" = "ts"."team_id")))
  WHERE (("ts"."id" = "training_phases"."training_session_id") AND ("ts"."club_id" = "training_phases"."club_id") AND "public"."user_can_write_age_group_scope"(COALESCE("ts"."age_group_id", "t"."age_group_id"), "training_phases"."club_id")))));



CREATE POLICY "training_phases_domain_boundary_v2" ON "public"."training_phases" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id")) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."training_sessions" "ts"
     LEFT JOIN "public"."teams" "t" ON (("t"."id" = "ts"."team_id")))
  WHERE (("ts"."id" = "training_phases"."training_session_id") AND ("ts"."club_id" = "training_phases"."club_id") AND "public"."user_can_write_age_group_scope"(COALESCE("ts"."age_group_id", "t"."age_group_id"), "training_phases"."club_id")))));



CREATE POLICY "training_phases_insert_v1" ON "public"."training_phases" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."training_sessions" "ts"
     LEFT JOIN "public"."teams" "t" ON (("t"."id" = "ts"."team_id")))
  WHERE (("ts"."id" = "training_phases"."training_session_id") AND ("ts"."club_id" = "training_phases"."club_id") AND "public"."user_can_write_age_group_scope"(COALESCE("ts"."age_group_id", "t"."age_group_id"), "training_phases"."club_id")))));



CREATE POLICY "training_phases_select_v1" ON "public"."training_phases" FOR SELECT TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id"));



CREATE POLICY "training_phases_update_v1" ON "public"."training_phases" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."training_sessions" "ts"
     LEFT JOIN "public"."teams" "t" ON (("t"."id" = "ts"."team_id")))
  WHERE (("ts"."id" = "training_phases"."training_session_id") AND ("ts"."club_id" = "training_phases"."club_id") AND "public"."user_can_write_age_group_scope"(COALESCE("ts"."age_group_id", "t"."age_group_id"), "training_phases"."club_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."training_sessions" "ts"
     LEFT JOIN "public"."teams" "t" ON (("t"."id" = "ts"."team_id")))
  WHERE (("ts"."id" = "training_phases"."training_session_id") AND ("ts"."club_id" = "training_phases"."club_id") AND "public"."user_can_write_age_group_scope"(COALESCE("ts"."age_group_id", "t"."age_group_id"), "training_phases"."club_id")))));



ALTER TABLE "public"."training_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_sessions_delete_v1" ON "public"."training_sessions" FOR DELETE TO "authenticated" USING ("public"."user_can_manage_age_group_v2"("age_group_id"));



CREATE POLICY "training_sessions_domain_boundary_v1" ON "public"."training_sessions" AS RESTRICTIVE TO "authenticated" USING ("public"."user_can_read_club_scope"("club_id")) WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "training_sessions_domain_boundary_v2" ON "public"."training_sessions" AS RESTRICTIVE TO "authenticated" USING (((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id")))) WITH CHECK (((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id"))));



CREATE POLICY "training_sessions_insert_v1" ON "public"."training_sessions" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



CREATE POLICY "training_sessions_select_v1" ON "public"."training_sessions" FOR SELECT TO "authenticated" USING ("public"."user_can_access_age_group"("age_group_id"));



CREATE POLICY "training_sessions_staff_delete_v1" ON "public"."training_sessions" FOR DELETE TO "authenticated" USING (((("team_id" IS NOT NULL) AND "public"."user_is_team_coordinator"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_is_age_group_coordinator"("age_group_id"))));



CREATE POLICY "training_sessions_staff_insert_v1" ON "public"."training_sessions" FOR INSERT TO "authenticated" WITH CHECK ((((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "training_sessions"."team_id") AND (("training_sessions"."age_group_id" IS NULL) OR ("training_sessions"."age_group_id" = "t"."age_group_id")))))));



CREATE POLICY "training_sessions_staff_select_v1" ON "public"."training_sessions" FOR SELECT TO "authenticated" USING (((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id"))));



CREATE POLICY "training_sessions_staff_update_v1" ON "public"."training_sessions" FOR UPDATE TO "authenticated" USING (((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id")))) WITH CHECK ((((("team_id" IS NOT NULL) AND "public"."user_can_access_team"("team_id")) OR (("age_group_id" IS NOT NULL) AND "public"."user_can_access_age_group"("age_group_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "training_sessions"."team_id") AND (("training_sessions"."age_group_id" IS NULL) OR ("training_sessions"."age_group_id" = "t"."age_group_id")))))));



CREATE POLICY "training_sessions_update_v1" ON "public"."training_sessions" FOR UPDATE TO "authenticated" USING ("public"."user_can_write_age_group_scope"("age_group_id", "club_id")) WITH CHECK ("public"."user_can_write_age_group_scope"("age_group_id", "club_id"));



ALTER TABLE "public"."trainings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waitlist" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notification_recipients";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."age_group_staff_assign_validate_refs"() TO "anon";
GRANT ALL ON FUNCTION "public"."age_group_staff_assign_validate_refs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."age_group_staff_assign_validate_refs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."age_group_staff_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."age_group_staff_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."age_group_staff_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."age_group_staff_sync_club_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."age_group_staff_sync_club_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."age_group_staff_sync_club_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."age_group_subtree_summary"("p_age_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."age_group_subtree_summary"("p_age_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."age_group_subtree_summary"("p_age_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."age_groups_assign_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."age_groups_assign_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."age_groups_assign_club_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."age_groups_sync_coordinator_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."age_groups_sync_coordinator_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."age_groups_sync_coordinator_membership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_public_share_rate_limit"("p_token_hash" "text", "p_ip_hash" "text", "p_ip_limit" integer, "p_token_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_public_share_rate_limit"("p_token_hash" "text", "p_ip_hash" "text", "p_ip_limit" integer, "p_token_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."convocation_player_matches_game_scope"("p_convocation_id" "uuid", "p_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."convocation_player_matches_game_scope"("p_convocation_id" "uuid", "p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convocation_player_matches_game_scope"("p_convocation_id" "uuid", "p_player_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."count_rows_by_ids"("p_table" "text", "p_column" "text", "p_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_rows_by_ids"("p_table" "text", "p_column" "text", "p_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_club_onboarding"("p_name" "text", "p_short_name" "text", "p_slug" "text", "p_logo_url" "text", "p_plan_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_club_onboarding"("p_name" "text", "p_short_name" "text", "p_slug" "text", "p_logo_url" "text", "p_plan_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_club_onboarding"("p_name" "text", "p_short_name" "text", "p_slug" "text", "p_logo_url" "text", "p_plan_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_initial_lineup_immutability"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_initial_lineup_immutability"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_initial_lineup_immutability"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_age_group_technical_club"("p_age_group_id" "uuid", "p_club_name" "text", "p_age_group_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_age_group_technical_club"("p_age_group_id" "uuid", "p_club_name" "text", "p_age_group_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_age_group_technical_club"("p_age_group_id" "uuid", "p_club_name" "text", "p_age_group_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."exercises_assign_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."exercises_assign_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."exercises_assign_club_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."game_exists"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."game_exists"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."game_exists"("p_game_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_club_insights"("p_club_id" "uuid", "p_season" "text", "p_age_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_club_insights"("p_club_id" "uuid", "p_season" "text", "p_age_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_club_insights"("p_club_id" "uuid", "p_season" "text", "p_age_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_club_insights"("p_club_id" "uuid", "p_season" "text", "p_age_group_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_club_player_rankings"("p_club_id" "uuid", "p_metric" "text", "p_season" "text", "p_age_group_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_club_player_rankings"("p_club_id" "uuid", "p_metric" "text", "p_season" "text", "p_age_group_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_club_player_rankings"("p_club_id" "uuid", "p_metric" "text", "p_season" "text", "p_age_group_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_club_player_rankings"("p_club_id" "uuid", "p_metric" "text", "p_season" "text", "p_age_group_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_player_season_stats"("p_club_id" "uuid", "p_age_group_id" "uuid", "p_season" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_player_season_stats"("p_club_id" "uuid", "p_age_group_id" "uuid", "p_season" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_player_season_stats"("p_club_id" "uuid", "p_age_group_id" "uuid", "p_season" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."guard_team_staff_projection_only"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_team_staff_projection_only"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_team_staff_projection_only"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."microciclos_assign_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."microciclos_assign_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."microciclos_assign_club_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_team_staff_role_v2"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_team_staff_role_v2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_team_staff_role_v2"() TO "service_role";



GRANT ALL ON FUNCTION "public"."player_behavioral_assessments_assign_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."player_behavioral_assessments_assign_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."player_behavioral_assessments_assign_club_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."player_documents_assign_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."player_documents_assign_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."player_documents_assign_club_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."player_registrations_assign_validate_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."player_registrations_assign_validate_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."player_registrations_assign_validate_club_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profile_has_conflicting_age_group_membership"("p_profile_id" "uuid", "p_allowed_age_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."profile_has_conflicting_age_group_membership"("p_profile_id" "uuid", "p_allowed_age_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."profile_has_conflicting_age_group_membership"("p_profile_id" "uuid", "p_allowed_age_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_auto_default_club_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_auto_default_club_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_auto_default_club_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_guard_super_coordinator"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_guard_super_coordinator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_guard_super_coordinator"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_notifications_before"("p_cutoff" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_notifications_before"("p_cutoff" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_public_age_group_access"("p_age_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_public_age_group_access"("p_age_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."register_public_age_group_access"("p_age_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_public_age_group_access"("p_age_group_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rehome_age_group_to_dedicated_technical_club"("p_age_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rehome_age_group_to_dedicated_technical_club"("p_age_group_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."repair_club_membership_state"("p_club_id" "uuid", "p_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."repair_club_membership_state"("p_club_id" "uuid", "p_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_age_group_primary_team_id"("p_age_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_age_group_primary_team_id"("p_age_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_age_group_primary_team_id"("p_age_group_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_attendance_today_get"("p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_attendance_today_get"("p_date" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."rpc_attendance_today_get"("p_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rpc_attendance_today_save"("p_session_id" "uuid", "p_attendance" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_attendance_today_save"("p_session_id" "uuid", "p_attendance" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."rpc_attendance_today_save"("p_session_id" "uuid", "p_attendance" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rpc_attendance_today_save"("p_session_id" "uuid", "p_attendance" "jsonb", "p_finalize" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_attendance_today_save"("p_session_id" "uuid", "p_attendance" "jsonb", "p_finalize" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."rpc_attendance_today_save"("p_session_id" "uuid", "p_attendance" "jsonb", "p_finalize" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rpc_correct_initial_lineup"("p_game_id" "uuid", "p_corrections" "jsonb", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_correct_initial_lineup"("p_game_id" "uuid", "p_corrections" "jsonb", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_correct_initial_lineup"("p_game_id" "uuid", "p_corrections" "jsonb", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_finalize_game"("p_game_id" "uuid", "p_final_stats" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid", "p_sync_initial_lineup" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_finalize_game"("p_game_id" "uuid", "p_final_stats" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid", "p_sync_initial_lineup" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_finalize_game_auth"("p_game_id" "uuid", "p_final_stats" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_finalize_game_auth"("p_game_id" "uuid", "p_final_stats" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."rpc_finalize_game_auth"("p_game_id" "uuid", "p_final_stats" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rpc_game_access_context"("p_game_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_game_access_context"("p_game_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."rpc_game_access_context"("p_game_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."rpc_merge_opponents"("p_keep_id" "uuid", "p_delete_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_merge_opponents"("p_keep_id" "uuid", "p_delete_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_merge_opponents"("p_keep_id" "uuid", "p_delete_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_promote_observations"("p_opponent_id" "uuid", "p_observation_ids" "uuid"[], "p_target_field" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_promote_observations"("p_opponent_id" "uuid", "p_observation_ids" "uuid"[], "p_target_field" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_promote_observations"("p_opponent_id" "uuid", "p_observation_ids" "uuid"[], "p_target_field" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_recalculate_game_summary"("p_game_id" "uuid", "p_rows" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_recalculate_game_summary"("p_game_id" "uuid", "p_rows" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_recalculate_game_summary_auth"("p_game_id" "uuid", "p_rows" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_recalculate_game_summary_auth"("p_game_id" "uuid", "p_rows" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."rpc_recalculate_game_summary_auth"("p_game_id" "uuid", "p_rows" "jsonb", "p_score_home" integer, "p_score_away" integer, "p_final_minute" integer, "p_updated_by" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rpc_redeem_age_coordinator_invite"("p_invite_code" "text", "p_user_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_redeem_age_coordinator_invite"("p_invite_code" "text", "p_user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_redeem_age_coordinator_invite"("p_invite_code" "text", "p_user_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_redeem_club_coordinator_invite"("p_invite_code" "text", "p_user_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_redeem_club_coordinator_invite"("p_invite_code" "text", "p_user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_redeem_club_coordinator_invite"("p_invite_code" "text", "p_user_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_redeem_staff_invite"("p_invite_code" "text", "p_user_id" "uuid", "p_user_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_redeem_staff_invite"("p_invite_code" "text", "p_user_id" "uuid", "p_user_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_redeem_staff_invite_auth"("p_invite_code" "text", "p_user_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_redeem_staff_invite_auth"("p_invite_code" "text", "p_user_email" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."rpc_redeem_staff_invite_auth"("p_invite_code" "text", "p_user_email" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rpc_register_substitution"("p_game_id" "uuid", "p_squad_out_id" "uuid", "p_squad_in_id" "uuid", "p_minute" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_register_substitution"("p_game_id" "uuid", "p_squad_out_id" "uuid", "p_squad_in_id" "uuid", "p_minute" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_register_substitution"("p_game_id" "uuid", "p_squad_out_id" "uuid", "p_squad_in_id" "uuid", "p_minute" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_statistics_players"("p_age_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_statistics_players"("p_age_group_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."rpc_statistics_players"("p_age_group_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rpc_training_session_access_context"("p_training_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_training_session_access_context"("p_training_session_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."rpc_training_session_access_context"("p_training_session_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rpc_update_game_tactical_auth"("p_game_id" "uuid", "p_tactical_system" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_update_game_tactical_auth"("p_game_id" "uuid", "p_tactical_system" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."rpc_update_game_tactical_auth"("p_game_id" "uuid", "p_tactical_system" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."season_objectives_assign_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."season_objectives_assign_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."season_objectives_assign_club_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_permissions_assign_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."staff_permissions_assign_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_permissions_assign_club_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_age_group_staff_to_team_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_age_group_staff_to_team_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_age_group_staff_to_team_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_club_id_from_age_group_ref"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_club_id_from_age_group_ref"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_club_id_from_age_group_ref"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_club_id_from_domain_refs"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_club_id_from_domain_refs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_club_id_from_domain_refs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_club_id_from_team_or_age_group_ref"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_club_id_from_team_or_age_group_ref"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_club_id_from_team_or_age_group_ref"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_club_id_from_team_ref"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_club_id_from_team_ref"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_club_id_from_team_ref"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_team_staff_to_age_group_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_team_staff_to_age_group_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_team_staff_to_age_group_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."table_has_column"("p_table" "text", "p_column" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."table_has_column"("p_table" "text", "p_column" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."table_has_column"("p_table" "text", "p_column" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."team_staff_sync_club_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."team_staff_sync_club_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."team_staff_sync_club_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."teams_assign_validate_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."teams_assign_validate_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."teams_assign_validate_club_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."training_phase_exercises_assign_validate_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."training_phase_exercises_assign_validate_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."training_phase_exercises_assign_validate_club_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."training_phases_assign_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."training_phases_assign_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."training_phases_assign_club_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_rows_club_id_by_age_group"("p_table" "text", "p_age_group_id" "uuid", "p_new_club_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_rows_club_id_by_age_group"("p_table" "text", "p_age_group_id" "uuid", "p_new_club_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_rows_club_id_by_ids"("p_table" "text", "p_column" "text", "p_ids" "uuid"[], "p_new_club_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_rows_club_id_by_ids"("p_table" "text", "p_column" "text", "p_ids" "uuid"[], "p_new_club_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_age_group"("p_age_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_age_group"("p_age_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_age_group"("p_age_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_age_group_v2"("p_age_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_age_group_v2"("p_age_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_age_group_v2"("p_age_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_club"("p_club_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_club"("p_club_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_club"("p_club_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_convocation"("p_convocation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_convocation"("p_convocation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_convocation"("p_convocation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_game"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_game"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_game"("p_game_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_notification_context"("p_notification_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_notification_context"("p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_notification_context"("p_notification_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_notification_scope_v2"("p_age_group_id" "uuid", "p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_notification_scope_v2"("p_age_group_id" "uuid", "p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_notification_scope_v2"("p_age_group_id" "uuid", "p_team_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_team"("p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_team"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_team"("p_team_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_team_v2"("p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_team_v2"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_team_v2"("p_team_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_training_session_v2"("p_training_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_training_session_v2"("p_training_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_training_session_v2"("p_training_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_manage_age_group_v2"("p_age_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_manage_age_group_v2"("p_age_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_manage_age_group_v2"("p_age_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_manage_club"("p_club_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_manage_club"("p_club_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_manage_club"("p_club_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_read_club_scope"("p_club_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_read_club_scope"("p_club_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_read_club_scope"("p_club_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_write_age_group_scope"("p_age_group_id" "uuid", "p_club_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_write_age_group_scope"("p_age_group_id" "uuid", "p_club_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_write_age_group_scope"("p_age_group_id" "uuid", "p_club_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_write_convocation"("p_convocation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_write_convocation"("p_convocation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_write_convocation"("p_convocation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_write_game"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_write_game"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_write_game"("p_game_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_write_live_game"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_write_live_game"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_write_live_game"("p_game_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_club_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_club_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_club_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_default_club_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_default_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_default_club_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_is_age_group_coordinator"("p_age_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_age_group_coordinator"("p_age_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_age_group_coordinator"("p_age_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_is_game_coordinator"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_game_coordinator"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_game_coordinator"("p_game_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_is_super_coordinator"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_super_coordinator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_super_coordinator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_is_team_coordinator"("p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_team_coordinator"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_team_coordinator"("p_team_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_is_training_session_coordinator"("p_training_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_training_session_coordinator"("p_training_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_training_session_coordinator"("p_training_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_matches_notification_recipient_scope_v2"("p_user_id" "uuid", "p_age_group_id" "uuid", "p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_matches_notification_recipient_scope_v2"("p_user_id" "uuid", "p_age_group_id" "uuid", "p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_matches_notification_recipient_scope_v2"("p_user_id" "uuid", "p_age_group_id" "uuid", "p_team_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_shares_club_with"("target_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_shares_club_with"("target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_shares_club_with"("target_profile_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."age_group_categories" TO "anon";
GRANT ALL ON TABLE "public"."age_group_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."age_group_categories" TO "service_role";



GRANT ALL ON TABLE "public"."age_group_club_rehome_audit" TO "service_role";
GRANT SELECT ON TABLE "public"."age_group_club_rehome_audit" TO "authenticated";



GRANT ALL ON TABLE "public"."age_group_staff" TO "anon";
GRANT ALL ON TABLE "public"."age_group_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."age_group_staff" TO "service_role";



GRANT ALL ON TABLE "public"."age_groups" TO "anon";
GRANT ALL ON TABLE "public"."age_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."age_groups" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_intake_submissions" TO "anon";
GRANT ALL ON TABLE "public"."athlete_intake_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_intake_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."beta_invites" TO "service_role";



GRANT ALL ON TABLE "public"."club_memberships" TO "anon";
GRANT ALL ON TABLE "public"."club_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."club_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."clubs" TO "anon";
GRANT ALL ON TABLE "public"."clubs" TO "authenticated";
GRANT ALL ON TABLE "public"."clubs" TO "service_role";



GRANT ALL ON TABLE "public"."competitions" TO "anon";
GRANT ALL ON TABLE "public"."competitions" TO "authenticated";
GRANT ALL ON TABLE "public"."competitions" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."convocation_players" TO "anon";
GRANT ALL ON TABLE "public"."convocation_players" TO "authenticated";
GRANT ALL ON TABLE "public"."convocation_players" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."convocations" TO "anon";
GRANT ALL ON TABLE "public"."convocations" TO "authenticated";
GRANT ALL ON TABLE "public"."convocations" TO "service_role";



GRANT ALL ON TABLE "public"."device_push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."device_push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."device_push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."exercises" TO "anon";
GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."external_player_convocations" TO "anon";
GRANT ALL ON TABLE "public"."external_player_convocations" TO "authenticated";
GRANT ALL ON TABLE "public"."external_player_convocations" TO "service_role";



GRANT ALL ON TABLE "public"."game_events" TO "anon";
GRANT ALL ON TABLE "public"."game_events" TO "authenticated";
GRANT ALL ON TABLE "public"."game_events" TO "service_role";



GRANT ALL ON TABLE "public"."game_final_stats" TO "anon";
GRANT ALL ON TABLE "public"."game_final_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."game_final_stats" TO "service_role";



GRANT ALL ON TABLE "public"."game_live_checkpoints" TO "anon";
GRANT ALL ON TABLE "public"."game_live_checkpoints" TO "authenticated";
GRANT ALL ON TABLE "public"."game_live_checkpoints" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."game_opponent_observations" TO "anon";
GRANT ALL ON TABLE "public"."game_opponent_observations" TO "authenticated";
GRANT ALL ON TABLE "public"."game_opponent_observations" TO "service_role";



GRANT ALL ON TABLE "public"."game_squads" TO "authenticated";
GRANT ALL ON TABLE "public"."game_squads" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."game_squads" TO "anon";



GRANT SELECT("game_id") ON TABLE "public"."game_squads" TO "anon";



GRANT SELECT("club_id") ON TABLE "public"."game_squads" TO "anon";



GRANT SELECT("player_id") ON TABLE "public"."game_squads" TO "anon";



GRANT SELECT("external_name") ON TABLE "public"."game_squads" TO "anon";



GRANT SELECT("external_jersey_number") ON TABLE "public"."game_squads" TO "anon";



GRANT SELECT("external_position") ON TABLE "public"."game_squads" TO "anon";



GRANT SELECT("source_age_group_id") ON TABLE "public"."game_squads" TO "anon";



GRANT SELECT("response_status") ON TABLE "public"."game_squads" TO "anon";



GRANT SELECT("jersey_number") ON TABLE "public"."game_squads" TO "anon";



GRANT SELECT("created_at") ON TABLE "public"."game_squads" TO "anon";



GRANT SELECT("updated_at") ON TABLE "public"."game_squads" TO "anon";



GRANT ALL ON TABLE "public"."game_stats_live" TO "anon";
GRANT ALL ON TABLE "public"."game_stats_live" TO "authenticated";
GRANT ALL ON TABLE "public"."game_stats_live" TO "service_role";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";



GRANT ALL ON TABLE "public"."gdpr_purge_audit" TO "service_role";



GRANT ALL ON TABLE "public"."grounds" TO "anon";
GRANT ALL ON TABLE "public"."grounds" TO "authenticated";
GRANT ALL ON TABLE "public"."grounds" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."kit_pieces" TO "anon";
GRANT ALL ON TABLE "public"."kit_pieces" TO "authenticated";
GRANT ALL ON TABLE "public"."kit_pieces" TO "service_role";



GRANT ALL ON TABLE "public"."lineup_corrections_log" TO "anon";
GRANT ALL ON TABLE "public"."lineup_corrections_log" TO "authenticated";
GRANT ALL ON TABLE "public"."lineup_corrections_log" TO "service_role";



GRANT ALL ON TABLE "public"."matchdays" TO "anon";
GRANT ALL ON TABLE "public"."matchdays" TO "authenticated";
GRANT ALL ON TABLE "public"."matchdays" TO "service_role";



GRANT ALL ON TABLE "public"."microciclos" TO "anon";
GRANT ALL ON TABLE "public"."microciclos" TO "authenticated";
GRANT ALL ON TABLE "public"."microciclos" TO "service_role";



GRANT ALL ON TABLE "public"."notification_recipients" TO "anon";
GRANT ALL ON TABLE "public"."notification_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."notification_inbox" TO "anon";
GRANT ALL ON TABLE "public"."notification_inbox" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_inbox" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."opponents" TO "anon";
GRANT ALL ON TABLE "public"."opponents" TO "authenticated";
GRANT ALL ON TABLE "public"."opponents" TO "service_role";



GRANT ALL ON TABLE "public"."player_age_group_eligibility" TO "anon";
GRANT ALL ON TABLE "public"."player_age_group_eligibility" TO "authenticated";
GRANT ALL ON TABLE "public"."player_age_group_eligibility" TO "service_role";



GRANT ALL ON TABLE "public"."player_behavioral_assessments" TO "anon";
GRANT ALL ON TABLE "public"."player_behavioral_assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."player_behavioral_assessments" TO "service_role";



GRANT ALL ON TABLE "public"."player_documents" TO "anon";
GRANT ALL ON TABLE "public"."player_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."player_documents" TO "service_role";



GRANT ALL ON TABLE "public"."player_registrations" TO "anon";
GRANT ALL ON TABLE "public"."player_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."player_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."players" TO "anon";
GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";



GRANT ALL ON TABLE "public"."training_attendance" TO "anon";
GRANT ALL ON TABLE "public"."training_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."training_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."player_season_stats" TO "anon";
GRANT ALL ON TABLE "public"."player_season_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."player_season_stats" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."pse_records" TO "anon";
GRANT ALL ON TABLE "public"."pse_records" TO "authenticated";
GRANT ALL ON TABLE "public"."pse_records" TO "service_role";



GRANT ALL ON TABLE "public"."public_rate_limit_counters" TO "service_role";



GRANT ALL ON TABLE "public"."public_share_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."season_objectives" TO "anon";
GRANT ALL ON TABLE "public"."season_objectives" TO "authenticated";
GRANT ALL ON TABLE "public"."season_objectives" TO "service_role";



GRANT ALL ON TABLE "public"."staff_invites" TO "anon";
GRANT ALL ON TABLE "public"."staff_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_invites" TO "service_role";



GRANT ALL ON TABLE "public"."staff_permissions" TO "anon";
GRANT ALL ON TABLE "public"."staff_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."team_staff" TO "anon";
GRANT ALL ON TABLE "public"."team_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."team_staff" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."training_phase_exercises" TO "anon";
GRANT ALL ON TABLE "public"."training_phase_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."training_phase_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."training_phases" TO "anon";
GRANT ALL ON TABLE "public"."training_phases" TO "authenticated";
GRANT ALL ON TABLE "public"."training_phases" TO "service_role";



GRANT ALL ON TABLE "public"."training_sessions" TO "anon";
GRANT ALL ON TABLE "public"."training_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."training_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."trainings" TO "anon";
GRANT ALL ON TABLE "public"."trainings" TO "authenticated";
GRANT ALL ON TABLE "public"."trainings" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist" TO "anon";
GRANT ALL ON TABLE "public"."waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































