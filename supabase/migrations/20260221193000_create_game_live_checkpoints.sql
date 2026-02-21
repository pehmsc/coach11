-- Live game clock checkpoints persisted in Supabase.
-- Purpose: keep phase + clock recoverable across refresh/background/device lock.

create table if not exists public.game_live_checkpoints (
  game_id uuid primary key references public.games(id) on delete cascade,
  phase text not null
    check (phase in ('pre_match', 'first_half', 'halftime', 'second_half', 'review', 'completed')),
  base_seconds integer not null default 0 check (base_seconds >= 0),
  running_since_ms bigint check (running_since_ms is null or running_since_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create index if not exists idx_game_live_checkpoints_updated_at
  on public.game_live_checkpoints(updated_at desc);
