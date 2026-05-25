-- Adiciona colunas dedicadas a `clubs` para guardar dados do coordenador
-- pendente recolhidos no wizard `/admin/clubs/new`, separando-os das
-- `notes` (texto livre). Necessario para a accao "Enviar convite" do
-- snapshot — o endpoint precisa de ler email/nome de forma estruturada.
--
-- Quando o coordenador efectivamente se regista e a `club_memberships`
-- ganha a entrada com role `club_coordinator`, estes campos passam a ser
-- redundantes (pode-se manter como historico ou limpar — decisao futura).

alter table public.clubs add column pending_coordinator_name text;
alter table public.clubs add column pending_coordinator_email text;
alter table public.clubs add column pending_coordinator_phone text;
alter table public.clubs add column pending_coordinator_invite_sent_at timestamptz;

comment on column public.clubs.pending_coordinator_name is
  'Nome do coordenador pendente, recolhido no wizard de onboarding manual. Limpa-se quando o coordenador se regista.';
comment on column public.clubs.pending_coordinator_email is
  'Email do coordenador pendente. Usado pelo endpoint invite-coordinator para enviar email.';
comment on column public.clubs.pending_coordinator_phone is
  'Telefone do coordenador pendente. Referencia interna.';
comment on column public.clubs.pending_coordinator_invite_sent_at is
  'Timestamp do ultimo envio de convite via /admin/clubs/[id]/invite-coordinator. NULL se ainda nao foi enviado.';
