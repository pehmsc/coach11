-- Adiciona segmentacao por tier comercial + dados fiscais/billing + estimativas
-- a `clubs`, preparando o wizard de criacao manual de clientes no backoffice.
--
-- Contexto: hoje `plan_type` so distingue 'individual' vs 'club'. Para suportar
-- a estrategia de 3 tiers (Individual self-service / Clube Standard sales-led /
-- Clube Pro sales-led com DB propria), introduzimos coluna dedicada `tier`.
-- Mantemos `plan_type` por compatibilidade (uso actual no proxy.ts/nav-config)
-- — ambos coexistem ate refactor futuro consolidar.
--
-- Tambem adicionamos campos fiscais (NIF, morada faturacao, etc) que o wizard
-- de criacao manual vai recolher, mais estimativas (escaloes/atletas/utilizadores
-- previstos) para sizing/pricing, e notas internas do operador.
--
-- Cleanup adicional: os 2 clubes "[technical]" pre-existentes (gerados pela
-- funcao ensure_age_group_technical_club() do legado quando o schema migrou de
-- "1 escalao = 1 club" para "1 club = N escaloes") sao convertidos para clubes
-- "normais" Standard, removendo o sufixo do nome e atribuindo slug humano.
-- Os escaloes ja associados via club_id mantem-se intactos.

-- ============================================================================
-- 1) Coluna tier — segmentacao comercial
-- ============================================================================

alter table public.clubs
  add column tier text not null default 'standard'
  check (tier in ('individual', 'standard', 'pro'));

comment on column public.clubs.tier is
  'Tier comercial do cliente: individual (self-service), standard (sales-led DB partilhada), pro (sales-led DB propria). Controla pricing, features e provisioning.';

-- Backfill: clubes com plan_type='individual' herdam tier='individual'.
-- Restantes ficam com o default 'standard'.
update public.clubs set tier = 'individual' where plan_type = 'individual';

-- ============================================================================
-- 2) Dados fiscais / billing
-- ============================================================================

alter table public.clubs add column legal_name text;
alter table public.clubs add column nif text;
alter table public.clubs add column billing_address text;
alter table public.clubs add column billing_email text;
alter table public.clubs add column country text not null default 'PT';

comment on column public.clubs.legal_name is 'Razao social (se diferente do nome comercial). Opcional.';
comment on column public.clubs.nif is 'NIF do clube (Portugal: 9 digitos). Recolhido no wizard de onboarding manual.';
comment on column public.clubs.billing_address is 'Morada de faturacao. Recolhida no wizard.';
comment on column public.clubs.billing_email is 'Email para envio de facturas (se diferente do email do coordenador). Opcional.';
comment on column public.clubs.country is 'Codigo ISO 3166-1 alpha-2 do pais. Default PT.';

-- ============================================================================
-- 3) Estimativas (informativo, ajuda em sizing/pricing)
-- ============================================================================

alter table public.clubs add column expected_age_groups_count integer;
alter table public.clubs add column expected_players_count integer;
alter table public.clubs add column expected_users_count integer;

comment on column public.clubs.expected_age_groups_count is
  'Numero de escaloes que o cliente prevê gerir. Opcional. Sizing/pricing.';
comment on column public.clubs.expected_players_count is
  'Numero de atletas previsto. Opcional. Sizing/pricing.';
comment on column public.clubs.expected_users_count is
  'Numero total de utilizadores previsto (coordenadores + treinadores + staff). Opcional. Sizing.';

-- ============================================================================
-- 4) Notas internas (visiveis apenas no backoffice)
-- ============================================================================

alter table public.clubs add column notes text;

comment on column public.clubs.notes is
  'Notas internas do operador (Pedro) sobre o cliente — historia de suporte, condicoes especiais, etc. Nao visiveis ao coordenador do clube.';

-- ============================================================================
-- 5) Marcar CFB como Pro
-- ============================================================================

update public.clubs
set tier = 'pro'
where id = '2636b193-e9d6-40c3-94d5-5e04eb2f470e';
-- Clube de Futebol "Os Belenenses"

-- ============================================================================
-- 6) Cleanup dos clubes "[technical]"
--    Renomear + slug humano. Mantem tier='standard' (default).
-- ============================================================================

update public.clubs
set
  name = 'Escola de Futebol Os Belenenses · Sub-13',
  slug = 'efb-sub-13'
where id = '6a01c7bb-90cb-4605-b737-ea45d581c485';

update public.clubs
set
  name = 'Escola Futebol Belém · Sub-10',
  slug = 'efb-belem-sub-10'
where id = '26cc50bc-ffb6-4dac-9de4-2950b032d3a7';
