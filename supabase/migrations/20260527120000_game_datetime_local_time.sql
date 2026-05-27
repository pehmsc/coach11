-- Refactor games.game_datetime: timestamptz -> timestamp without time zone
--
-- Motivacao: eliminar a classe de bugs de fuso horario passando a guardar a
-- hora do jogo como wall-clock literal em Europe/Lisbon (Coach11 e 100% PT).
-- A coluna timestamptz forcava conversao UTC <-> Lisboa em todas as leituras
-- e escritas; uma leitura que nao convertesse mostrava UTC (1h adiantada no
-- horario de verao). Pos-refactor a string guardada e a string mostrada sao
-- iguais ("12:00" guarda "12:00", le "12:00") e o codigo deixa de precisar
-- de fazer conversoes de fuso para apresentar o valor.
--
-- Verificacao MCP previa: nenhuma view (pg_depend) nem RPC (pg_proc) depende
-- da coluna. Amostra antes/depois confirmada coerente com concentration_time.
--
-- O default now() e removido: um jogo sem game_datetime explicito e dado
-- invalido. O form sempre envia data+hora; manter o default mascarava bugs
-- e em timestamp without time zone gravaria now() em UTC do servidor (Vercel)
-- e nao em hora local de Portugal.

ALTER TABLE games
  ALTER COLUMN game_datetime TYPE timestamp without time zone
  USING (game_datetime AT TIME ZONE 'Europe/Lisbon');

ALTER TABLE games ALTER COLUMN game_datetime DROP DEFAULT;
