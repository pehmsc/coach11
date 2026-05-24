-- Corrige os 16 jogos cujo game_datetime ficou enviesado +1h por causa do bug
-- de timezone na escrita (PR #223). Antes do fix, calendar-events.service
-- concatenava `${date}T${time}:00` sem indicador de timezone, e o Postgres
-- (coluna `timestamptz`) interpretava como UTC literal. Para um utilizador
-- em horario de verao (WEST = UTC+1) a inserir "18:20" hora de Lisboa,
-- ficava gravado "18:20+00" UTC = "19:20 Lisboa" — enviesamento de +1h.
--
-- Em horario de inverno (WET = UTC+0) a coincidencia entre concat-as-UTC e
-- local annulava o bug, pelo que apenas os jogos criados entre o inicio do
-- DST 2026 (29 Mar 2026 01:00 UTC = 02:00 Lisboa) e o deploy do PR #223
-- estao afectados. Lista validada antes da migration:
--
--   select id, opponent_name, game_datetime, created_at at time zone 'Europe/Lisbon'
--   from games where created_at >= '2026-03-29 01:00:00+00';
--
-- Resultado: 16 linhas (Abr+Mai 2026). Aplicar -1 hora.
--
-- Em vez de criterio temporal cego (created_at >= X), uso uma lista
-- explicita de IDs para tornar a operacao auditavel e proteger contra
-- jogos eventualmente criados pelo path correcto neste intervalo (ex:
-- via PATCH /api/games/[id], que sempre usou new Date().toISOString()
-- correctamente). 16 IDs validados manualmente.
--
-- Pos-migration: confirmar via
--   select game_datetime at time zone 'Europe/Lisbon' from games where id in (...);
-- que as horas correspondem agora a intencao do utilizador (18:20 em vez
-- de 19:20 no jogo de teste, etc).

UPDATE public.games
SET game_datetime = game_datetime - INTERVAL '1 hour'
WHERE id IN (
  '131d2bc7-b463-4f6a-b180-45eccee55ed0', -- Povoense "B" — 11 Abr
  '6402cbc0-73be-4547-a3fb-2c5c592ec3cf', -- CF Unidos — 18 Abr
  '21219439-713e-44f2-945e-7cfff428c4d8', -- CD Mafra — 18 Abr
  '0cd84b8f-9503-4d3a-8ddf-ef9bc65d5a55', -- Associacao Torre — 25 Abr
  '8995d434-ef56-46bf-97f5-acef91c37f21', -- Carcavelos — 25 Abr
  '9e315740-7748-46c0-8f1d-1bc97fd994f7', -- Torre — 1 Mai
  'e20a221c-29a1-44c1-a3d3-3b7183c8afc0', -- Carcavelos — 1 Mai
  'd4708ba0-0ed7-483a-9ed8-958425b4fc41', -- Ponterrolense — 2 Mai
  '9df853f7-1967-4abc-9b64-3e6bc5d163a3', -- Bless Academy — 2 Mai
  '7b32ac9a-e2cf-45cb-bb9f-27bdace3ac21', -- Lourinhanense — 9 Mai
  '21e4aeb0-b8b0-400d-94ff-85de40c38451', -- Aguias de Camarate — 16 Mai
  'bc054872-0848-4503-b699-673ac2833628', -- Casa Pia "A" — 16 Mai
  'bed4db5d-a000-46b1-862d-67ad61879aef', -- 3F — 23 Mai
  'b14aea9d-4e7e-4a0b-bc5b-2587e7145b91', -- Teste — 18 Mai
  '72b2dd3f-9520-4100-97b6-c8c96abb85a4', -- Club Internacional de Foot-Ball — 23 Mai
  'f9ff46ac-35de-4310-ad51-679e8dd3e56e'  -- teste — 24 Mai (o jogo que motivou a investigacao)
);
