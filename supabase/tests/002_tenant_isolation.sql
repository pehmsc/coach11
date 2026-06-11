-- Asserção 2 (Bloco A): isolamento tenant geral (amostra).
-- Membro do clube X não lê players/games/training_sessions do clube Y,
-- e vice-versa. Positivo de controlo: cada coordenador lê os dados do
-- próprio clube.

begin;
select plan(8);

-- como A1 (coordenador do clube X)
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","email":"a1@coach11.test"}',
  true);
set local role authenticated;

select is(
  (select count(*)::int from public.players
    where id = 'aa000000-0000-4000-8000-00000000000d'),
  1,
  'A1 le o jogador do clube X');

select is(
  (select count(*)::int from public.players
    where id = 'bb000000-0000-4000-8000-00000000000e'),
  0,
  'A1 NAO le o jogador do clube Y');

select is(
  (select count(*)::int from public.games
    where club_id = 'c1000000-0000-4000-8000-000000000004'),
  2,
  'A1 le os jogos do clube X');

select is(
  (select count(*)::int from public.games
    where id = 'd2000000-0000-4000-8000-00000000000c'),
  0,
  'A1 NAO le o jogo do clube Y');

select is(
  (select count(*)::int from public.training_sessions
    where id = 'ac000000-0000-4000-8000-00000000000f'),
  1,
  'A1 le o treino do clube X');

select is(
  (select count(*)::int from public.training_sessions
    where id = 'bc000000-0000-4000-8000-000000000010'),
  0,
  'A1 NAO le o treino do clube Y');

-- como B1 (coordenador do clube Y)
reset role;
select set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated","email":"b1@coach11.test"}',
  true);
set local role authenticated;

select is(
  (select count(*)::int from public.players
    where id = 'aa000000-0000-4000-8000-00000000000d'),
  0,
  'B1 NAO le o jogador do clube X');

select is(
  (select count(*)::int from public.players
    where id = 'bb000000-0000-4000-8000-00000000000e'),
  1,
  'B1 le o jogador do clube Y');

select * from finish();
rollback;
