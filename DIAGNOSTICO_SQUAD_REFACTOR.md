# Diagnóstico — Refactor para `game_squads`

**Data:** 2026-05-11
**Branch base:** `main` @ `de51b34`
**Escopo:** READ-ONLY. Apenas mapa do código existente. Nenhuma alteração proposta neste documento.
**Tabelas alvo do refactor:** `convocation_players` + `external_player_convocations` → `game_squads` (unificada).

---

## Resumo executivo

Há **dois modelos paralelos de squad** e **três fontes de verdade** para o estado titular/suplente, glue-as no GET de convocatória. A "dualidade" é mais profunda do que parece — não é só `convocation_players` vs `external_player_convocations`. É:

| Source of truth | Player set | Lineup state | Presence state |
|---|---|---|---|
| `convocation_players` | internos convocados | ❌ não tem | ✅ `is_present`, `response_status` |
| `external_player_convocations` | externos convocados | ✅ `lineup_status` (`on_field`/`substitute`) | ❌ não tem |
| `game_stats_live` | internos (criada lazy) | ✅ `status` (`starter`/`on_bench`) + `start_minute=0` | — |
| `game_events` (subs) | internos + externos via `external_player_convocation_id` | recalculado | — |
| `game_final_stats` | snapshot final | `lineup_type` | — |

A tradução `starter↔on_field` e `on_bench↔substitute` é feita em [src/lib/games/lineup.ts:9-34](src/lib/games/lineup.ts#L9-L34) (`normalizeLiveStatusForUi`).

**Tamanho do blast radius:** 32 ficheiros fonte directamente envolvidos, 161 ocorrências dos identificadores duais. **L** (large) para o refactor inteiro, mas reversibilidade alta porque o estado vive maioritariamente em React e a UI já consome um único `lineupStatuses: Record<string, "on_field"|"substitute">`.

---

## Secção 1 — Inventário `external_player_convocations`

**Ficheiros (17 ts/tsx + 1 test):**

| Ficheiro | Linhas | Operação |
|---|---|---|
| [src/app/api/games/[id]/convocation/route.ts](src/app/api/games/%5Bid%5D/convocation/route.ts) | 236, 243, 527-535 | leitura — assembla `lineupStatuses` para o cliente |
| [src/app/api/games/[id]/convocation/confirm/route.ts](src/app/api/games/%5Bid%5D/convocation/confirm/route.ts) | 107, 114 | leitura — count para validar convocatória |
| [src/app/api/games/[id]/convocation/external/route.ts](src/app/api/games/%5Bid%5D/convocation/external/route.ts) | 16, 143-152 | **escrita (INSERT)** — cria externo com `lineup_status='substitute'` |
| [src/app/api/games/[id]/convocation/external/remove/route.ts](src/app/api/games/%5Bid%5D/convocation/external/remove/route.ts) | 50 | escrita (DELETE) |
| [src/app/api/games/[id]/convocation/external/lineup/route.ts](src/app/api/games/%5Bid%5D/convocation/external/lineup/route.ts) | 54-55 | **escrita (UPDATE)** — `lineup_status` pré-jogo |
| [src/app/api/games/[id]/live/events/route.ts](src/app/api/games/%5Bid%5D/live/events/route.ts) | 184, 237-243, 267, 277, 422 | leitura — valida `lineup_status === 'on_field'` antes de aceitar sub_out |
| [src/app/api/games/[id]/live/external-players/route.ts](src/app/api/games/%5Bid%5D/live/external-players/route.ts) | 55, 74-111 | **escrita (UPDATE)** — `lineup_status` durante o live |
| [src/app/api/games/[id]/summary/route.ts](src/app/api/games/%5Bid%5D/summary/route.ts) | 115, 168-174 | leitura — externals dos events para `playersById` |
| [src/app/api/games/[id]/summary/recalculate/route.ts](src/app/api/games/%5Bid%5D/summary/recalculate/route.ts) | 388 | leitura — types only via columns select string |
| [src/app/public/[token]/page.tsx](src/app/public/%5Btoken%5D/page.tsx) | 234, 248 | leitura — RSC, via `adminClient` |
| [src/app/public/[token]/games/[gameId]/page.tsx](src/app/public/%5Btoken%5D/games/%5BgameId%5D/page.tsx) | 200-203, 226, 233, 267 | leitura — RSC, via `adminClient` |
| [src/lib/games/live-event-participants.ts](src/lib/games/live-event-participants.ts) | 8, 13, 62, 71, 78 | helper — encode/decode `external:<id>` para `player_id` lógico unificado no cliente |
| [src/lib/games/live-event-participants.test.ts](src/lib/games/live-event-participants.test.ts) | 17, 26, 42 | testes do helper |
| [src/lib/games/public-live.ts](src/lib/games/public-live.ts) | 60, 323, 331 | leitura — snapshot live para share token |
| [src/lib/games/public-live.test.ts](src/lib/games/public-live.test.ts) | 96 | teste do snapshot |
| [src/lib/hooks/useLiveGameState.ts](src/lib/hooks/useLiveGameState.ts) | 385-389, 422-423, 501 | leitura — hidrata `LivePlayer.isOnField` a partir de `lineup_status` |

**Camel-case (`externalPlayerConvocation`):** apenas em `live-event-participants.ts` (helper interno).

**Observação chave:** o helper [live-player-ids.ts](src/lib/games/live-player-ids.ts) converte `external_player_convocation_id` UUID para `external:<uuid>` no cliente — o cliente trata externos e internos com a mesma chave `player_id`, mas o servidor faz roundtrip. Esta convenção é a *única* coisa que mantém o cliente sane.

---

## Secção 2 — Inventário `convocation_players`

**Ficheiros (11 ts/tsx):**

| Ficheiro | Linhas | Operação |
|---|---|---|
| [src/app/api/games/[id]/convocation/route.ts](src/app/api/games/%5Bid%5D/convocation/route.ts) | 139, 157, 338 | leitura — IDs selecionados + presença |
| [src/app/api/games/[id]/convocation/confirm/route.ts](src/app/api/games/%5Bid%5D/convocation/confirm/route.ts) | 93 | leitura — count para confirm |
| [src/app/api/games/[id]/convocation/lineup/route.ts](src/app/api/games/%5Bid%5D/convocation/lineup/route.ts) | 68 | leitura — validar que jogador está convocado antes de gravar lineup |
| [src/app/api/games/[id]/convocation/toggle/route.ts](src/app/api/games/%5Bid%5D/convocation/toggle/route.ts) | 109, 117, 169 | **escrita (INSERT/DELETE)** — toggle de convocatória |
| [src/app/api/games/[id]/summary/recalculate/route.ts](src/app/api/games/%5Bid%5D/summary/recalculate/route.ts) | 315 | leitura — descobrir `playerIds` para recalculate |
| [src/app/public/[token]/page.tsx](src/app/public/%5Btoken%5D/page.tsx) | 229 | leitura RSC |
| [src/app/public/[token]/games/[gameId]/page.tsx](src/app/public/%5Btoken%5D/games/%5BgameId%5D/page.tsx) | 192 | leitura RSC |
| [src/lib/events/delete-cascade.ts](src/lib/events/delete-cascade.ts) | 114-122, 185 | **escrita (DELETE cascade)** — game/player delete |
| [src/lib/team/delete-age-group.ts](src/lib/team/delete-age-group.ts) | 407 | **escrita (DELETE bulk)** — age group delete |
| [src/lib/hooks/useLiveGameState.ts](src/lib/hooks/useLiveGameState.ts) | 381 | leitura cliente — convocatória + players inner join |
| [src/lib/games/lineup-ghost-filter.ts](src/lib/games/lineup-ghost-filter.ts) | 15 (comment) | comentário documentando a "ghost row" |

**Camelcase `ConvocationPlayer` / `convocationPlayers`:** zero ocorrências — o tipo em [src/types/database.ts](src/types/database.ts) chama-se `ConvocationPlayer` mas não é importado em lado nenhum (legado).

---

## Secção 3 — Onde vive o estado titular/suplente HOJE

**Narrativa:**

O estado titular/suplente vive em **três tabelas distintas** consoante a fase e o tipo de jogador, sem nenhuma fonte unificada:

**Jogador interno** (player em `players`):
1. **Pré-jogo:** `POST /api/games/[id]/convocation/lineup` ([linha 81](src/app/api/games/%5Bid%5D/convocation/lineup/route.ts#L81)) traduz `lineupStatus: "on_field"` → `dbStatus: "starter"` e grava em `game_stats_live` (upsert por `(game_id, player_id)`). Default ao convocar é `'on_bench'`. **`convocation_players` NÃO tem coluna de lineup.**
2. **Durante o live:** `useLiveGameState.handleLineupToggle` ([linha 1312-1357](src/lib/hooks/useLiveGameState.ts#L1312-L1357)) actualiza `LivePlayer.isOnField` em React state E chama o mesmo endpoint `/lineup`. Substituições subsequentes mutam `isOnField` directamente em `setConvocatedPlayers` ([1290-1294](src/lib/hooks/useLiveGameState.ts#L1290-L1294)), em paralelo com a inserção do evento `substitution_out` em `game_events`.
3. **Pós-jogo (finalize):** o cliente constrói `lineup_type: "starter"|"substitute"` para cada jogador a partir do `isOnField` actual + `initialStarterIds` e envia ao `/api/games/[id]/live/finalize`, que persiste em `game_final_stats.lineup_type` via RPC. O recalculate posterior recalcula `lineup_type` a partir de `starterIds` derivados de `game_stats_live` ou do payload do utilizador ([recalculate:407-427](src/app/api/games/%5Bid%5D/summary/recalculate/route.ts#L407-L427)).

**Jogador externo** (linha em `external_player_convocations`):
1. **Pré-jogo:** `POST /api/games/[id]/convocation/external/lineup` faz `UPDATE external_player_convocations SET lineup_status = ...`. Default ao criar é `'substitute'`. **Não cria row em `game_stats_live`** — externos vivem fora dessa tabela.
2. **Durante o live:** `useLiveGameState.handleLineupToggle` ([1322-1336](src/lib/hooks/useLiveGameState.ts#L1322-L1336)) chama `/api/games/[id]/convocation/external/lineup` para pré-jogo OU `/api/games/[id]/live/external-players` PATCH para durante o jogo — ambos actualizam `lineup_status` na mesma tabela. Substituições mutam só client-side `LivePlayer.isOnField`.
3. **Pós-jogo:** o externo **não chega a `game_final_stats`** (a tabela tem FK para `players(id)` que os externos não satisfazem). Daí o externo "desaparecer" do summary/recalculate flow — único traço persistente são os `game_events` com `external_player_convocation_id`.

**O bug 2026-05-09 explicado pela análise:** evento `substitution_in` é registado em `game_events` (válido) mas `external_player_convocations.lineup_status` permanece `'substitute'` porque a actualização cliente-side (`setConvocatedPlayers` mutation) não tem espelhamento garantido no servidor para externos durante substituições. O `useLiveGameState.handleSubstitution` ([linha 1290](src/lib/hooks/useLiveGameState.ts#L1290)) só actualiza `isOnField` no state — não dispara PATCH ao endpoint `/live/external-players`. Quando o user recarrega, o GET de convocatória lê `lineup_status='substitute'` e mostra o externo no banco, mesmo havendo evento de entrada em campo.

**Where final lineup is committed:** `game_final_stats.lineup_type` — gravado **uma vez** no finalize (via `rpc_finalize_game` que aceita o payload do cliente) e **regravado** em cada "Editar Final Stats" (via `rpc_recalculate_game_summary_auth`). Apenas internos são gravados aqui.

---

## Secção 4 — Mapeamento `game_events` ↔ squad

**INSERT único:** [src/app/api/games/[id]/live/events/route.ts:374-388](src/app/api/games/%5Bid%5D/live/events/route.ts#L374-L388) — payload construído com `buildStoredGameEventParticipantFields()` que divide o `player_id` lógico (que pode ser `external:<uuid>`) em 4 colunas físicas:
- `player_id` (uuid → `players.id` se interno, NULL se externo)
- `related_player_id` (idem)
- `external_player_convocation_id` (uuid → `external_player_convocations.id` se externo, NULL se interno)
- `external_related_player_convocation_id` (idem)

**Helper canónico:** [src/lib/games/live-event-participants.ts](src/lib/games/live-event-participants.ts):
- `buildStoredGameEventParticipantFields()` (cliente → DB): linha 38, faz o split.
- `normalizeStoredGameEventRowForClient()` (DB → cliente): linha 67, faz o merge — devolve sempre `player_id: string | null` (possivelmente `external:<uuid>`).
- `resolveStoredGameEventParticipantId()`: priority logic — internal primeiro, depois converte external UUID para `external:<uuid>`.

**Sítios que UNIONAM/merge internos + externos:**

1. [GET /convocation/route.ts:519-535](src/app/api/games/%5Bid%5D/convocation/route.ts#L519-L535) — assembla `lineupStatuses` combinando `game_stats_live` (internos) e `external_player_convocations` (externos), prefixando externos com `external:`.
2. [useLiveGameState.ts:391-432](src/lib/hooks/useLiveGameState.ts#L391-L432) — assembla `convocatedPlayers: LivePlayer[]` via `byPlayerId` map.
3. [public-live.ts:323-331](src/lib/games/public-live.ts#L323-L331) — snapshot público.
4. [summary/route.ts:166-193](src/app/api/games/%5Bid%5D/summary/route.ts#L166-L193) — `playersById` para display de eventos.

Em todos os 4 sítios, o "merge" é manual: dois SELECT + um Map/Record + concat de prefixos.

---

## Secção 5 — Endpoint público da convocatória

**4 endpoints encontrados:**

| Caminho | Tipo | Dados de squad |
|---|---|---|
| [src/app/public/[token]/page.tsx](src/app/public/%5Btoken%5D/page.tsx) | RSC | lê IDs de `convocation_players` + count de `external_player_convocations` (linhas 226-237). Não expõe lineup_status nesta rota — só "tem ou não tem" |
| [src/app/public/[token]/games/[gameId]/page.tsx](src/app/public/%5Btoken%5D/games/%5BgameId%5D/page.tsx) | RSC | SELECT explícito de `convocation_players.player_id` + `external_player_convocations.id, name, lineup_status` (linhas 192-204). **Expõe `lineup_status` publicamente** — usado para mostrar starter/sub. |
| [src/app/public/[token]/trainings/[trainingId]/page.tsx](src/app/public/%5Btoken%5D/trainings/%5BtrainingId%5D/page.tsx) | RSC | unrelated to games (training) — não toca squad |
| [src/app/api/public/games/[identifier]/[gameRef]/live/route.ts](src/app/api/public/games/%5Bidentifier%5D/%5BgameRef%5D/live/route.ts) | API | snapshot do live via `public-live.ts` (lê externals + events + final stats) |

**SELECT pattern:** explícito em todos. Nenhum `SELECT *`.

**Acesso:** todos via `createAdminClient()` (service-role) — RLS bypassed. A entrada de autorização é o `token` validado por código antes do `from()`.

**Risco actual:** se houvesse `lineup_status` em `convocation_players`, seria exposto pelo SELECT da linha 192 (que faz `select("player_id")` mas o refactor pode ampliar o select sem perceber). Mitigação: o select é explícito, não `*`. Risco baixo se mantivermos disciplina.

---

## Secção 6 — Modal "Adicionar Outro Jogador"

**Caminho:** [src/components/games/detail/ExternalPlayerModal.tsx](src/components/games/detail/ExternalPlayerModal.tsx) (102 linhas).

**Estrutura actual:**
- Props: `{ editor: GameEditorState, onSubmit: (e) => void }`. **Recebe o editor todo** — não próprias props discretas.
- Estado interno: zero — tudo está em [useGameEditor.ts:79-81](src/lib/hooks/useGameEditor.ts#L79-L81): `externalPlayerName`, `externalPlayerNumber`, `externalPlayerPosition`.
- Submit: invocado pelo parent (Detail page) que chama `useGameConvocation` para fazer POST.

**Endpoint chamado no submit:** `POST /api/games/${id}/convocation/external` (via [useGameConvocation.ts:392](src/lib/hooks/useGameConvocation.ts#L392)).

**Validação actual:** **NÃO há Zod.** A validação vive duplicada:
- Cliente: `required` HTML + `min/max=0-99` no input number ([ExternalPlayerModal:52-53](src/components/games/detail/ExternalPlayerModal.tsx#L52-L53)).
- Servidor: validação manual em [external/route.ts:55-78](src/app/api/games/%5Bid%5D/convocation/external/route.ts#L55-L78) — `normalizePlayerName`, `normalizePlayerPosition`, `toJerseyNumber`, com mensagens em PT.

Este é um candidato a Zod schema partilhado durante o refactor.

---

## Secção 7 — "Em campo agora" durante o live

**Não é query SQL.** É 100% derivação em React state.

**Pipeline:**

1. **Hidratação inicial** ([useLiveGameState.ts:434-484](src/lib/hooks/useLiveGameState.ts#L434-L484)):
   - SELECT `game_stats_live` → `onFieldIds = Set(rows where status='on_field')` (após `normalizeLiveStatus`).
   - SELECT `external_player_convocations` → para cada external, `isOnField = row.lineup_status === 'on_field'`.
   - Merge num `LivePlayer[]` com flag `isOnField`.

2. **Derivação** ([useLiveGameState.ts:866-885](src/lib/hooks/useLiveGameState.ts#L866-L885)):
   ```ts
   const playersOnField = sortPlayersByName(
     convocatedPlayers.filter(p => p.isOnField && !sentOffPlayerIds.has(p.id))
   );
   ```
   `sentOffPlayerIds` é derivado dos `game_events` (red_card + 2x yellow).

3. **Mutação durante sub** ([useLiveGameState.ts:1290-1294](src/lib/hooks/useLiveGameState.ts#L1290-L1294)):
   ```ts
   setConvocatedPlayers(prev => prev.map(p => {
     if (p.id === selectedSubOutId) return { ...p, isOnField: false };
     if (p.id === selectedSubInId) return { ...p, isOnField: true };
     return p;
   }));
   ```
   Para **internos**, isto é seguido de um POST que actualiza `game_stats_live.status`. Para **externos**, esta mutação client-side **não tem espelho no servidor** durante uma sub — só o evento é gravado. **Isto é a raiz do bug 2026-05-09.**

4. **Não há recálculo a partir de events.** A função `computeMinutesPlayed` ([recalculate/route.ts:61-167](src/app/api/games/%5Bid%5D/summary/recalculate/route.ts#L61-L167)) reconstrói minutos a partir de events mas isso só corre no recalculate, não no live.

**Conclusão:** "quem está em campo agora" = `convocatedPlayers.filter(isOnField)` em RAM. Persiste para internos via `game_stats_live`, persiste mal para externos durante subs ao vivo.

---

## Secção 8 — RLS policies actuais

Resultado via Supabase MCP (project `hqlqgviiafqfefukodpe`, role `authenticated`):

### `convocations`
| cmd | policy | USING / WITH CHECK |
|---|---|---|
| ALL | `convocations_domain_boundary_v2` | `user_can_access_game(game_id)` |
| SELECT | `convocations_read_v1` | `user_can_access_game(game_id)` |
| INSERT | `convocations_write_insert_v1` | check: `user_can_write_game(game_id)` |
| UPDATE | `convocations_write_update_v1` | `user_can_write_game(game_id)` |
| DELETE | `convocations_write_delete_v1` | `user_is_game_coordinator(game_id)` |

### `convocation_players`
| cmd | policy | USING / WITH CHECK |
|---|---|---|
| ALL | `convocation_players_domain_boundary_v2` | `user_can_access_convocation(convocation_id)` |
| SELECT | `convocation_players_read_v1` | `user_can_access_convocation(convocation_id)` |
| INSERT | `convocation_players_write_insert_v1` | check: `user_can_write_convocation(convocation_id) AND convocation_player_matches_game_scope(convocation_id, player_id)` |
| UPDATE | `convocation_players_write_update_v1` | `user_can_write_convocation(convocation_id)` + scope check |
| DELETE | `convocation_players_write_delete_v1` | `user_can_write_convocation(convocation_id)` |

### `external_player_convocations`
| cmd | policy | USING / WITH CHECK |
|---|---|---|
| ALL | `external_player_convocations_domain_boundary_v2` | `user_can_access_game(game_id)` / `user_can_write_game` |
| SELECT | `read_v1` | `user_can_access_game(game_id)` |
| INSERT | `write_insert_v1` | check: `user_can_write_game(game_id)` |
| UPDATE | `write_update_v1` | `user_can_write_game(game_id)` |
| DELETE | `write_delete_v1` | `user_can_write_game(game_id)` |

### `game_stats_live`
| cmd | policy | USING / WITH CHECK |
|---|---|---|
| ALL | `game_stats_live_domain_boundary_v2` | `user_can_access_game(game_id)` |
| SELECT | `read_v1` | `user_can_access_game(game_id)` |
| INSERT | `write_insert_v1` | check: `user_can_write_game(game_id)` |
| UPDATE | `write_update_v1` | `user_can_write_game(game_id)` |
| DELETE | `write_delete_v1` | `user_is_game_coordinator(game_id)` |

### `game_events`
4 policies: domain_boundary, read, write_insert, write_delete. Tudo na chave `user_can_access_game(game_id)` / `user_can_write_game` (DELETE requer write, não coordenador).

### `game_final_stats`
3 policies: domain_boundary, read, write_delete. Sem INSERT/UPDATE policy explícita — gravação só via RPC `security definer`. DELETE só coordenador.

**Política recorrente:** todas as tabelas pivotam em `user_can_access_game(game_id)` / `user_can_write_game(game_id)`. **Para `game_squads`, o padrão a replicar é o de `external_player_convocations`** (mais simples, baseado em `game_id` directo — sem intermediário `convocation_id`).

⚠️ `convocation_players` usa `user_can_access_convocation(convocation_id)` que internamente calls `user_can_access_game(c.game_id)` — equivalente, mas com indirecção. Se `game_squads` ligar directamente ao `game_id`, perde-se a necessidade dessa indirecção.

⚠️ Há também a função `convocation_player_matches_game_scope(convocation_id, player_id)` que assume que o `player_id` é interno (`players.id`). Para `game_squads` com FK opcional a `players`, esta função pode precisar de adaptação ou ser substituída por trigger que valida `age_group_id`.

---

## Secção 9 — Hipóteses e questões em aberto

### Hipóteses confirmadas

1. ✅ **`convocation_players` não tem `lineup_status`.** Confirmed via schema query (Section 8).
2. ✅ **Internos: lineup vive em `game_stats_live.status` (`starter`/`on_bench`).** Diff de naming vs UI (`on_field`/`substitute`) é traduzido em `normalizeLiveStatusForUi`.
3. ✅ **Externos: lineup vive em `external_player_convocations.lineup_status` (`on_field`/`substitute`).** Mesmo naming que a UI, sem tradução.
4. ✅ **`is_present` / `response_status` existem só em `convocation_players`.** Externos não têm presença persistida.
5. ✅ **`game_final_stats` recebe apenas internos.** FK para `players(id)` impede externos. Externos só sobrevivem em `game_events` via `external_player_convocation_id`.
6. ✅ **Durante substituições live, externos têm uma janela de inconsistência:** `setConvocatedPlayers` cliente-side updates `isOnField`, mas não há PATCH ao servidor — bug reportado em 2026-05-09.
7. ✅ **Cliente unifica internos/externos via convenção `external:<uuid>`** em `lib/games/live-player-ids.ts`.

### Divergências schema ↔ código

- [src/types/database.ts](src/types/database.ts) tem `interface ConvocationPlayer` mas **não é importado em lado nenhum** — código usa tipos inline.
- [convocation/route.ts:200-201](src/app/api/games/%5Bid%5D/convocation/route.ts#L200-L201) faz `.insert(missingLiveRows)` em `game_stats_live` com `status: "on_bench"` — bypassing the `/lineup` route. Esta é a única excepção ao princípio "lineup só via /lineup route".
- Função `convocation_player_matches_game_scope(convocation_id, player_id)` assume convocação tem fonte única (via `convocations.game_id`). Em `game_squads`, isto pode simplificar.

### Questões em aberto

1. **Q1 — Tabela `game_squads`: relacionada com `convocations` ou directa com `games`?**
   - Hoje `convocation_players` tem FK para `convocations(id)` e `convocations` agrupa drafts/confirmed/closed por jogo. Há múltiplas convocações por jogo (histórico de drafts).
   - Externos saltam essa camada: `external_player_convocations.game_id` direto.
   - Decisão necessária: `game_squads` herda o agrupamento por `convocation_id` ou simplifica para `game_id` direto?

2. **Q2 — Externos sobrevivem ao recalculate?**
   - Hoje `game_final_stats` exclui externos por FK. Se o refactor adicionar externos lá, é preciso decidir se `player_id` em `game_final_stats` passa a aceitar `NULL` (com `external_player_id` paralelo) ou se `game_squads` passa a ser a fonte de stats por-jogador (com `game_final_stats` apenas como audit do recalculate).

3. **Q3 — Migração de dados existentes:**
   - Jogos `completed` antes do refactor têm dados em `convocation_players` + `external_player_convocations`. Replicar para `game_squads` retro-activamente, ou deixar tabelas legacy a coexistir até cleanup?

4. **Q4 — Endpoints duplicados:**
   - Hoje há **2 endpoints distintos** para alterar lineup pré-jogo (`/convocation/lineup` para internos, `/convocation/external/lineup` para externos) e **2 para live** (`/lineup` via game_stats_live, `/live/external-players` via external table). O refactor consolida em 1 endpoint? Se sim, breaking change para o cliente.

5. **Q5 — Presença (`is_present`, `response_status`) para externos:**
   - Hoje só internos têm presença persistida (porque externos são "ad-hoc"). O modelo unificado deve ter colunas de presença para todos, ou manter externos sem essa info?

6. **Q6 — Convenção `external:<uuid>` no cliente:**
   - Após unificação, ainda faz sentido manter o prefix `external:` no `player_id` cliente, ou todos os players têm UUID directo de `game_squads`? Se mudar, é breaking change em event helpers + lineup-player-ids + ≈ 4 hooks.

7. **Q7 — Múltiplas convocações por jogo (drafts vs confirmed):**
   - O sistema actual permite múltiplas `convocations` por `game_id` (uma vez `closed`, novo draft pode existir). O modelo `game_squads` mantém essa história ou flatten para "1 squad por jogo, com `status` na linha"?

---

## Secção 10 — Estimativa de impacto

| Área | Tamanho | Justificação |
|---|---|---|
| **API endpoints** | **L** | 11 endpoints lidam directa ou indirectamente com lineup/convocatória. Pelo menos 4 endpoints `/convocation/*` e 2 `/live/*` serão re-escritos ou consolidados. Outros (summary, recalculate, public) precisam adaptação de SELECT/joins. |
| **React components** | **M** | Apenas 2 componentes especializados (`ConvocationSection`, `ExternalPlayerModal`). O resto consome `lineupStatuses: Record<string, string>` que pode manter-se como contrato externo. Toggle UI já é uniform — só muda persistence layer. |
| **Tipos TypeScript** | **S** | `interface ConvocationPlayer` em `database.ts` (não usado), inline types em ~6 endpoints. Adição de `interface GameSquadEntry`. |
| **Schemas Zod** | **S** | Não há Zod actualmente para external player (validação manual). O refactor é oportunidade para introduzir 1-2 schemas novos (`squadEntrySchema`, `squadLineupUpdateSchema`). |
| **Testes** | **S** | Só 2 ficheiros de teste tocam estes identificadores: `live-event-participants.test.ts` e `public-live.test.ts`. Hooks (`useLiveGameState`, `useGameConvocation`) não têm testes unitários — risco de regressão em modo manual. |
| **RLS policies** | **M** | Eliminar policies de `convocation_players` + `external_player_convocations` (2 × 5 policies cada = 10) e criar ≈ 5 para `game_squads`. Função `convocation_player_matches_game_scope` precisa ser adaptada ou substituída. |
| **Migrations já existentes** | **L** | 13 migrations historicamente tocam estas tabelas. Para o refactor, precisa: 1 migration nova para criar `game_squads`, 1 para back-fill de dados, 1 para drop das tabelas legacy (faseado). Migrations antigas **não** são editáveis — só adicionar novas. |
| **Hooks** | **M** | 3 hooks afectados: `useLiveGameState` (≈ 100 linhas relevantes), `useGameConvocation` (≈ 50 linhas), `useGameDetailData` (≈ 20 linhas). Mutation patterns + load logic. |
| **Helper libs** | **M** | `live-event-participants.ts` + `live-player-ids.ts` + `lineup.ts` + `lineup-ghost-filter.ts` + `public-live.ts` + `public-convocation.ts`. Se decidirmos manter convenção `external:<uuid>`, mudanças mínimas. Se eliminarmos, é refactor profundo. |

**Métricas absolutas:**
- 32 ficheiros src/* mencionam directamente os identificadores duais (`external_player_convocation*`, `convocation_players`, `lineupStatus`).
- 161 ocorrências (greps cumulados).
- 17 ficheiros tocam `game_stats_live` (que vai mudar de papel mas não desaparecer).
- 13 migrations historicamente envolvidas.
- 2 ficheiros de teste afectados.

---

## Conclusões

### 1. Blast radius

**≈ 32 ficheiros tocados, ≈ 600-900 linhas alteradas** (assumindo média de 20-30 linhas por ficheiro em endpoints/hooks). Refactor é **L** mas reversível porque o cliente já consome uma estrutura unificada (`lineupStatuses: Record<string, "on_field"|"substitute">`) — a abstracção existe, só falta colapsar a persistência.

### 2. Armadilhas para tratar antes do refactor começar

1. **🪤 Não há testes para `useLiveGameState.handleSubstitution`** — o caminho onde o bug de 2026-05-09 surgiu. Antes do refactor, **adicionar pelo menos 2 testes**: (a) sub de interno actualiza `game_stats_live`; (b) sub de externo actualiza `external_player_convocations.lineup_status` (ou novo `game_squads.lineup_status`). Hoje só `setConvocatedPlayers` é mutado client-side.

2. **🪤 RPCs SQL referenciam estas tabelas:** `rpc_finalize_game`, `rpc_recalculate_game_summary_auth`, `get_player_season_stats`. Confirmar via `pg_proc` antes do refactor se há SQL stored procedures que precisam de rewrite. **Acção:** correr `SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE prosrc ILIKE '%convocation_players%' OR prosrc ILIKE '%external_player_convocations%'`.

3. **🪤 Função RLS `convocation_player_matches_game_scope`** valida que `player_id` está no escalão do jogo. Em `game_squads`, com `player_id` opcional (externals = NULL), esta validação precisa ser nullable-aware ou substituída por trigger.

4. **🪤 Múltiplas convocações por jogo:** ao apagar/recriar drafts, `convocation_players` rows são eliminadas mas `game_stats_live` rows **persistem** (origem das "ghost rows" tratadas em [lineup-ghost-filter.ts](src/lib/games/lineup-ghost-filter.ts)). Decidir desde já se `game_squads` mantém histórico de drafts ou é flat. Se flat, o cleanup deste tipo de ghost desaparece.

5. **🪤 Convenção `external:<uuid>` está espalhada pelo cliente** (event helpers, hooks, public-live, public-convocation). Se o refactor unifica IDs (todos UUIDs reais), há ≈ 6 ficheiros para limpar. Recomendação: **manter a convenção** durante o refactor — colapsar persistência sem mexer no cliente — depois remover prefix numa segunda fase.

6. **🪤 Endpoints públicos via `adminClient`** bypassam RLS — qualquer RLS nova em `game_squads` precisa ser duplicada em validação aplicacional no público se quisermos defesa em profundidade. Hoje já é o caso (token-based gate antes da query).

### 3. Dependências circulares e áreas surpresa

1. **`game_stats_live` é semi-dual ao squad:** não é só "stats" — guarda também o lineup pré-jogo (`status='starter'|'on_bench'`). Eliminar duplicidade entre `convocation_players` + `game_stats_live` para internos pode ser tão grande quanto eliminar duplicidade interno↔externo. Surpresa.

2. **`live-event-participants.ts` desliga propositadamente `external_player_convocation_id` ao normalizar para cliente** ([linha 71](src/lib/games/live-event-participants.ts#L71)) — converte para `external:<uuid>` antes de entregar. Isto significa que o cliente **nunca vê o UUID real** da row external. Se o refactor unifica IDs, é precisamente esta camada que desaparece — boa notícia, mas valida que nenhum consumer do `player_id` cliente precisa do UUID real.

3. **`useGameConvocation` (pré-jogo) e `useLiveGameState` (durante jogo) usam handlers diferentes** mas chamam **os mesmos endpoints** quando o jogo está em `scheduled` vs `live`. O refactor deve consolidar handlers para evitar divergência futura. Hoje, `handleLineupToggle` em `useLiveGameState` decide endpoint com base em `isExternal && phase`.

4. **Não foi encontrado nenhum lock/transaction explícito** para o flow "registar substituição = update events + update lineup". Hoje é fire-and-forget client-side com pessimismo zero. Se o refactor introduz UPDATE atómico `game_squads.lineup_status` + INSERT em `game_events` numa só transacção (via RPC), elimina-se a classe de bug 2026-05-09 *by construction*. **Recomendação forte: refactor inclui RPC `rpc_register_substitution`.**

5. **`computeMinutesPlayed` em [recalculate/route.ts](src/app/api/games/%5Bid%5D/summary/recalculate/route.ts#L61-L167)** **reconstrói minutos a partir de events**, ignorando `game_stats_live`. Isto significa que se o refactor migrar `game_stats_live` para "só stats live", o recalculate fica indiferente. Boa notícia.

---

## Recomendação operacional final

**Antes de avançar:**

1. Adicionar 2 testes de regressão para `handleSubstitution` (interno + externo).
2. Correr query SQL para identificar RPCs/triggers que referenciam as tabelas duais.
3. Decidir Q1 (game_squads ligada a convocations ou games), Q3 (back-fill ou paralelo), Q7 (multi-draft ou flat) — estas 3 decisões moldam 80% da migration.
4. Manter convenção `external:<uuid>` durante o refactor; remover em fase 2.

**Ordem de PRs sugerida (para outra sessão):**

1. **PR 0 (preparação):** testes de regressão para `handleSubstitution` + RPC inventory.
2. **PR 1 (DB):** migration cria `game_squads`, back-fills, mantém legacy tables como compat.
3. **PR 2 (server):** endpoints consolidados; ainda dual-write para compat.
4. **PR 3 (client):** hooks usam novos endpoints; remove convenção `external:<uuid>` ou mantém.
5. **PR 4 (cleanup):** drop tabelas legacy, RPC `rpc_register_substitution`, RLS final.

— **Authored-By: Pedro Campos <pedro.campos@befirstrs.com>**
