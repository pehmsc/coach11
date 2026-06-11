-- Asserção 7: comportamento do finalize.
-- 7a (core, como postgres — a superfície de GRANTs é coberta pelo 003):
--   escreve score_home/score_away e status -> completed; segundo finalize é
--   substituição idempotente (actualiza, não duplica nem rejeita); status
--   terminal 'cancelled' é preservado (hotfix PR #126).
-- 7b (wrapper auth): A1 (coordenador do escalão) finaliza via
--   rpc_finalize_game_auth; B1 (outro clube) é rejeitado; anon não tem
--   EXECUTE no wrapper.

begin;
select plan(14);

-- 7a: finalize inicial
select lives_ok(
  $$select public.rpc_finalize_game(
      'd1000000-0000-4000-8000-00000000000a', '[]'::jsonb, 3, 1,
      null, 'a1000000-0000-4000-8000-000000000001', false)$$,
  'finalize inicial executa');

select is(
  (select score_home from public.games
    where id = 'd1000000-0000-4000-8000-00000000000a'),
  3, 'score_home escrito');
select is(
  (select score_away from public.games
    where id = 'd1000000-0000-4000-8000-00000000000a'),
  1, 'score_away escrito');
select is(
  (select status from public.games
    where id = 'd1000000-0000-4000-8000-00000000000a'),
  'completed', 'status transita para completed');

-- 7a: segundo finalize do mesmo jogo = substituicao idempotente
select lives_ok(
  $$select public.rpc_finalize_game(
      'd1000000-0000-4000-8000-00000000000a', '[]'::jsonb, 2, 2,
      null, 'a1000000-0000-4000-8000-000000000001', false)$$,
  'segundo finalize do mesmo jogo nao e rejeitado');
select is(
  (select score_home from public.games
    where id = 'd1000000-0000-4000-8000-00000000000a'),
  2, 'segundo finalize substitui score_home');
select is(
  (select score_away from public.games
    where id = 'd1000000-0000-4000-8000-00000000000a'),
  2, 'segundo finalize substitui score_away');

-- 7a: status terminal preservado
select lives_ok(
  $$select public.rpc_finalize_game(
      'd1000000-0000-4000-8000-00000000000b', '[]'::jsonb, 1, 0,
      null, 'a1000000-0000-4000-8000-000000000001', false)$$,
  'finalize de jogo cancelado executa');
select is(
  (select status from public.games
    where id = 'd1000000-0000-4000-8000-00000000000b'),
  'cancelled', 'status terminal cancelled e preservado');
select is(
  (select score_home from public.games
    where id = 'd1000000-0000-4000-8000-00000000000b'),
  1, 'score escrito mesmo com status terminal');

-- 7b: wrapper auth como A1 (coordenador do escalao do jogo)
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","email":"a1@coach11.test"}',
  true);
set local role authenticated;
select lives_ok(
  $$select public.rpc_finalize_game_auth(
      'd1000000-0000-4000-8000-00000000000a', '[]'::jsonb, 4, 0, null, null)$$,
  'A1 finaliza via wrapper rpc_finalize_game_auth');

reset role;
select is(
  (select score_home from public.games
    where id = 'd1000000-0000-4000-8000-00000000000a'),
  4, 'wrapper escreveu o score');

-- 7b: B1 (outro clube) e rejeitado pelo wrapper
select set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated","email":"b1@coach11.test"}',
  true);
set local role authenticated;
select throws_ok(
  $$select public.rpc_finalize_game_auth(
      'd1000000-0000-4000-8000-00000000000a', '[]'::jsonb, 9, 9, null, null)$$,
  '42501', null,
  'B1 (outro clube) rejeitado pelo wrapper');

-- 7b: anon sem EXECUTE no wrapper
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$select public.rpc_finalize_game_auth(
      'd1000000-0000-4000-8000-00000000000a', '[]'::jsonb, 9, 9, null, null)$$,
  '42501', null,
  'anon sem EXECUTE no wrapper');

select * from finish();
rollback;
