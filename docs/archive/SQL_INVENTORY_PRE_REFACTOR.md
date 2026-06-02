# SQL Inventory pré-refactor `game_squads`

**Data:** 2026-05-19
**Branch:** `prep/refactor-game-squads`
**Projecto Supabase:** `hqlqgviiafqfefukodpe`

Inventário completo de RPCs, triggers, views e FKs que referenciam as tabelas alvo do refactor (`convocation_players`, `external_player_convocations`, `convocations`) ou as colunas chave (`lineup_status`, `lineup_type`, `game_stats_live`). Captura o estado *antes* das alterações para usar como referência durante a sprint.

---

## 1. RPCs / funções (5 identificadas)

| # | Função | Args | Tabelas tocadas | Classificação | Impacto |
|---|---|---|---|---|---|
| 1 | `age_group_subtree_summary` | `p_age_group_id uuid` | `convocation_players`, `external_player_convocations`, `game_stats_live` | **Adaptação** | Conta rows para audit dump quando se re-aloja age_group entre clubs. Tem de passar a contar `game_squads`. |
| 2 | `get_player_season_stats` | `p_club_id, p_age_group_id, p_season` | `game_final_stats.lineup_type` | **Sem impacto directo** | Lê `lineup_type` que é coluna em `game_final_stats` — fica como está. Refactor não toca essa tabela. |
| 3 | `rehome_age_group_to_dedicated_technical_club` | `p_age_group_id uuid` | `convocation_players`, `external_player_convocations`, `game_stats_live` | **Adaptação** | Migra `club_id` em massa por escalão. Tem de passar a actualizar `game_squads.club_id` em vez de duas tabelas. |
| 4 | `rpc_finalize_game` | `p_game_id, p_final_stats, p_score_home, p_score_away, p_final_minute, p_updated_by` | `game_final_stats.lineup_type` | **Sem impacto directo** | A coluna `lineup_type` vive em `game_final_stats`, não em `game_squads`. Mantém-se como está. |
| 5 | `rpc_statistics_players` | `p_age_group_id uuid` | `convocation_players`, `game_final_stats.lineup_type` | **Adaptação** | Devolve `convocationPlayers` array para o cliente. Tem de migrar para `game_squads` (filtrando por jogadores internos). |

### Wrappers `_auth` não aparecem porque não referenciam directamente as tabelas — invocam `rpc_finalize_game` que sim. Logo, **`rpc_finalize_game_auth` e `rpc_recalculate_game_summary_auth` herdam o impacto da função base** (zero, neste caso).

---

## 2. Triggers (15 identificados, 14 instâncias INSERT/UPDATE)

Todos os triggers fazem `EXECUTE FUNCTION sync_club_id_from_domain_refs()` excepto `game_final_stats_set_updated_at` (=`set_updated_at()`) e `trg_games_sync_club_id` (=`sync_club_id_from_team_or_age_group_ref()`).

| Tabela | Trigger | Eventos | Função | Impacto |
|---|---|---|---|---|
| `convocation_players` | `trg_convocation_players_sync_club_id` | INSERT, UPDATE | `sync_club_id_from_domain_refs` | **Drop** após migration (tabela vai desaparecer). |
| `convocations` | `trg_convocations_sync_club_id` | INSERT, UPDATE | `sync_club_id_from_domain_refs` | **Manter** se `convocations` continuar a existir; ver Q1 do diagnóstico. |
| `external_player_convocations` | `trg_external_player_convocations_sync_club_id` | INSERT, UPDATE | `sync_club_id_from_domain_refs` | **Drop** após migration. |
| `game_events` | `trg_game_events_sync_club_id` | INSERT, UPDATE | `sync_club_id_from_domain_refs` | **Manter** mas verificar — a função sync pode precisar de ler `game_squads` em vez de `external_player_convocations`. |
| `game_final_stats` | `trg_game_final_stats_sync_club_id` | INSERT, UPDATE | `sync_club_id_from_domain_refs` | **Manter** sem alteração. |
| `game_final_stats` | `game_final_stats_set_updated_at` | UPDATE | `set_updated_at` | **Manter** sem alteração. |
| `game_stats_live` | `trg_game_stats_live_sync_club_id` | INSERT, UPDATE | `sync_club_id_from_domain_refs` | **Manter** mas verificar (se `game_stats_live` mudar de papel para "só stats live"). |
| `games` | `trg_games_sync_club_id` | INSERT, UPDATE | `sync_club_id_from_team_or_age_group_ref` | **Manter** sem alteração. |

**Acção crítica para o refactor:**
1. Examinar `sync_club_id_from_domain_refs()` e ver se faz lookup em `convocation_players`/`external_player_convocations` — se sim, adaptar para `game_squads`.
2. Criar `trg_game_squads_sync_club_id` análogo aos existentes.

---

## 3. Views (zero)

Nenhuma view em `public` referencia `convocation_players`, `external_player_convocations` ou `lineup_status`. Boa notícia — sem dependências de views.

---

## 4. Foreign keys (3 identificadas)

| Dependente | Coluna | Referencia | Coluna | DELETE | UPDATE |
|---|---|---|---|---|---|
| `convocation_players` | `convocation_id` | `convocations` | `id` | CASCADE | NO ACTION |
| `game_events` | `external_player_convocation_id` | `external_player_convocations` | `id` | SET NULL | NO ACTION |
| `game_events` | `external_related_player_convocation_id` | `external_player_convocations` | `id` | SET NULL | NO ACTION |

**Implicação crítica para o refactor:**

- **`game_events.external_player_convocation_id` é a única forma actual de associar um evento a um jogador externo.** Quando `external_player_convocations` for dropada, estas FKs partem. Opções:
  1. **Renomear coluna** para `game_squad_id` apontando a `game_squads.id` — mais limpo.
  2. **Unificar:** adicionar `game_squad_id` em `game_events` e popular em back-fill; depois drop das duas colunas externals.

- **`convocation_players → convocations` (CASCADE)** desaparece com `convocation_players`. Se `convocations` continuar a existir (Q1 pendente), `game_squads` tem de ter a sua própria FK para `convocations` (ou directamente a `games`).

---

## 5. Lista de RPCs que precisam de adaptação durante o refactor

| RPC | Linhas a tocar | Esforço |
|---|---|---|
| `age_group_subtree_summary` | 4-6 linhas no `jsonb_build_object` final + add `game_squads` count | S |
| `rehome_age_group_to_dedicated_technical_club` | 2 chamadas `update_rows_club_id_by_ids` colapsam em 1 com `game_squads` | S |
| `rpc_statistics_players` | Substituir SELECT em `convocation_players` por `game_squads` filtrado por internos | M |

---

## 6. Triggers a ajustar

- Drop: `trg_convocation_players_sync_club_id`, `trg_external_player_convocations_sync_club_id`.
- Criar: `trg_game_squads_sync_club_id` (INSERT + UPDATE) — equivalente aos anteriores.
- Verificar e adaptar (se necessário): `sync_club_id_from_domain_refs()` no body — pode fazer lookup em tabelas que vão desaparecer.

---

## 7. Surpresas e descobertas

1. **`get_player_season_stats` e `rpc_finalize_game` não tocam directamente as tabelas alvo** — só `lineup_type` em `game_final_stats`. Estavam na lista do prompt mas o refactor não precisa de as tocar.
2. **Zero views** — alívio. Sem view explosion durante refactor.
3. **Triggers são uniformes** — quase todos chamam `sync_club_id_from_domain_refs()`. O refactor pode beneficiar-se de inspeccionar essa função e generalizar (vs criar trigger específico por tabela).
4. **`game_events.external_player_convocation_id` é critical path.** Sem ele os eventos perdem os jogadores externos. **Plano de migration deve garantir que os eventos antigos continuam a referenciar correctamente após o drop da tabela** — provavelmente via coluna `game_squad_id` nova + back-fill.
5. **`age_group_subtree_summary` é usada pelo `rehome_age_group_to_dedicated_technical_club`** — só uma cadeia de dependência mas detecta-se cedo.

---

## 8. Plano operacional (ordem sugerida para a sprint)

1. Criar `game_squads` com FK para `convocations(id)` (mantendo o agrupamento) ou `games(id)` directo — Q1 pendente.
2. Adicionar coluna `game_squad_id` em `game_events` (nullable). Back-fill a partir de `external_player_convocation_id` + JOIN de internos.
3. Adaptar 3 RPCs (`age_group_subtree_summary`, `rehome_age_group_to_dedicated_technical_club`, `rpc_statistics_players`).
4. Criar `trg_game_squads_sync_club_id`. Examinar `sync_club_id_from_domain_refs()`.
5. Migrar endpoints/aplicação para usar `game_squads` (PRs 2-4 do plano de refactor).
6. Drop `convocation_players` e `external_player_convocations` numa migration de cleanup separada (PR 5).

— **Authored-By: Pedro Campos <pedro.campos@befirstrs.com>**
