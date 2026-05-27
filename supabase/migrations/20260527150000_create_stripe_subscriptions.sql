-- A1 Stripe self-service — campos de subscricao em `clubs` e tabela de eventos
-- processados (idempotencia de webhooks).
--
-- O Coach11 modela cada utilizador Individual como um clube com plan_type='individual'
-- e tier='individual'. Estes campos so se aplicam a este caso de uso; clubes sales-led
-- (plan_type='club', tier='standard'/'pro') ignoram-nos e podem ter NULL.
--
-- O modelo permite tracking de:
--   - Estado da subscricao Stripe (trialing/active/past_due/canceled/...)
--   - Fim do trial (UI mostra contador)
--   - Fim do periodo actual (proxima cobranca / fim de acesso apos cancel)
--   - Cancelamento agendado para fim do periodo (cancel_at_period_end)

alter table public.clubs
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column subscription_status text
    check (
      subscription_status is null
      or subscription_status in (
        'trialing', 'active', 'past_due', 'canceled',
        'incomplete', 'incomplete_expired', 'unpaid', 'paused'
      )
    ),
  add column subscription_current_period_end timestamptz,
  add column trial_ends_at timestamptz,
  add column subscription_cancel_at_period_end boolean not null default false,
  add column trial_reminder_sent_at timestamptz;

comment on column public.clubs.stripe_customer_id is
  'ID do customer Stripe (cus_...). NULL para clubes sales-led (plan_type=club).';
comment on column public.clubs.stripe_subscription_id is
  'ID da subscricao Stripe (sub_...). NULL para sales-led ou pre-Stripe.';
comment on column public.clubs.subscription_status is
  'Estado Stripe sincronizado via webhook. NULL = sem subscricao (sales-led ou onboarding incompleto).';
comment on column public.clubs.subscription_current_period_end is
  'Fim do periodo actual: data da proxima cobranca, OU fim de acesso se cancel_at_period_end=true.';
comment on column public.clubs.trial_ends_at is
  'Quando o trial termina. NULL apos active. Usado para banner UI e email reminder ao dia 5.';
comment on column public.clubs.subscription_cancel_at_period_end is
  'Se true, subscricao expira em current_period_end (canceled pelo user via Customer Portal).';
comment on column public.clubs.trial_reminder_sent_at is
  'Quando enviamos o email "trial a terminar". Idempotencia para o cron.';

-- Unique only when not null — Stripe ids sao globais
create unique index clubs_stripe_customer_id_unique
  on public.clubs (stripe_customer_id) where stripe_customer_id is not null;
create unique index clubs_stripe_subscription_id_unique
  on public.clubs (stripe_subscription_id) where stripe_subscription_id is not null;

-- Index para o cron de trial reminders
create index clubs_trial_ends_at_idx
  on public.clubs (trial_ends_at) where trial_reminder_sent_at is null;

-- ============================================================================
-- Tabela de eventos Stripe processados (idempotencia)
-- ============================================================================
-- Stripe pode reenviar o mesmo webhook em caso de timeout. Esta tabela permite
-- detectar duplicados e devolver 200 OK sem re-processar.

create table public.stripe_webhook_events (
  id text primary key,                       -- Stripe event id (evt_...)
  type text not null,                        -- "customer.subscription.updated" etc.
  api_version text,
  processed_at timestamptz not null default now(),
  payload jsonb
);

comment on table public.stripe_webhook_events is
  'Audit log de webhooks Stripe processados. Idempotencia: row existente = ja processado.';

create index stripe_webhook_events_type_idx
  on public.stripe_webhook_events (type);
create index stripe_webhook_events_processed_at_idx
  on public.stripe_webhook_events (processed_at desc);

-- RLS: so super-admin le; webhook handler usa service role (bypass)
alter table public.stripe_webhook_events enable row level security;

create policy "stripe_webhook_events_super_admin_select"
  on public.stripe_webhook_events
  for select
  to authenticated
  using (public.user_is_super_coordinator());
