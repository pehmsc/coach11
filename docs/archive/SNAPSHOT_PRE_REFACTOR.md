# Snapshot pré-refactor — 2026-05-19

Captura do estado da BD e do repo *antes* do refactor `game_squads` começar. Serve de baseline para comparar contagens após cada migration durante a sprint.

## 1. Counts via Supabase MCP

```sql
SELECT
  (SELECT COUNT(*) FROM convocation_players) AS convocation_players,
  (SELECT COUNT(*) FROM external_player_convocations) AS external_player_convocations,
  (SELECT COUNT(*) FROM convocations) AS convocations,
  (SELECT COUNT(*) FROM game_stats_live) AS game_stats_live,
  (SELECT COUNT(*) FROM game_events) AS game_events,
  (SELECT COUNT(*) FROM game_events WHERE external_player_convocation_id IS NOT NULL) AS events_external,
  (SELECT COUNT(*) FROM game_final_stats) AS game_final_stats,
  (SELECT COUNT(*) FROM games) AS games,
  (SELECT COUNT(*) FROM games WHERE status='completed') AS games_completed,
  (SELECT COUNT(*) FROM games WHERE status='live') AS games_live;
```

| Tabela / filtro | Count |
|---|---:|
| `convocation_players` | **363** |
| `external_player_convocations` | **2** |
| `convocations` | **24** |
| `game_stats_live` | **376** |
| `game_events` | **769** |
| `game_events` com `external_player_convocation_id` ≠ NULL | **5** |
| `game_final_stats` | **314** |
| `games` total | **27** |
| `games` com `status='completed'` | **21** |
| `games` com `status='live'` | **0** |

**Observações:**
- Apenas **2 jogadores externos** historicamente convocados, com **5 eventos** que os referenciam. Volume baixo — back-fill é trivial.
- 363 rows em `convocation_players` para 24 convocações = média ~15 jogadores por convocação (saudável).
- 376 rows em `game_stats_live` vs 363 em `convocation_players` → 13 rows "ghost" no agregado (já documentadas em [src/lib/games/lineup-ghost-filter.ts](src/lib/games/lineup-ghost-filter.ts) — alvo de cleanup pelo refactor).

## 2. Estado de PRs recentes (hotfixes incluídos)

- **PR #128** (hotfix substituições externos) — merged em main no commit `d61cd4b` (2026-05-11).
- **PR #129** (auto-red por 2º amarelo) — merged em `9c8c4cd` (2026-05-11).
- **PR #130** (undo de cartões / handler restaurar isOnField) — merged em `80899a0` (2026-05-11).
- **PR #131** (UX label 2º amarelo + editar/apagar concluído) — merged em `b714077` (mais recente).

Todos validados em produção antes deste snapshot.

## 3. Estado da migration directory

```bash
$ ls -la supabase/migrations/ | tail -10
20260325020000_expand_team_staff_role_check.sql
20260325100000_fix_rpc_age_coordinator_invite.sql
20260325200000_fix_user_is_game_coordinator_roles.sql
20260325210000_fix_user_is_game_coordinator_no_club_wrapper.sql
20260326000000_age_group_coordinator_manage_permissions.sql
20260326010000_normalize_coordinator_roles.sql
20260501135038_players_profile_fields.sql
20260501203543_players_photos_bucket.sql
20260501222347_final_stats_manual_override.sql
20260501225118_preserve_terminal_game_status_in_finalize.sql
```

Última migration aplicada: `20260501225118_preserve_terminal_game_status_in_finalize.sql` (do hotfix do PR #127). Nada pendente.

## 4. Estado do repo

- Branch base: `main` @ `b714077` (Merge pull request #131).
- Working tree: clean.
- Testes: 357/357 passam.
- `npx tsc --noEmit`: 0 erros.
- `pnpm lint`: 0 erros, 5 warnings pré-existentes.

## 5. Próximo passo

Refactor `game_squads` (semana 19-23/Mai). Ver `SQL_INVENTORY_PRE_REFACTOR.md` para mapa exaustivo de impacto SQL e `DIAGNOSTICO_SQUAD_REFACTOR.md` para mapa de impacto aplicacional.

— **Authored-By: Pedro Campos <pedro.campos@befirstrs.com>**
