-- Fixtures dos testes de regressão DB (Bloco D).
-- Dois clubes sintéticos com IDs fixos — NUNCA dados de produção.
--
-- Personas:
--   A1 — coordenador do escalão do clube X (positivo de leitura/escrita)
--   A2 — colega do clube X (membership simples; visível a A1 via profiles)
--   B1 — coordenador do escalão do clube Y (negativo de isolamento)
--
-- Idempotente: apaga pelas PKs fixas antes de inserir (cascades tratam dos
-- filhos). O trigger handle_new_user vive em auth.users e não faz parte do
-- baseline (schema auth excluído do dump), por isso os profiles são criados
-- explicitamente.

begin;

delete from public.clubs where id in (
  'c1000000-0000-4000-8000-000000000004',
  'c2000000-0000-4000-8000-000000000005'
);
delete from auth.users where id in (
  'a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000003'
);

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'a1@coach11.test'),
  ('a2000000-0000-4000-8000-000000000002', 'a2@coach11.test'),
  ('b1000000-0000-4000-8000-000000000003', 'b1@coach11.test');

insert into public.profiles (id, full_name, role) values
  ('a1000000-0000-4000-8000-000000000001', 'Coordenador Clube X', 'coordinator'),
  ('a2000000-0000-4000-8000-000000000002', 'Colega Clube X', 'coach'),
  ('b1000000-0000-4000-8000-000000000003', 'Coordenador Clube Y', 'coordinator');

insert into public.clubs (id, name, slug) values
  ('c1000000-0000-4000-8000-000000000004', 'Clube Teste X', 'clube-teste-x'),
  ('c2000000-0000-4000-8000-000000000005', 'Clube Teste Y', 'clube-teste-y');

insert into public.club_memberships (club_id, profile_id, role) values
  ('c1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('c1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000002', 'staff'),
  ('c2000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000003', 'owner');

insert into public.age_groups (id, club_id, coordinator_id, name, football_format) values
  ('e1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000004',
   'a1000000-0000-4000-8000-000000000001', 'Escalao Teste X', '7'),
  ('e2000000-0000-4000-8000-000000000007', 'c2000000-0000-4000-8000-000000000005',
   'b1000000-0000-4000-8000-000000000003', 'Escalao Teste Y', '7');

insert into public.teams (id, age_group_id, club_id, name) values
  ('f1000000-0000-4000-8000-000000000008', 'e1000000-0000-4000-8000-000000000006',
   'c1000000-0000-4000-8000-000000000004', 'Equipa Teste X'),
  ('f2000000-0000-4000-8000-000000000009', 'e2000000-0000-4000-8000-000000000007',
   'c2000000-0000-4000-8000-000000000005', 'Equipa Teste Y');

insert into public.games (id, team_id, age_group_id, club_id, game_datetime, status) values
  -- jogo X "scheduled": alvo do finalize (007)
  ('d1000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000008',
   'e1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000004',
   '2026-06-01 10:00:00', 'scheduled'),
  -- jogo X "cancelled": preservacao de status terminal (007)
  ('d1000000-0000-4000-8000-00000000000b', 'f1000000-0000-4000-8000-000000000008',
   'e1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000004',
   '2026-06-02 10:00:00', 'cancelled'),
  -- jogo Y: invisivel para A1 (002)
  ('d2000000-0000-4000-8000-00000000000c', 'f2000000-0000-4000-8000-000000000009',
   'e2000000-0000-4000-8000-000000000007', 'c2000000-0000-4000-8000-000000000005',
   '2026-06-03 10:00:00', 'scheduled');

insert into public.players (id, age_group_id, club_id, first_name, last_name) values
  ('aa000000-0000-4000-8000-00000000000d', 'e1000000-0000-4000-8000-000000000006',
   'c1000000-0000-4000-8000-000000000004', 'Jogador', 'Teste X'),
  ('bb000000-0000-4000-8000-00000000000e', 'e2000000-0000-4000-8000-000000000007',
   'c2000000-0000-4000-8000-000000000005', 'Jogador', 'Teste Y');

insert into public.training_sessions (id, team_id, age_group_id, club_id, session_date, start_time) values
  ('ac000000-0000-4000-8000-00000000000f', 'f1000000-0000-4000-8000-000000000008',
   'e1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000004',
   '2026-06-01', '18:00'),
  ('bc000000-0000-4000-8000-000000000010', 'f2000000-0000-4000-8000-000000000009',
   'e2000000-0000-4000-8000-000000000007', 'c2000000-0000-4000-8000-000000000005',
   '2026-06-01', '18:00');

commit;
