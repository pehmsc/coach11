-- Ensure one live-state row per (game, player).
-- This prevents duplicate statuses and keeps lineup/live state consistent.

with ranked as (
  select
    id,
    row_number() over (
      partition by game_id, player_id
      order by updated_at desc nulls last, id desc
    ) as rn
  from public.game_stats_live
)
delete from public.game_stats_live gsl
using ranked r
where gsl.id = r.id
  and r.rn > 1;

create unique index if not exists idx_game_stats_live_game_player_unique
  on public.game_stats_live(game_id, player_id);
