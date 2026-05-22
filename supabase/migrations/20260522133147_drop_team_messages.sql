-- Feature de mensagens (chat de equipa tecnica) descontinuada.
-- Remover realtime, policies e tabelas. Dados eram de teste (ultima msg 8 Mar 2026).

-- 1. Remover da publicacao realtime (ambas estavam em supabase_realtime, confirmado via MCP)
alter publication supabase_realtime drop table public.team_message_reads;
alter publication supabase_realtime drop table public.team_messages;

-- 2. DROP (CASCADE remove policies, FKs proprias e o trigger trg_team_messages_sync_club_id;
--    team_message_reads cai primeiro por seguranca)
drop table if exists public.team_message_reads cascade;
drop table if exists public.team_messages cascade;
