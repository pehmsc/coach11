# AUDITORIA COMPLETA — COACH11

**Commit base:** `63a2fddc2093e764c4bdc37005a74ca3eb5d1506`
**Data:** 2026-03-19
**Ficheiros TS/TSX:** 345 | **API routes:** 70 | **Pages:** 40 | **Migrations:** 77 | **Testes:** 138 (todos a passar)

---

## SECÇÃO 1 — PROXY / AUTH ROUTING

### Estado actual

| Ficheiro | Existe? |
|----------|---------|
| `src/proxy.ts` | SIM |
| `src/middleware.ts` | NÃO |

O `proxy.ts` exporta matcher + config, mas **a implementação é um no-op** (linha 56):
```typescript
// Hotfix: todo o gating beta/auth fica em route handlers Node.js.
return NextResponse.next();
```

**Impacto:** O middleware NÃO faz auth — toda a protecção é delegada a:
1. `(dashboard)/layout.tsx` — verifica user autenticado, perfil, e onboarding
2. Cada API route — verifica `supabase.auth.getUser()` individualmente

### Paths públicos (configurados no matcher)
- `/login`, `/register`, `/auth/**`, `/invite/**`, `/invite-only/**`
- `/public/**`, `/api/public/**`, `/api/public-gate/**`
- `/_next/static`, `/_next/image`, `/icons`, `/fonts`, `/assets`
- Extensões: `.svg`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, `.ico`, `.txt`, `.xml`, `.html`, `.webmanifest`, `.woff2`

### Dashboard layout — queries por request

O `(dashboard)/layout.tsx` executa **4-6 queries Supabase** em cada page load:

1. `supabase.auth.getUser()` — sessão
2. `profiles.select()` — perfil do user
3. `age_groups.select().eq("coordinator_id", user.id)` — (se coordinator) verifica se tem escalão
4. `resolveUserTeamContext()` — **5-8 queries adicionais** (age_groups, age_group_staff, teams, games)

**Total estimado: 6-14 queries Supabase por page load no layout.**

### Fluxo de auth

```
User não autenticado
  → /login (beta check + password/OAuth)
     → /api/auth/ensure-profile (3-5 queries: cria/atualiza perfil)
        → /dashboard (layout: 4-6 queries)
           → /onboarding (se coordinator sem age_group)

OAuth:
  → /auth/callback (server: valida code)
     → /auth/callback/client (client: exchange + ensure-profile + invite/sync)
        → /dashboard
```

### Verificação "user tem clube" — onde acontece?

| Local | O que verifica |
|-------|---------------|
| `(dashboard)/layout.tsx` | Coordinator sem age_group → redirect /onboarding |
| `/api/auth/ensure-profile` | Beta access + onboarding state |
| `/api/me/context` | Team context completo |

**Problema:** Verificação dispersa em 3 sítios. Deveria estar num único local.

### Problemas encontrados

| # | Problema | Severidade |
|---|---------|-----------|
| 1 | Middleware é no-op — auth não é enforced centralmente | ALTA |
| 2 | 6-14 queries Supabase por page load no layout (sem cache) | ALTA |
| 3 | `resolveUserTeamContext()` chamado no layout E em pages individuais (duplicação) | MÉDIA |
| 4 | Verificação de clube/escalão dispersa em 3 ficheiros | MÉDIA |
| 5 | Sem refresh automático de sessão no middleware | BAIXA |

---

## SECÇÃO 2 — API ROUTES

### Métricas

| Métrica | Valor |
|---------|-------|
| Total de routes | 70 |
| Linhas de código total | ~11.800 |
| Routes com `select("*")` | 3 ocorrências (1 route) |
| Routes com catch vazio | 5+ routes |
| Routes com N+1 auth lookups | 2 routes |
| Routes sem rate limiting | ~65 routes |

### select("*") — deve ser zero

Todas em `/api/games/[id]/convocation/route.ts` (558 linhas):
- Linha 110: `.select("*")` — games table
- Linha 234: `.select("*")` — players table
- Linha 466: `.select("*")` — contexto desconhecido

### Catch blocks vazios (suprimem erros)

| Route | Linha | Pattern | Impacto |
|-------|-------|---------|---------|
| `/me/context/route.ts` | 39-42 | `catch { db = supabase; }` | Admin client failure silenciado |
| `/messages/route.ts` | 144-147 | `catch { admin = null; }` | Sem logging |
| `/messages/route.ts` | 276-279 | `catch { db = supabase; }` | Fallback silencioso |
| `/messages/route.ts` | 319-323 | `catch { senderDisplayName = null; }` | Auth lookup failure ignorado |
| `/messages/unread/route.ts` | 20-23 | `catch { db = supabase; }` | Fallback silencioso |

### Routes problemáticas — análise detalhada

#### `/api/me/context` — IDENTIFICADO COMO "HANGING"

- **229 linhas**, GET only
- Faz `Promise.allSettled()` com N chamadas `admin.auth.admin.getUserById()` para avatares em falta
- **Problema N+1:** Se 10 staff members não têm avatar, faz 10 chamadas auth individuais
- **Sem timeout:** Se auth API estiver lento, o endpoint bloqueia indefinidamente
- **Este era o endpoint que causou o spinner infinito em todas as sub-páginas**

#### `/api/messages` — FEATURE PARCIALMENTE COMPLETA

- **351 linhas**, GET + POST
- GET: Lista mensagens da equipa (limit 200), resolve display names de profiles E auth system
- POST: Cria mensagem, marca como lida
- **Problema N+1:** `loadAuthDisplayNamesById()` faz chamadas individuais `auth.admin.getUserById()`
- **Problema:** Display names carregados de profiles E auth com fallback — lógica duplicada

#### `/api/messages/unread` — FEATURE ACTIVA

- **64 linhas**, GET only
- Retorna contagem de mensagens não lidas
- Catch block vazio na criação do admin client

#### `/api/invite/sync` — CHAMADO EM CADA MOUNT

- **179 linhas**, POST only
- Procura convite por email OU user ID, tenta resgatar via RPC
- **3 queries sequenciais** para encontrar convite — podia ser 1
- Chamado no mount do callback/client após login

#### `/api/notifications` — CHAMADO 5+ VEZES EM LOOP

- **112 linhas**, GET + POST
- Sem rate limiting no POST
- Sem cache no GET (`no-store`)
- Se chamado em loop, provável useEffect com deps incorrectas

### createAdminClient — uso

O `createAdminClient()` é usado em **27 ficheiros** (routes + lib). Cada chamada cria uma nova instância com `service_role` key. Não há pooling ou cache.

---

## SECÇÃO 3 — COMPONENTES CLIENT-SIDE

### Fetch sem AbortController — RISCO DE MEMORY LEAK

| Ficheiro | Linhas | Endpoint |
|----------|--------|----------|
| `club/page.tsx` | 106, 187, 229 | `/api/me/context`, outros |
| `settings/page.tsx` | 105-106 | `/api/me/context`, `/api/me/age-group` |
| `messages/page.tsx` | 101, 229 | `/api/messages` |
| `attendance/page.tsx` | — | Usa `apiFetch` wrapper |
| `auth/callback/client/page.tsx` | 155, 173 | `/api/auth/ensure-profile`, `/api/invite/sync` |
| `onboarding/page.tsx` | — | Vários endpoints |
| `register/page.tsx` | — | Auth endpoints |
| `login/page.tsx` | — | Auth endpoints |
| `trainings/[id]/page.tsx` | — | Vários endpoints |

**Nenhum** fetch client-side usa AbortController para cleanup no unmount.

### Polling / setInterval

| Ficheiro | Intervalo | Tem cleanup? | Verifica visibility? |
|----------|-----------|-------------|---------------------|
| `use-unread-notifications.ts` | 60s (msgs) / 120s (notifs) | SIM | SIM |
| `PublicGameLivePanel.tsx` | 1s (live) / 20-30s (snapshot) | SIM | NÃO |
| `LandingPage.tsx` | 16ms (animação) | SIM | N/A |
| `useGameDetailData.ts` | 30s (update now) | SIM | N/A |

**Problema:** `PublicGameLivePanel.tsx` faz polling mesmo com tab em background (2 intervals simultâneos durante jogo ao vivo).

### createClient() em useMemo — CORRECTO

Todos os usos de `createClient()` em componentes client estão dentro de `useMemo`:
- `onboarding/page.tsx`, `club/page.tsx`, `settings/page.tsx`
- `messages/page.tsx`, `use-unread-notifications.ts`
- `useLiveGameState.ts`, `auth/callback/client/page.tsx`

### Feature de mensagens — ACTIVA

A feature de mensagens **NÃO está escondida**:
- `messages/page.tsx` existe e funciona
- Badges de não-lidas no Sidebar, MobileFooterNav, MobileSideNavDrawer
- Subscrições realtime a `team_messages` e `team_message_reads`
- Hook `useUnreadNotifications()` monitoriza contagens

### Endpoints problemáticos chamados do client

| Endpoint | Chamado de | Frequência |
|----------|-----------|-----------|
| `/api/me/context` | `club/page.tsx`, `settings/page.tsx` | Cada mount |
| `/api/messages/unread` | `use-unread-notifications.ts` | Polling 60s |
| `/api/notifications` | `use-unread-notifications.ts` | Polling 120s |
| `/api/invite/sync` | `auth/callback/client/page.tsx` | Após login |

---

## SECÇÃO 4 — BASE DE DADOS

### Métricas

| Métrica | Valor |
|---------|-------|
| Total de migrations | 77 |
| Tamanho total | 648 KB |
| Maior migration | `authorization_domain_v2.sql` (36 KB) |
| Tabelas criadas | 24+ core tables |
| RLS habilitado | 40 tabelas |
| Policies RLS | 185+ |
| Índices criados | 85 |
| Foreign keys | 69 |
| Funções RPC | 71 |

### RPCs chamados no código (18 chamadas)

| RPC | Usado em |
|-----|---------|
| `rpc_attendance_today_get/save` | `/attendance/today` |
| `rpc_statistics_players` | `/statistics/players` |
| `rpc_redeem_staff_invite_auth` | `/invite/redeem`, `/invite/sync` |
| `rpc_finalize_game_auth` | `/games/[id]/live/finalize` |
| `rpc_recalculate_game_summary_auth` | `/games/[id]/summary/recalculate` |
| `rpc_game_access_context` | `/games/access.ts` |
| `consume_public_share_rate_limit` | `/public-share.ts` |

### RLS — Cobertura

Consolidações principais:
- `rls_read_write_split.sql` — 42 policies
- `sprint1_domain_boundary_alignment.sql` — 40 policies
- `multi_club_propagation.sql` — 25 policies

**Avaliação:** Cobertura RLS forte com separação read/write. Padrão de naming consistente.

### Potenciais N+1 em queries

| Ficheiro | Linha | Padrão |
|----------|-------|--------|
| `/trainings/[id]/phases/route.ts` | 155 | Loop em training_phases |
| `/trainings/[id]/phases/route.ts` | 179 | Loop em training_phase_exercises |
| `/team/kits/route.ts` | 210 | Loop em kit_pieces |

Risco médio — loops são bounded pelo contexto do request.

---

## SECÇÃO 5 — PERFORMANCE E CONNECTION POOL

### Clientes Supabase criados

- **185+ instanciações** de `createClient`/`createServerClient`/`createAdminClient` no codebase
- Cada API route cria uma nova instância server-side
- Cada componente client usa `useMemo` (correcto)

### Queries sem .limit()

A maioria das queries usa `.single()` (85 instâncias) ou `.maybeSingle()`. As que retornam listas usam `.limit()` (16 instâncias explícitas).

### force-dynamic

| Route | Revalidate |
|-------|-----------|
| `/public/[token]/trainings/[trainingId]` | 30s |
| `/public/[token]` | 30s |
| `/public/[token]/games/[gameId]` | 30s |
| `/api/public-gate/[segment]` | 0 (sem cache) |
| `/api/maintenance/prune-notifications` | dynamic (cron) |
| `/(dashboard)/dashboard/page.tsx` | dynamic (per-user) |

**Avaliação:** Uso estratégico e intencional.

### Estimativa de conexões por page load

Dashboard típico:
- Layout: 4-6 queries (auth + profile + team context)
- Page: 1-3 queries (dados específicos)
- API calls client-side: 1-3 (contexto, notificações)
- **Total: 6-12 conexões por page load**

---

## SECÇÃO 6 — ESTRUTURA DE PÁGINAS

### Route groups

| Grupo | Layout próprio? | Auth guard? |
|-------|----------------|------------|
| `(auth)` | Sim | Não (público) |
| `(dashboard)` | Sim (sidebar + nav) | Sim (layout) |
| `(onboarding)` | Sim (sem sidebar) | Sim (auth only) |

### Pages existentes (40 total)

**Dashboard (25 pages):**
`/dashboard`, `/players`, `/games`, `/games/[id]`, `/games/[id]/live`, `/games/[id]/summary`,
`/trainings`, `/trainings/[id]`, `/competitions`, `/calendar`, `/statistics`, `/team`,
`/team/setup`, `/staff`, `/settings`, `/exercises`, `/attendance`, `/messages`,
`/notifications`, `/admin/audit-logs`, `/admin/beta-invites`, `/admin/public-links`,
`/club`, `/teams`, `/teams/[ageGroupId]`

**Auth (5 pages):**
`/login`, `/register`, `/invite`, `/auth/callback/client`, `/invite-only`

**Public (4 pages):**
`/`, `/public/[token]`, `/public/[token]/games/[gameId]`, `/public/[token]/trainings/[trainingId]`

**Onboarding (1 page):**
`/onboarding`

**Outros (5 pages):**
`/join`, `/auth/callback` (server route handler), `/public/[token]/games/[gameId]/live` (embedded)

### Navegação vs ficheiros

Todos os items da sidebar/bottom nav têm page.tsx correspondente. Sem orphans detectados.

---

## SECÇÃO 7 — VERCEL E CUSTOS

### Configuração

| Item | Estado |
|------|--------|
| `vercel.json` | Existe — 1 cron job (prune-notifications, 3h diário) |
| `.vercelignore` | NÃO existe |
| `next/image` usage | 38 instâncias em 14+ componentes |
| Remote patterns | Supabase storage + Google profile pics |
| Security headers | CSP, HSTS, X-Frame-Options, Permissions-Policy |

### Branches remotas

**41 branches remotas** — cada branch com push = preview build na Vercel.

**Problema:** Sem `"github": {"silent": true}` no vercel.json. Cada PR gera preview deployment e consome build minutes.

### Imagens externas

Configuradas correctamente em `next.config.ts`:
- `*.supabase.co/storage/v1/object/public/**`
- `lh3.googleusercontent.com`

---

## SECÇÃO 8 — DEPENDÊNCIAS

### Produção (24 packages)

| Package | Usado? | Notas |
|---------|--------|-------|
| @hookform/resolvers | NÃO ENCONTRADO | Potencialmente não usado |
| @sentry/nextjs | SIM | global-error.tsx |
| @supabase/ssr | SIM | client.ts |
| @supabase/supabase-js | SIM | Múltiplos APIs |
| @tanstack/react-query | SIM | attendance, hooks |
| @tanstack/react-query-devtools | SIM | QueryProvider |
| class-variance-authority | SIM | UI components |
| clsx | SIM | lib/utils.ts |
| date-fns | SIM | 20+ ficheiros |
| jspdf | SIM | Dynamic import (PDF) |
| jspdf-autotable | SIM | Dynamic import (PDF) |
| leaflet | SIM | Dynamic import (mapas) |
| lucide-react | SIM | 30+ ícones |
| next-themes | SIM | sonner.tsx |
| posthog-js | SIM | Analytics client |
| posthog-node | SIM | Analytics server |
| @radix-ui/react-label | SIM | label.tsx |
| react-hook-form | SIM | Múltiplos forms |
| resend | SIM | Email (admin beta) |
| sonner | SIM | Toast notifications |
| tailwind-merge | SIM | lib/utils.ts |
| web-push | SIM | PWA push (dynamic) |
| zod | SIM | API validation |

### Dev (9 packages)

Todos em uso activo. `shadcn` é CLI tool (não importado).

### Potencialmente não usados

| Package | Razão |
|---------|-------|
| `@hookform/resolvers` | Nenhum import encontrado no código |
| `@types/leaflet` | Leaflet importado dinamicamente, tipos podem não ser necessários |
| `@types/web-push` | web-push importado dinamicamente |

---

## SECÇÃO 9 — TESTES

### Resultados

```
✓ 20 test files | 138 tests passed | 0 failed
  Duration: 2.26s
```

### Cobertura por área

| Área | Ficheiro | Testes |
|------|---------|--------|
| Security | security-fixes.test.ts | 3 |
| Auth | sanitize-next.test.ts | 6 |
| Config | canonical-app-url.test.ts | 3 |
| Dashboard | dashboard-priority.test.ts | 4 |
| Events | presence-window.test.ts | 5 |
| Events | public-calendar.test.ts | 3 |
| Games | convocation-editor.test.ts | 5 |
| Games | live-event-participants.test.ts | 2 |
| Games | live-kickoff.test.ts | 2 |
| Games | live-persistence.test.ts | 1 |
| Games | live-player-ids.test.ts | 2 |
| Games | public-convocation.test.ts | 2 |
| Games | public-live.test.ts | 1 |
| Notes | markdown.test.ts | 3 |
| Location | google-place-id.test.ts | 2 |
| Location | osm.test.ts | 6 |
| Share | public-share.test.ts | 2 |
| Trainings | ut-numbering.test.ts | 4 |
| Permissions | permissions.test.ts | 18 |
| Features | sprint1-features.test.ts | 36 |

### Áreas SEM testes

- API routes (nenhum teste de integração)
- Componentes React (nenhum teste de componente)
- Fluxo de auth/login (nenhum teste end-to-end)
- Database migrations (sem validação automática)

---

## SECÇÃO 10 — RESUMO EXECUTIVO

### CRÍTICO — corrigir antes de qualquer feature

| # | Problema | Ficheiro(s) | Impacto |
|---|---------|-------------|---------|
| 1 | Middleware é no-op — auth não enforced centralmente | `src/proxy.ts` | Qualquer path pode ser acedido sem auth, dependendo apenas de guards nos layouts e routes individuais |
| 2 | `/api/me/context` faz N+1 auth lookups sem timeout | `src/app/api/me/context/route.ts` | Causou spinner infinito em produção. Pode voltar a acontecer se auth API ficar lento |
| 3 | Dashboard layout faz 6-14 queries por page load sem cache | `src/app/(dashboard)/layout.tsx`, `src/lib/auth/team-context.ts` | Latência alta em cada navegação, consumo excessivo de conexões Supabase |
| 4 | Catch blocks vazios suprimem erros em routes críticas | `me/context`, `messages`, `messages/unread` | Falhas de admin client passam despercebidas — sem logging, sem alertas |
| 5 | `select("*")` na rota de convocatória (558 linhas) | `src/app/api/games/[id]/convocation/route.ts` | Fetches dados desnecessários, potencial leak de dados sensíveis |

### IMPORTANTE — corrigir no próximo sprint

| # | Problema | Ficheiro(s) | Esforço estimado |
|---|---------|-------------|-----------------|
| 1 | Nenhum fetch client-side usa AbortController | 8+ pages/components | 2-3h (wrapper global) |
| 2 | `PublicGameLivePanel` faz polling sem verificar visibility | `PublicGameLivePanel.tsx` | 30min |
| 3 | Verificação "user tem clube" dispersa em 3 sítios | layout, ensure-profile, me/context | 1-2h (consolidar) |
| 4 | 41 branches remotas = preview builds desnecessários | Vercel settings | 15min (silent: true ou cleanup) |
| 5 | `invite/sync` faz 3 queries sequenciais para 1 lookup | `src/app/api/invite/sync/route.ts` | 30min |
| 6 | Messages N+1: `loadAuthDisplayNamesById()` individual | `src/app/api/messages/route.ts` | 1h |
| 7 | Sem rate limiting em ~65 routes POST/PATCH/DELETE | Todas as API routes | 2-3h (middleware) |
| 8 | Sem testes de integração para API routes | `src/tests/` | 4-8h |

### NICE-TO-HAVE — backlog técnico

| # | Melhoria | Ficheiro(s) | Benefício |
|---|---------|-------------|-----------|
| 1 | Remover `@hookform/resolvers` se não usado | `package.json` | Bundle size |
| 2 | Cache `resolveUserTeamContext()` por request | `src/lib/auth/team-context.ts` | Reduz queries de 14 para 6 por page load |
| 3 | Converter `createAdminClient()` para singleton por request | `src/lib/supabase/admin.ts` | Reduz instanciações |
| 4 | Cursor-based pagination em notifications/messages | API routes | Escalabilidade |
| 5 | Adicionar `.vercelignore` | raiz | Controlo de builds |
| 6 | Batch auth lookups em `getUserById` | `me/context`, `messages` | Elimina N+1 |

### OK — O que está bem

| Área | Estado |
|------|--------|
| `createClient()` em `useMemo` | Todos os componentes client seguem o padrão |
| RLS coverage | 40 tabelas com 185+ policies — cobertura forte |
| Índices | 85 índices estratégicos criados |
| Foreign keys | 69 FKs com on delete cascade/set null |
| RPCs | 71 funções bem estruturadas com security definer |
| Testes | 138 testes, todos a passar (2.26s) |
| Security headers | CSP, HSTS, X-Frame-Options, Permissions-Policy |
| Image optimization | 38 instâncias de next/Image com remote patterns |
| Route groups | (auth), (dashboard), (onboarding) bem organizados |
| Navegação | Todos os items têm page.tsx correspondente |
| setInterval cleanup | Todos os intervals têm cleanup proper |
| Onboarding isolado | Route group próprio sem sidebar |
| Realtime subscriptions | Messages usa Supabase realtime correctamente |
| PDF export | Dynamic import de jspdf (client-only) |
| force-dynamic | Uso estratégico e intencional (6 routes) |
| Permissions system | 10 áreas × 4 operações, templates, tri-state UI |
