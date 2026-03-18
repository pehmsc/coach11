create or replace function public.get_player_season_stats(
  p_club_id uuid,
  p_age_group_id uuid,
  p_season text default null
)
returns table (
  player_id uuid,
  player_name text,
  player_number integer,
  player_position text,
  games_convoked integer,
  games_started integer,
  games_substitute integer,
  total_minutes integer,
  goals integer,
  assists integer,
  yellow_cards integer,
  red_cards integer,
  own_goals integer,
  avg_rating numeric(3,1),
  attendance_total integer,
  attendance_present integer,
  attendance_absent integer,
  attendance_late integer,
  attendance_injured integer,
  attendance_rate numeric(5,2)
)
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.get_player_season_stats(uuid, uuid, text) from public;
revoke all on function public.get_player_season_stats(uuid, uuid, text) from anon;
revoke all on function public.get_player_season_stats(uuid, uuid, text) from authenticated;
grant execute on function public.get_player_season_stats(uuid, uuid, text) to authenticated;
grant execute on function public.get_player_season_stats(uuid, uuid, text) to service_role;
