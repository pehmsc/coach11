-- Permite 'google' como location_source em games e training_sessions.
--
-- NOTA DE SINCRONIZACAO: esta migracao foi aplicada no remoto a 2026-06-15
-- (provavelmente via dashboard/MCP) mas o ficheiro local perdeu-se, criando
-- drift que bloqueava `supabase db push`. Recriada aqui com os statements
-- exatos registados em supabase_migrations.schema_migrations para o historico
-- local voltar a bater certo com producao. Ja aplicada no remoto — o push nao
-- a reaplica. Relacionada com o provider de localizacao (Google Places + OSM).

alter table public.games drop constraint if exists games_location_source_check;
alter table public.games add constraint games_location_source_check
  check (location_source is null or location_source = any (array['osm'::text, 'manual'::text, 'google'::text]));

alter table public.training_sessions drop constraint if exists training_sessions_location_source_check;
alter table public.training_sessions add constraint training_sessions_location_source_check
  check (location_source is null or location_source = any (array['osm'::text, 'manual'::text, 'google'::text]));
