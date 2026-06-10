-- Pipeline de purga RGPD (Bloco E) — fundacoes de schema.
--
-- 1) clubs: agendamento da purga + flags de idempotencia dos avisos d30/d53
--    (padrao identico a trial_reminder_sent_at).
-- 2) gdpr_purge_audit: registo de conformidade counts-only, sem PII.
--    - club_id deliberadamente SEM foreign key: o registo e a prova de
--      conformidade e tem de sobreviver a qualquer futura remocao da linha
--      de clubs. A ponte pos-purga com a faturacao e o stripe_customer_id.
--    - RLS activa sem policies: acesso exclusivo via service role
--      (padrao audit_logs). Sem auto-expiracao.

alter table public.clubs
  add column if not exists data_purge_scheduled_at timestamptz,
  add column if not exists purge_warning_d30_sent_at timestamptz,
  add column if not exists purge_warning_d53_sent_at timestamptz;

comment on column public.clubs.data_purge_scheduled_at is
  'RGPD: momento em que os dados operacionais do clube serao purgados (fim da subscricao + 60 dias). Apenas plan_type=individual. NULL = sem purga agendada.';

create table if not exists public.gdpr_purge_audit (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  club_name text not null,
  stripe_customer_id text,
  trigger_reason text not null default 'subscription_canceled',
  scheduled_at timestamptz,
  executed_at timestamptz not null default now(),
  dry_run boolean not null default false,
  deleted_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.gdpr_purge_audit is
  'Prova de conformidade RGPD: uma linha por purga executada (ou simulada em dry-run), com counts de linhas eliminadas por tabela. Zero PII. Sem auto-expiracao.';

alter table public.gdpr_purge_audit enable row level security;

revoke all on table public.gdpr_purge_audit from anon, authenticated;
