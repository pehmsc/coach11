# COACH11 - AUDITORIA FORENSE POS-HARDENING (C1..C6)

Data: 2026-02-23  
Baseline hardening: `0405b90`  
Estado local auditado: `9e7f467`

## Resumo executivo
- O isolamento multi-club foi provado em runtime com JWT real (`authenticated`): cross-club write bloqueado por RLS.
- Evidencia objetiva: erros `HTTP 403` + `SQLSTATE 42501` em writes cross-club (convocation/live/stats).
- Dentro do mesmo clube, com perfil autorizado, writes funcionam (toggle convocation, checkpoint upsert, event insert/delete, stats upsert).
- Wrappers autenticados para finalize/recalculate estao ativos e com grants para `authenticated`.
- `createAdminClient` reduziu de `12 ficheiros / 15 ocorrencias` para `8 ficheiros / 9 ocorrencias`.
- Nesta iteracao final de cleanup **nao houve alteracao de endpoints, contratos JSON, status codes, nem writes adicionais**.
- O script `supabase/forensics/forensic_runtime_c6_final.sql` e read-only e serve para reprodutibilidade forense.
- Os testes de write runtime C6 ja foram provados antes; o script final nao repete writes por desenho.

## Evidencias por etapa (C1..C6)

| Etapa | Evidencia | Resultado |
|---|---|---|
| C1 | `rpc_redeem_staff_invite` atomica/idempotente | evita estado parcial e duplicacao em redeem |
| C1 fix | `20260224230000_redeem_cross_club_guard.sql` | bloqueio cross-club no redeem |
| C4 | `20260224235000_convocation_live_read_policies_v1.sql` | leitura funcional via RLS no dominio convocation/live |
| C5 | `20260225001000_convocation_live_write_policies_v1.sql` | escrita intra-club permitida, cross-club bloqueada |
| C5 | `20260225002000_game_rpcs_authenticated_wrappers_v1.sql` | wrappers auth com validacao por `auth.uid()` + gates |
| C6 runtime NEG | JWT `user_a` contra clube B | `HTTP 403` + `42501` em `convocation_players`, `game_events`, `game_live_checkpoints`, `game_stats_live` |
| C6 runtime POS | JWT `user_b` no clube A | writes permitidos conforme modelo intra-club |

### Nota sobre SQLSTATE 42501
`42501` = negacao de permissao no Postgres (RLS/ACL).  
No contexto C6, e o sinal esperado de bloqueio cross-club.

## Migrations relevantes (aplicadas)

| Migration | Objetivo |
|---|---|
| `20260224130000_multi_club_foundation.sql` | fundacao multi-club (`clubs`, `club_memberships`, `club_id` em base) |
| `20260224143000_multi_club_propagation.sql` | propagacao de `club_id` + RLS base |
| `20260224200000_multi_club_live_convocation_attendance.sql` | boundary 2C em convocation/live/attendance |
| `20260224203000_atomic_game_rpcs.sql` | RPCs atomicas finalize/recalculate |
| `20260224223000_atomic_redeem_staff_invite_rpc.sql` | redeem atomico/idempotente |
| `20260224230000_redeem_cross_club_guard.sql` | guard anti cross-club no redeem |
| `20260224232000_statistics_attendance_rpcs.sql` | consolidacao DB para hotspots stats/attendance |
| `20260224234000_notifications_insert_policy.sql` | insert controlado em notifications |
| `20260224235000_convocation_live_read_policies_v1.sql` | policies read funcionais (convocation/live) |
| `20260225001000_convocation_live_write_policies_v1.sql` | policies write funcionais (convocation/live) |
| `20260225002000_game_rpcs_authenticated_wrappers_v1.sql` | wrappers auth para RPCs de jogo |

## Grant snapshot (wrappers vs base RPC)

Query de referencia:

```sql
select
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name in (
    'rpc_finalize_game_auth',
    'rpc_recalculate_game_summary_auth',
    'rpc_game_access_context',
    'rpc_redeem_staff_invite'
  )
order by routine_name, grantee, privilege_type;
```

Snapshot confirmado:

| routine_name | grantee | privilege_type |
|---|---|---|
| rpc_finalize_game_auth | authenticated | EXECUTE |
| rpc_finalize_game_auth | postgres | EXECUTE |
| rpc_finalize_game_auth | service_role | EXECUTE |
| rpc_recalculate_game_summary_auth | authenticated | EXECUTE |
| rpc_recalculate_game_summary_auth | postgres | EXECUTE |
| rpc_recalculate_game_summary_auth | service_role | EXECUTE |
| rpc_game_access_context | authenticated | EXECUTE |
| rpc_game_access_context | postgres | EXECUTE |
| rpc_game_access_context | service_role | EXECUTE |
| rpc_redeem_staff_invite | postgres | EXECUTE |
| rpc_redeem_staff_invite | service_role | EXECUTE |

Interpretacao:
- `rpc_finalize_game_auth`, `rpc_recalculate_game_summary_auth` e `rpc_game_access_context` estao expostos para `authenticated` (ok para caminho app com JWT).
- `rpc_redeem_staff_invite` continua **service-role-only** (sem grant para `authenticated`) por decisao faseada atual.

## Admin remanescente (8 ficheiros / 9 ocorrencias)

Antes C6 (HEAD): `12 ficheiros / 15 ocorrencias`  
Depois C6: `8 ficheiros / 9 ocorrencias`

1. `src/app/api/team/logo/route.ts`  
Motivo: `storage admin`  
Classe: inevitavel (neste desenho)
2. `src/app/api/me/account/route.ts`  
Motivo: `auth.admin.deleteUser`  
Classe: inevitavel
3. `src/app/api/staff/[id]/route.ts`  
Motivo: `auth.admin.getUserById/updateUserById`  
Classe: inevitavel parcial
4. `src/app/api/invite/redeem/route.ts`  
Motivo: depende de `rpc_redeem_staff_invite` **service-role-only**  
Classe: por fazer (wrapper auth para redeem em C7)
5. `src/app/api/invite/sync/route.ts`  
Motivo: fluxo legado admin-first  
Classe: por fazer
6. `src/app/api/calendar/events/route.ts`  
Motivo: contexto ainda resolvido via admin  
Classe: por fazer
7. `src/app/api/games/[id]/convocation/kits/route.ts`  
Motivo: write policy funcional ainda pendente  
Classe: por fazer
8. `src/app/api/games/[id]/convocation/tactical/route.ts`  
Motivo: update em `games` ainda via admin  
Classe: por fazer

## Estado de contratos (API)
- Nesta iteracao final de cleanup, nenhum endpoint foi alterado.
- Nao houve mudanca de shape JSON, status code, UX, nem fluxo funcional.

## Proximos passos (C7 opcional)
1. Criar wrapper autenticado para redeem e migrar `invite/redeem` para remover service-role no caminho autenticado.
2. Fechar migracao de `calendar/events`, `convocation/kits`, `convocation/tactical`, `invite/sync` para server client + RLS.
3. Reduzir admin remanescente aos casos estritamente inevitaveis (`auth.admin` e `storage`).
4. So depois executar cleanup de dados forenses no DB.

## Checklist manual (SQL Editor)

1. Abrir `supabase/forensics/forensic_runtime_c6_final.sql`.
2. (Opcional) ajustar IDs no bloco `set_config`.
3. Executar script completo.
4. Copiar para o dossie, exatamente:
   - `ACTIVE CONTEXT`
   - `A1` (RLS flags)
   - `A2` (pg_policies)
   - `role_routine_grants` snapshot
   - `NOTICE A3/A4/A5`

## Verificacoes locais

```bash
npx tsc --noEmit
npm run test -- --run
```

`npm run build` pode falhar em rede restrita por Google Fonts; nao e regressao de TS/API.
