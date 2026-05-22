# Auditoria de código morto — 22 Mai 2026

> **Tipo:** Diagnóstico read-only. Nenhum código de produção foi removido.
> **Ferramenta:** [`knip@6.14.2`](https://knip.dev) configurada em `knip.json`.
> **Output bruto:** `pnpm knip --no-exit-code` (gravado em `/tmp/knip-full.txt` durante a corrida).
> **Branch:** `chore/auditoria-codigo-morto` (só adiciona knip + config + este relatório).

## 0. Resumo

| Categoria | Total |
|---|---:|
| Ficheiros não importados | 9 (1 falso-positivo confirmado) |
| Dependências não usadas | 2 |
| Dependências em falta (declarar) | 1 pacote, 8 sítios (`server-only`) |
| Exports não usados (funções/constantes) | 28 |
| Exports não usados (tipos) | 21 |
| Exports duplicados (aliases) | 3 |

Triagem por confiança:

- **Tabela A (alta confiança, remoção segura)** — 8 ficheiros, 2 dependências, 14 exports.
- **Tabela B (verificar — provável falso-positivo, decisão de design ou contrato)** — 1 ficheiro, 9 exports, 21 tipos, 3 duplicados.
- **Tabela C (ignorar)** — vazia depois da configuração de entrypoints (era a expectativa).

## 1. Ajustes feitos à config

- Sem `src/middleware.ts` no repo: o equivalente é [`src/proxy.ts`](../src/proxy.ts) (Next.js 16). O plugin Next do knip detecta-o sozinho; não foi adicionado ao `entry`.
- Sem `sitemap.ts` / `manifest.ts` no projecto — removi as entradas `src/app/**/sitemap.ts` e `src/app/**/manifest.ts` da config inicial (`knip` reportava "no matches").
- `src/instrumentation.ts` foi removido da lista `entry` por já estar declarado em `next.entry` (knip indicava redundância).
- Mantidos: `src/app/**/{page,layout,route,template,default,error,global-error,loading,not-found}.tsx?`, `sentry.*.config.ts`, `scripts/*.mjs`, `**/*.test.{ts,tsx}`, `vitest.config.ts`.

Config final em [knip.json](../knip.json).

## 2. Tabela A — Alta confiança (candidatos a remoção)

### 2.1 Ficheiros (8)

| Caminho | Tipo | Nota | Verificação |
|---|---|---|---|
| [src/components/trainings/TrainingDetailModal.tsx](../src/components/trainings/TrainingDetailModal.tsx) | componente | Única referência é um comentário em [z-index.ts:19](../src/lib/constants/z-index.ts#L19) | `grep -rn 'TrainingDetailModal'` → só auto + comentário |
| [src/components/ui/badge.tsx](../src/components/ui/badge.tsx) | shadcn/ui | Sem `<Badge>` em JSX nem `from "@/components/ui/badge"` em nenhum ficheiro | `grep -rn 'components/ui/badge\|<Badge\b'` → vazio fora do próprio |
| [src/components/ui/form.tsx](../src/components/ui/form.tsx) | shadcn/ui | Sem `<Form>`, `useForm`, `FormProvider` em uso. **Único consumidor de `react-hook-form` no projecto.** | `grep -rn '<Form\b\|useForm\b'` → vazio fora do próprio |
| [src/components/ui/separator.tsx](../src/components/ui/separator.tsx) | shadcn/ui | Sem `<Separator>` em JSX nem imports | `grep -rn 'components/ui/separator\|<Separator\b'` → vazio fora do próprio |
| [src/lib/constants/roles.ts](../src/lib/constants/roles.ts) | constantes | Define `CLUB_ROLE_LABELS` e `STAFF_ROLE_LABELS`; ninguém importa. O código vivo usa `AGE_GROUP_STAFF_ROLE_LABELS` em [staff-role.ts](../src/lib/team/staff-role.ts) | `grep -rn 'CLUB_ROLE_LABELS\|STAFF_ROLE_LABELS'` → só dentro do próprio |
| [src/lib/constants/z-index.ts](../src/lib/constants/z-index.ts) | constantes | Só aparece em comentários do próprio ficheiro | `grep -rn 'z-index\|zIndex'` → só self-refs |
| [src/lib/http/require-auth.ts](../src/lib/http/require-auth.ts) | helper | Exporta `requireAuth()` mas nada importa | `grep -rn '"@/lib/http/require-auth"\|requireAuth\b'` → só dentro do próprio |
| [src/lib/public-share-client.ts](../src/lib/public-share-client.ts) | helper localStorage | Sem qualquer import | `grep -rn 'public-share-client'` → vazio |

### 2.2 Dependências (2)

| Dependência | Por quê | Nota |
|---|---|---|
| `react-hook-form` | Único consumidor é `src/components/ui/form.tsx` (item A) | Se `form.tsx` cair, também sai |
| `@hookform/resolvers` | Idem (peer de `react-hook-form`) | Mesmo argumento |

### 2.3 Exports não usados (funções, constantes, classes — 14)

Quando o nome é genérico, confirmei com grep que não havia uso por nome (`grep -rn 'NomeDoSimbolo' src/`):

| Símbolo | Ficheiro | Nota |
|---|---|---|
| `getNavSection` | [nav-config.ts:197](../src/components/layout/nav-config.ts#L197) | Definido, nunca importado |
| `buildPermissionsFromArray` | [PermissionsGrid.tsx:39](../src/components/staff/PermissionsGrid.tsx#L39) | Idem |
| `isCoordinatorSource` | [team-context.ts:388](../src/lib/auth/team-context.ts#L388) | Idem |
| `exportAttendanceCsv` | [csv/statistics.ts:22](../src/lib/csv/statistics.ts#L22) | Idem |
| `addMinutesToTime` | [events/time.ts:79](../src/lib/events/time.ts#L79) | Idem |
| `parseSearchParams` | [http/validate.ts:50](../src/lib/http/validate.ts#L50) | Idem |
| `coerceLocationFields` | [location.ts:75](../src/lib/location.ts#L75) | Idem |
| `resolveMapsAddress` | [maps.ts:42](../src/lib/maps.ts#L42) | Idem |
| `createNotificationsForUsers` | [notifications/service.ts:292](../src/lib/notifications/service.ts#L292) | Variante "plural" — código vivo usa `createNotificationForTeamOnce` (singular) |
| `generatePublicShareToken` | [public-share.ts:62](../src/lib/public-share.ts#L62) | Sem imports |
| `encryptPublicShareToken` | [public-share.ts:84](../src/lib/public-share.ts#L84) | Sem imports |
| `getPublicShareUrlFromEncryptedToken` | [public-share.ts:126](../src/lib/public-share.ts#L126) | Sem imports |
| `requestWebPushPermissionFromUserAction` | [push-registration.ts:142](../src/lib/pwa/push-registration.ts#L142) | Sem imports |
| `checkInviteSendLimit` | [rate-limit.ts:69](../src/lib/rate-limit.ts#L69) | Única referência é uma linha **comentada** em [invite/staff/route.ts:90](../src/app/api/invite/staff/route.ts#L90) |
| `PUBLIC_SQUAD_BANNED_FIELDS` | [types/squad.ts:85](../src/types/squad.ts#L85) | Re-export de `BANNED_PUBLIC_FIELDS` — sem consumidor |

> **Decisão sugerida:** alguns destes (`encryptPublicShareToken`, `requestWebPushPermissionFromUserAction`, `checkInviteSendLimit`) cheiram a "infra preparada mas não cabeada ainda". Antes de remover, perguntar ao Pedro se há tickets em curso que vão usar.

## 3. Tabela B — Verificar (provável falso-positivo, decisão de design ou contrato)

### 3.1 Ficheiros (1 — falso-positivo confirmado)

| Caminho | Por quê duvidoso |
|---|---|
| [public/sw.js](../public/sw.js) | Service worker, registado por **string** em [PWAProvider.tsx:273](../src/components/pwa/PWAProvider.tsx#L273) (`navigator.serviceWorker.register("/sw.js")`) e listado em [proxy.ts:5](../src/proxy.ts#L5). **Falso-positivo do knip.** Não remover. |

### 3.2 Exports de shadcn/ui (sub-componentes — decisão de design)

| Símbolo | Ficheiro | Por quê duvidoso |
|---|---|---|
| `AvatarBadge`, `AvatarGroup`, `AvatarGroupCount` | [avatar.tsx:106-108](../src/components/ui/avatar.tsx#L106) | Variantes shadcn — comum manter "para futuro" por consistência |
| `CardAction` | [card.tsx:89](../src/components/ui/card.tsx#L89) | Idem |
| `SelectGroup`, `SelectLabel`, `SelectSeparator` | [select.tsx:182-187](../src/components/ui/select.tsx#L182) | Idem |

> **Recomendação:** decisão a tomar globalmente: "limpamos exports não-usados de shadcn/ui ou mantemos a biblioteca completa?". Não bloquear esta auditoria.

### 3.3 Aliases / duplicados (3)

| Par | Ficheiro | Nota |
|---|---|---|
| `clearAppBadge` \| `clearBadge` | [src/lib/pwa/badges.ts](../src/lib/pwa/badges.ts) | `clearAppBadge` é o nome em uso; `clearBadge` é alias morto |
| `setAppBadge` \| `setBadge` | idem | Idem |
| `AGE_GROUP_STAFF_ROLES` \| `AGE_COORDINATOR_INVITABLE_ROLES` | [staff-role.ts](../src/lib/team/staff-role.ts) | Alias |

> Estes 3 são **alta confiança** se decidirem que aliases não duplicados ficam só com o nome principal; classifiquei em B porque é decisão de naming.

### 3.4 Outras constantes (verificar antes de cortar)

| Símbolo | Ficheiro | Por quê duvidoso |
|---|---|---|
| `clearBadge`, `setBadge` | [pwa/badges.ts:54-55](../src/lib/pwa/badges.ts#L54) | Ver 3.3 |
| `AGE_COORDINATOR_INVITABLE_ROLES`, `ALL_STAFF_ROLE_LABELS` | [staff-role.ts:28,34](../src/lib/team/staff-role.ts#L28) | `ALL_STAFF_ROLE_LABELS` é re-export que junta vários mapas — pode ter sido pensada para UI ainda por chegar |
| `PLAYER_PHOTO_BUCKET`, `PLAYER_PHOTO_SIGNED_URL_TTL` | [storage/players-photos.ts:6-7](../src/lib/storage/players-photos.ts#L6) | Constantes de infra (bucket name) — possivelmente referidas em policies/SQL ou em scripts não-TS; verificar antes |

### 3.5 Tipos não usados — **NÃO cortar sem confirmar contrato DB**

**`src/types/database.ts` (13 tipos)** — Este ficheiro é o contrato com a DB. CLAUDE.md diz explicitamente "Tipos em `src/types/database.ts` — sempre importar daqui". Antes de remover qualquer um, verificar se há queries `.from('xxx')` que fazem cast implícito.

- `CompetitionType` (linha 17) — CLAUDE.md menciona a regra "deve ser importado de `@/types/database`" mas grep mostra 0 imports actuais
- `Team` (linha 70)
- `AgeGroupStaff` (linha 79)
- `GameOpponentObservationInsert` (linha 228)
- `GameOpponentObservationUpdate` (linha 237)
- `AttendanceRecord` (linha 244)
- `Matchday` (linha 271)
- `Ground` (linha 304)
- `Convocation` (linha 324)
- `ConvocationPlayer` (linha 338)
- `GameStatsLive` (linha 358)
- `GameLiveCheckpoint` (linha 369)
- `TeamStaff` (linha 408)

**`src/lib/schemas/`** — Zod schemas. Podem ser usados via `z.infer` ou na execução do schema, não no tipo exportado:
- `PlayerLineupType` ([game-recalculate.ts:4](../src/lib/schemas/game-recalculate.ts#L4))
- `RecalculateRequest` ([game-recalculate.ts:39](../src/lib/schemas/game-recalculate.ts#L39))
- `ObservationCreateInput` ([observations.ts:12](../src/lib/schemas/observations.ts#L12))
- `ObservationPromoteInput` ([observations.ts:30](../src/lib/schemas/observations.ts#L30))

**`src/lib/validations/`**:
- `OpponentInput`, `OpponentCreate`, `OpponentUpdate` ([opponent.ts:41-43](../src/lib/validations/opponent.ts#L41))

**`src/types/squad.ts`**:
- `InternalSquadEntry` (linha 58)

## 4. Tabela C — Ignorar

Vazia. Os entrypoints declarados em `knip.json` (App Router, scripts, Sentry, vitest, testes) já cobriram tudo o que se sabia ser convenção. Se aparecerem novas convenções (sitemap dinâmico, etc.) bastará acrescentar à `entry`.

## 5. Dependências em falta (acção independente)

`server-only` é importada em 8 ficheiros mas não está declarada em `package.json`:
- [src/lib/auth/beta-access.server.ts:1](../src/lib/auth/beta-access.server.ts#L1)
- [src/lib/auth/permissions.ts:1](../src/lib/auth/permissions.ts#L1)
- [src/lib/auth/require-permission.ts:1](../src/lib/auth/require-permission.ts#L1)
- [src/lib/auth/super-user.server.ts:1](../src/lib/auth/super-user.server.ts#L1)
- [src/lib/observability/posthog-admin-metrics.server.ts:1](../src/lib/observability/posthog-admin-metrics.server.ts#L1)
- [src/lib/provider/google.ts:1](../src/lib/provider/google.ts#L1)
- [src/lib/public-share.ts:1](../src/lib/public-share.ts#L1)
- [src/lib/supabase/admin.ts:1](../src/lib/supabase/admin.ts#L1)

`server-only` vem em peer do Next.js, pelo que funciona hoje, mas declará-lo explicitamente é correcto. `pnpm add server-only`.

## 6. Discrepâncias knip ↔ grep encontradas

Em 10+ verificações cruzadas, **uma única discrepância**: `public/sw.js` (knip classifica "unused file", mas o ficheiro é registado por string `"/sw.js"` em `PWAProvider.tsx` e em `proxy.ts` — falso-positivo). Está documentado em 3.1.

Restantes spot-checks (TrainingDetailModal, ui/{badge,form,separator}, constants/{roles,z-index}, require-auth, public-share-client, react-hook-form, getNavSection, AvatarBadge, CompetitionType, createNotificationsForUsers, checkInviteSendLimit) — todos os greps confirmaram o veredicto do knip.

**Fiabilidade do knip neste projecto:** alta. A única classe de falsos-positivos esperada é referências por string (service worker, dynamic imports). Vale sempre fazer um grep antes de remover.

## 7. Agrupamento sugerido em PRs futuros (priorizado por ROI/risco)

| Prioridade | PR | Risco | Itens |
|---|---|---|---|
| 1 | `chore: limpar UI shadcn morta + remover react-hook-form` | baixo | `ui/badge.tsx`, `ui/form.tsx`, `ui/separator.tsx`, `TrainingDetailModal.tsx`, deps `react-hook-form` + `@hookform/resolvers` |
| 2 | `chore: limpar libs orfas` | baixo | `lib/constants/{roles,z-index}.ts`, `lib/http/require-auth.ts`, `lib/public-share-client.ts` |
| 3 | `chore: declarar server-only nas deps` | nulo | `pnpm add server-only` |
| 4 | `chore: remover exports orfaos sem uso interno` | médio | `getNavSection`, `buildPermissionsFromArray`, `isCoordinatorSource`, `exportAttendanceCsv`, `addMinutesToTime`, `parseSearchParams`, `coerceLocationFields`, `resolveMapsAddress`, `PUBLIC_SQUAD_BANNED_FIELDS`. Cada export deve sair com a função que o serve se também não for usada. |
| 5 | `chore: consolidar aliases de pwa/badges` | baixo | `clearBadge`/`setBadge` (manter `clearAppBadge`/`setAppBadge`) + `AGE_COORDINATOR_INVITABLE_ROLES`/`AGE_GROUP_STAFF_ROLES` |
| 6 | `chore: rever public-share helpers nao cabeados` | médio | `generatePublicShareToken`, `encryptPublicShareToken`, `getPublicShareUrlFromEncryptedToken` — perguntar ao Pedro se há trabalho em curso |
| 7 | `chore: rever push-registration nao cabeado` | médio | `requestWebPushPermissionFromUserAction`, `checkInviteSendLimit` (este só num comentário) |
| 8 | `chore: rever tipos de database orfaos` | **alto** | 13 tipos em `src/types/database.ts` — cada um precisa de confirmação que a tabela DB não está em uso silencioso. Fazer **um PR por tipo** ou agrupados por domínio, NUNCA todos de uma vez. |
| 9 | `chore: rever schemas/validations zod orfaos` | médio | `PlayerLineupType`, `RecalculateRequest`, `ObservationCreate/Promote/Input`, `OpponentInput/Create/Update`, `InternalSquadEntry` |
| 10 | (decisão) shadcn/ui sub-exports | baixo | `AvatarBadge`/`AvatarGroup`/`AvatarGroupCount`, `CardAction`, `SelectGroup`/`SelectLabel`/`SelectSeparator` — manter ou cortar conforme política |

## 8. Validações

- `npx tsc --noEmit` → **0 erros** (inalterado).
- `pnpm lint` → **0 errors / 5 warnings** pré-existentes (inalterado).
- `pnpm knip --version` → **6.14.2**.
- Adicionada `knip@^6.14.2` apenas como `devDependency`.

## 9. Como correr no futuro

```bash
pnpm knip --no-exit-code              # texto completo
pnpm knip --files --no-exit-code      # só ficheiros não importados
pnpm knip --dependencies --no-exit-code   # só dependências
pnpm knip --exports --no-exit-code    # só exports
pnpm knip --reporter json --no-exit-code > knip.json
```

A flag `--no-exit-code` evita falhar CI por findings — útil enquanto o projecto ainda contém código morto conhecido.
