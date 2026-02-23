# COACH11 - AUDITORIA FORENSE POS-HARDENING (C1..C6)

Data: 2026-02-23  
Baseline hardening: `0405b90`  
Estado local auditado: `9e7f467` (worktree com mudancas C6 ainda nao commitadas)

## Resumo Executivo
- O boundary multi-club em runtime foi provado com JWT real (role `authenticated`), sem depender de checks da app.
- Evidencia principal: tentativas cross-club de write retornam `HTTP 403` + `SQLSTATE 42501` (RLS deny), de forma consistente em `convocation_players`, `game_events`, `game_live_checkpoints`, `game_stats_live`.
- Dentro do mesmo clube, com perfil autorizado, writes de convocation/live funcionam (toggle, checkpoint upsert, event insert/delete, stats upsert).
- Wrappers RPC autenticados para finalize/recalculate estao ativos e respeitam gate por clube/perfil.
- Superficie `createAdminClient` reduziu de `12 ficheiros / 15 ocorrencias` para `8 ficheiros / 9 ocorrencias`.
- Nao houve alteracao intencional de UX/fluxo/contratos JSON nesta fase de cleanup.
- Build continua a falhar apenas por fetch de Google Fonts em rede restrita; `tsc` e testes passam.

## Evidencias por Etapa (C1..C6)

| Etapa | Evidencia | Output-chave | Leitura de risco |
|---|---|---|---|
| C1 | `rpc_redeem_staff_invite` transacional + idempotente | double redeem sem duplicacao em `team_staff`; status coerente | reduz risco de estado parcial e race |
| C1 fix | `20260224230000_redeem_cross_club_guard.sql` | redeem cross-club bloqueado (mapeado para 403) | fecha bypass tenant em convite |
| C2/C3 | migracoes read/context + RPC stats/attendance | menos dependencias de admin nas rotas migradas | reduz bypass de RLS e fan-out |
| C4 | `20260224235000_convocation_live_read_policies_v1.sql` | policies funcionais de SELECT sobre dominio live/convocation | leitura passa por RLS club boundary |
| C5 | `20260225001000_convocation_live_write_policies_v1.sql` | write policies permissivas com boundary restritivo mantido | write intra-club permitido, cross-club bloqueado |
| C5 | `20260225002000_game_rpcs_authenticated_wrappers_v1.sql` | wrappers auth validam `auth.uid()` + gates | remove dependencia de service role no caminho autenticado |
| C6 runtime (negativo) | REST com JWT `user_a` (staff club A) contra `club_b` | `HTTP 403`, `code=42501` em inserts/upserts cross-club | prova objetiva de isolamento tenant |
| C6 runtime (positivo) | REST com JWT `user_b` (coordinator club A) em `club_a` | toggle convocation, checkpoint upsert, event insert/delete, stats upsert = sucesso | confirma semantica intra-club esperada |
| C6 runtime RPC | wrappers `rpc_finalize_game_auth`/`rpc_recalculate_game_summary_auth` | same-club coordinator: `HTTP 200`; cross-club: `HTTP 403` (`forbidden`/`coordinator_required`) | defesa em profundidade no caminho atomico |

### Nota sobre `SQLSTATE 42501`
`42501` significa violacao de permissao/RLS no Postgres. Neste contexto forense, e o sinal esperado de bloqueio cross-club.

## Migrations aplicadas (relevantes) e objetivo

| Migration | Objetivo |
|---|---|
| `20260224130000_multi_club_foundation.sql` | fundacao tenant (`clubs`, `club_memberships`, `club_id` em `age_groups/teams`, helpers) |
| `20260224143000_multi_club_propagation.sql` | propagacao `club_id` + RLS base em tabelas sensiveis 2B |
| `20260224200000_multi_club_live_convocation_attendance.sql` | boundary 2C em live/convocation/attendance |
| `20260224203000_atomic_game_rpcs.sql` | RPCs atomicas finalize/recalculate |
| `20260224223000_atomic_redeem_staff_invite_rpc.sql` | redeem transacional/idempotente |
| `20260224230000_redeem_cross_club_guard.sql` | guard adicional anti cross-club no redeem |
| `20260224232000_statistics_attendance_rpcs.sql` | agregacao DB para hotspots stats/attendance |
| `20260224234000_notifications_insert_policy.sql` | desbloqueio controlado de insert em notifications |
| `20260224235000_convocation_live_read_policies_v1.sql` | policies funcionais de leitura para convocation/live |
| `20260225001000_convocation_live_write_policies_v1.sql` | policies funcionais de escrita para convocation/live |
| `20260225002000_game_rpcs_authenticated_wrappers_v1.sql` | wrappers auth para RPCs atomicas |

## Admin Surface (antes/depois) e estado atual

### Contagem
- Antes C6 (HEAD): `12 ficheiros / 15 ocorrencias` de `createAdminClient`
- Depois C6 (worktree): `8 ficheiros / 9 ocorrencias`

### Ficheiros ainda com `createAdminClient`
1. `src/app/api/team/logo/route.ts`  
Motivo: storage admin (`admin.storage`)  
Classificacao: **INEVITAVEL** (enquanto upload assinar no backend com bucket admin)
2. `src/app/api/me/account/route.ts`  
Motivo: `auth.admin.deleteUser` + cleanup cross-domain  
Classificacao: **INEVITAVEL** (operacao administrativa de conta)
3. `src/app/api/staff/[id]/route.ts`  
Motivo: `auth.admin.getUserById/updateUserById`  
Classificacao: **INEVITAVEL parcial** (auth admin), restante pode migrar faseada
4. `src/app/api/invite/redeem/route.ts`  
Motivo: chamada atual a RPC via service-role  
Classificacao: **POR FAZER** (migrar para wrapper auth do redeem)
5. `src/app/api/invite/sync/route.ts`  
Motivo: fluxo legado ainda admin-first  
Classificacao: **POR FAZER** (migrar para RLS + policy minima)
6. `src/app/api/calendar/events/route.ts`  
Motivo: contexto ainda resolvido com admin  
Classificacao: **POR FAZER** (migrar para server client + RLS)
7. `src/app/api/games/[id]/convocation/kits/route.ts`  
Motivo: write depende de policy funcional especifica  
Classificacao: **POR FAZER** (policy minima + server client)
8. `src/app/api/games/[id]/convocation/tactical/route.ts`  
Motivo: write em `games` ainda admin  
Classificacao: **POR FAZER** (policy update scoped + server client)

## Estado de contratos JSON/status
- Nesta iteracao de cleanup forense/documentacao, **nenhum endpoint foi alterado**.
- As mudancas de rota em curso (C6) mantem o mesmo contrato publico de JSON/status, conforme diffs validados previamente.

## Proximos passos (C7 opcional)
1. Migrar `invite/redeem` para wrapper autenticado (mesma semantica, sem service-role direto).
2. Fechar `calendar/events`, `convocation/kits`, `convocation/tactical`, `invite/sync` com policies minimas + server client.
3. Reduzir admin surface para apenas casos inevitaveis (`auth.admin` e `storage admin`).
4. Depois de estabilizar C7, executar cleanup controlado de dados forenses temporarios no DB (fora desta tarefa).

## Checklist manual (SQL Editor + validacao local)

### SQL Editor
1. Abrir `supabase/forensics/forensic_runtime_c6_final.sql`.
2. (Opcional) ajustar IDs no bloco de override com `set_config`.
3. Executar script completo.
4. Copiar para o dossie:
   - Result set `A1` (RLS flags)
   - Result set `A2` (policies)
   - NOTICE lines de `A3/A4/A5` (json com `expected` vs resultado)

### Validacao local
```bash
npx tsc --noEmit
npm run test -- --run
```

### Nota build
```bash
npm run build
```
Pode falhar em ambiente sem acesso a `fonts.googleapis.com`; nao e regressao de TypeScript/API.
