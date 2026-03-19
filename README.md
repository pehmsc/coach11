# Coach11

> **Gestão de equipas de futebol de formação — field-first, auto-populates admin.**

Coach11 é uma plataforma mobile-first para treinadores de futebol de formação. O princípio central é simples: o treinador regista dados no campo (treinos, jogos, presenças) e o backoffice administrativo é preenchido automaticamente — eliminando a duplicação manual de dados que torna as soluções de gestão desportiva tradicionais impraticáveis no dia-a-dia.

**Deploy de produção:** [coach11.app](https://coach11.app) · **Repositório privado**

---

## Índice

1. [Filosofia do produto](#1-filosofia-do-produto)
2. [Stack técnica](#2-stack-técnica)
3. [Arquitectura](#3-arquitectura)
4. [Estrutura do projecto](#4-estrutura-do-projecto)
5. [Modelo de dados](#5-modelo-de-dados)
6. [Sistema de permissões](#6-sistema-de-permissões)
7. [Funcionalidades implementadas](#7-funcionalidades-implementadas)
8. [Roadmap](#8-roadmap)
9. [Configuração local](#9-configuração-local)
10. [Variáveis de ambiente](#10-variáveis-de-ambiente)
11. [Workflow de desenvolvimento](#11-workflow-de-desenvolvimento)
12. [Regras de código](#13-regras-de-código)
13. [Observabilidade](#14-observabilidade)

---

## 1. Filosofia do produto

**"Field-first, auto-populates admin"** — cada decisão de produto deve reforçar este princípio.

Três princípios não negociáveis:

- **Mobile-first sem excepção.** Se não funcionar com uma mão, ao sol, às 9h num campo de relva, está errado.
- **Velocidade de iteração acima de perfeição.** Um bug descoberto por um treinador real vale mais do que horas de engenharia preventiva.
- **Zero duplicação de dados.** O treinador regista uma vez no campo; o admin é consequência, nunca causa.

### O que nos diferencia

| Feature | Coach11 | Soluções tradicionais |
|---|---|---|
| Interface | ✅ Mobile PWA touch-friendly | ❌ Desktop-only |
| Criação de treinos | ✅ Duplicação semanal (120 sessões em segundos) | ❌ Criação manual sessão a sessão |
| Diagramas de exercícios | ✅ Upload de imagem / editor táctico | ❌ Só texto |
| Gráficos | ✅ Interactivos com hover/tap + tooltip | ❌ Estáticos |
| Eventos de jogo | ✅ Mobile, auto-minuto | ❌ Desktop, minuto manual |
| Link público | ✅ Token cifrado partilhável | ❌ Inexistente ou básico |
| Permissões | ✅ 10 áreas × 4 operações, configuráveis | ❌ Roles fixos |

---

## 2. Stack técnica

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework Web | Next.js App Router | 16.1.6 |
| UI Library | React | 19.2.3 |
| Linguagem | TypeScript (strict) | ^5 |
| Base de Dados + Auth | Supabase (PostgreSQL + Auth + RLS) | ^2.97.0 |
| Styling | Tailwind CSS v4 | ^4 |
| UI Components | shadcn/ui + Radix UI | ^1.4.3 |
| Validação | Zod | ^4.3.6 |
| PDF | jsPDF + jspdf-autotable | ^4.2 |
| Mapas | Leaflet + OpenStreetMap | ^1.9.4 |
| Email | Resend | ^6.9.2 |
| Push Notifications | web-push (VAPID) | ^3.6.7 |
| Testes | Vitest | ^3.2.4 |
| Deploy | Vercel Pro (serverless) | — |
| Error tracking | Sentry | — |
| Analytics | PostHog EU Cloud | — |
| Package manager | pnpm | — |

---

## 3. Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                   Vercel Pro (Edge)                  │
│                                                      │
│   Next.js App Router (SSR + Server Components)       │
│   ├── /app — páginas e layouts                       │
│   ├── /app/api — Route Handlers (52 endpoints)       │
│   └── middleware.ts — auth + security headers        │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │   Supabase Platform     │
          │  ┌─────────────────┐   │
          │  │  PostgreSQL DB  │   │
          │  │  + RLS policies │   │
          │  └─────────────────┘   │
          │  ┌─────────────────┐   │
          │  │   Auth (PKCE)   │   │
          │  └─────────────────┘   │
          │  ┌─────────────────┐   │
          │  │ Storage (imgs)  │   │
          │  └─────────────────┘   │
          └─────────────────────────┘
```

### Princípios de arquitectura

- **SSR por defeito** — Server Components para todos os reads. Client Components apenas para interactividade.
- **RLS no Supabase** — isolamento de dados por clube enforced na base de dados, não só na aplicação.
- **Read/write split** — reads usam `createServerClient` (respeitam RLS), writes usam `createAdminClient` apenas quando estritamente necessário.
- **RPCs transaccionais** — operações críticas (finalizar jogo, resgatar convite) são RPCs atómicas no Supabase.
- **Validação Zod** — todos os 52 endpoints têm schema de validação.
- **correlationId** — todos os erros têm ID de correlação (exposto apenas em dev).

### Segurança

- HSTS 2 anos, X-Frame-Options DENY, Referrer-Policy strict
- PKCE OAuth correctamente implementado
- Rate limiting com limpeza automática de entradas expiradas
- Chave de cifra dedicada para tokens públicos
- Multi-club isolation: `club_id` + FK + índices + RLS em todas as tabelas

---

## 4. Estrutura do projecto

```
coach11/
├── src/
│   ├── app/
│   │   ├── (auth)/                 # login, register, reset-password
│   │   ├── (dashboard)/            # layout autenticado
│   │   │   ├── dashboard/
│   │   │   ├── club/
│   │   │   ├── teams/
│   │   │   │   └── [ageGroupId]/
│   │   │   ├── trainings/
│   │   │   │   └── [id]/
│   │   │   ├── games/
│   │   │   │   └── [id]/
│   │   │   ├── exercises/
│   │   │   ├── calendar/
│   │   │   ├── statistics/
│   │   │   └── settings/
│   │   ├── api/                    # 52 Route Handlers
│   │   │   ├── games/
│   │   │   ├── trainings/
│   │   │   ├── players/
│   │   │   ├── invite/
│   │   │   ├── exercises/
│   │   │   └── ...
│   │   └── onboarding/
│   ├── components/
│   │   ├── ui/                     # shadcn/ui base
│   │   ├── games/
│   │   ├── trainings/
│   │   ├── players/
│   │   └── ...
│   ├── lib/
│   │   ├── auth/                   # Supabase client helpers
│   │   ├── constants/
│   │   │   └── z-index.ts          # z-index hierarchy global
│   │   ├── schemas/                # Zod schemas
│   │   ├── services/               # business logic
│   │   └── utils/
│   └── tests/                      # Vitest (138 testes)
├── supabase/
│   └── migrations/                 # 38+ migrações SQL com timestamps
├── public/
│   ├── manifest.json               # PWA
│   └── sw.js                       # Service Worker
├── next.config.ts
├── middleware.ts
└── .env.example
```

---

## 5. Modelo de dados

### Hierarquia principal

```
Club (clube)
└── Age Group (escalão: "Infantis A / Sub-13")
    ├── Players (jogadores — pertencem ao escalão, não à equipa)
    ├── Staff (age_group_staff + staff_permissions)
    ├── Training Sessions (treinos)
    │   ├── Training Phases (fases da UT)
    │   │   └── Training Phase Exercises → Exercises (biblioteca)
    │   └── Training Attendance (4 estados)
    ├── Games (jogos)
    │   ├── Convocations + Convocation Players
    │   ├── Game Events (live)
    │   └── Game Final Stats
    └── Competitions
```

### Entidades críticas

**`age_groups`** — é a "equipa" no modelo Coach11. Contém `name` (ex: "Infantis A"), `age_level` (ex: "Sub-13"), e `club_id`.

**`training_sessions`** — campos de calendário (`session_date`, `start_time`, `end_time`, `location`) + campos de planeamento (`focus`, `intensity`, `period_type`, `field_area`, `objective`, `microcycle_number`, `mesocycle_number`, etc.).

**`exercises`** — biblioteca partilhada com 10 categorias de exercício alinhadas com a taxonomia do futebol de formação português:

| Código | Label PT |
|---|---|
| `attb` | Atributos |
| `esquemas_taticos` | Esquemas Tácticos |
| `estrategia` | Estratégia |
| `finalizacao` | Finalização |
| `organizacao_defensiva` | Organização Defensiva |
| `organizacao_ofensiva` | Organização Ofensiva |
| `principios_de_jogo` | Princípios de Jogo |
| `qualidades_fisicas` | Qualidades Físicas |
| `transicao_defensiva` | Transição Defensiva |
| `transicao_ofensiva` | Transição Ofensiva |

**`training_attendance`** — 4 estados: `present` (verde), `absent` (vermelho), `late` (amarelo), `injured` (laranja).

### Labels PT (mapeamentos)

```typescript
// Foco
tactical → Táctica | technical → Técnica | physical → Física | mixed → Misto

// Intensidade
low → Baixo | medium → Médio | high → Alto | very_high → Muito Alto

// Período
pre_season → Pré-época | competitive → Competitivo | transition → Transição

// Área de treino
complete → Campo Inteiro | half → Meio Campo | third → 1/3 Campo | quarter → 1/4 Campo
```

---

## 6. Sistema de permissões

```
Master Admin (SUPER_COORDINATOR_EMAIL)
└── Acesso total a todos os clubes (hardcoded)

Coordenador do Clube
├── Acesso total ao seu clube
├── Cria Coordenadores de Escalão → define permissões
└── Edita permissões de qualquer membro do clube

Coordenador de Escalão
├── Permissões definidas pelo Coord. Clube
├── Cria Principal / Adjuntos / Estagiários → define permissões
└── Edita permissões dos membros do seu escalão

Treinador Principal / Adjunto / Estagiário
└── Permissões definidas por quem o convidou (NÃO tem RWED automático)
```

**READ = sempre true** para todo o staff do clube.  
**WRITE / EDIT / DELETE** = consulta tabela `staff_permissions`.

**10 áreas de permissão:** `players`, `trainings`, `attendance`, `games`, `convocations`, `live_events`, `statistics`, `exercises`, `documents`, `registrations`.

---

## 7. Funcionalidades implementadas

### ✅ Core

- **Onboarding 3 passos** — clube → escalão → convite de staff
- **Sistema de convites por email** — token cifrado, resgate único (RPC atómica)
- **Gestão de plantel** — CRUD jogadores, upload de foto, dados pessoais
- **Gestão de staff** — convites, permissões granulares por área (10 × 4 ops)

### ✅ Treinos

- **Criação e edição de treinos** — todos os campos de planeamento e calendário
- **Duplicação semanal automática** — criar semana 1 (ex: Seg/Qua/Sex às 18:30 = UT01/02/03), duplicar para semanas seguintes com auto-incremento de UT e datas actualizadas
- **UT estruturada com fases + exercícios** — fases personalizadas, exercícios da biblioteca, TR + TA acumulado
- **Presenças** — 4 estados por atleta, com indicadores visuais
- **Export PDF da UT** — com imagens dos exercícios, logo do clube, grid de 3 colunas, TA acumulado

### ✅ Jogos

- **Convocatória** — selecção de atletas, link público partilhável (token cifrado)
- **Eventos live** — registo mobile em tempo real, auto-minuto
- **Ficha de jogo** — resumo, estatísticas finais
- **RPC `get_player_season_stats`** — estatísticas agregadas por época

### ✅ Biblioteca de exercícios

- **CRUD completo** — criar, editar, arquivar exercícios
- **Upload de imagem** — diagramas tácticos (bucket `exercise-images`, público)
- **10 categorias EMJOGO** — com cores e badges
- **Campos avançados** — orientação, regime, subcategoria, formato de jogo, dimensões do espaço, material, etc.
- **Filtros** — por categoria, estado, texto livre

### ✅ Clube e equipas

- **Configuração do clube** — nome, sigla, logo, cores, kits
- **Multi-clube** — arquitectura com isolamento completo por `club_id` + RLS
- **Página de equipa** — 5 tabs: Geral, Atletas, Staff, Planeamento, Configurações
- **Performance da equipa** — gráficos interactivos com hover/tap, 4 estados de presença

### ✅ PWA e notificações

- **PWA** — manifest, service worker, instalável
- **Push notifications** — infra VAPID implementada (web-push)
- **Calendário** — vista mensal com eventos

---

## 8. Roadmap

### Sprint 3 — Dashboard Insights
- [ ] UI estatísticas de atletas (RPC já existe) — Jogos, Titular, Suplente, Minutos, GM, A, CA, CV
- [ ] Mapa de presenças mensal (grid atleta × dia)
- [ ] Stats cards com sparklines
- [ ] Export Excel/PDF das estatísticas
- [ ] Redesign sidenav desktop

### Sprint 4 — Compliance / Planeamento
- [ ] Modelo de Jogo (4 momentos + sistema táctico, texto livre)
- [ ] Objectivos da época
- [ ] Documentos por época e por jogador
- [ ] Club branding (cores primária/secundária)
- [ ] Ficha de jogo: aspectos +/-/a melhorar, info adversário
- [ ] Modelo 9 IPDJ (download)

### Sprint 5 — Editor Táctico
- [ ] Editor integrado react-konva (campo, jogadores, setas, formas, texto)
- [ ] Templates de campo (11×11, 9×9, 7×7)
- [ ] Export como imagem para guardar no exercício

### Sprint 6 — Dossier FPF Exportável
- [ ] Aggregation API (UTs + presenças + exercícios + objectivos)
- [ ] PDF completo com índice
- [ ] Shareable link para avaliador FPF

### Sprint 7 — Apresentação a clubes
- [ ] Demo com dados reais
- [ ] Pricing page
- [ ] Onboarding flow optimizado

### Dívida técnica
- [ ] Forensic migrations (consolidar 22+ migrations)
- [ ] Encryption key rotation
- [ ] Custom domain coach11.app no Supabase Auth
- [ ] Middleware-to-proxy migration (Next.js 16 deprecation)
- [ ] `<img>` → `<Image>` nos componentes de exercícios

---

## 9. Configuração local

### Pré-requisitos

- Node.js 20+
- pnpm
- Conta Supabase (projeto criado)
- Conta Resend (domínio verificado)

### Setup

```bash
# 1. Clonar o repositório
git clone https://github.com/pehmsc/coach11.git
cd coach11

# 2. Instalar dependências
pnpm install

# 3. Copiar variáveis de ambiente
cp .env.example .env.local
# Preencher todas as variáveis (ver secção abaixo)

# 4. Aplicar migrações Supabase
npx supabase db push

# 5. Arrancar em desenvolvimento
pnpm dev
```

### Validação pré-deploy

```bash
npx tsc --noEmit    # sem erros de tipo
pnpm lint           # zero erros ESLint
npx vitest run      # todos os testes passam
```

---

## 10. Variáveis de ambiente

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth
NEXT_PUBLIC_APP_URL=https://coach11.app
SUPER_COORDINATOR_EMAIL=          # email do Master Admin
PUBLIC_TOKEN_ENCRYPTION_KEY=      # chave AES para tokens públicos (convocatórias)
INVITE_TOKEN_ENCRYPTION_KEY=      # chave AES para tokens de convite (diferente da anterior)

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@befirstrs.com

# Push Notifications (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@coach11.app

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
POSTHOG_PROJECT_ID=
POSTHOG_PERSONAL_API_KEY=
```

> ⚠️ Nunca commitar o `.env.local`. Está incluído no `.gitignore`.

---

## 11. Workflow de desenvolvimento

### Branching

| Prefixo | Uso |
|---|---|
| `feature/` | Nova funcionalidade |
| `bugfix/` | Correcção de bug |
| `infra/` | Infraestrutura / DevOps |
| `chore/` | Limpeza / Refactor / Testes |

```bash
# Criar branch a partir de main actualizado
git checkout main && git pull origin main
git checkout -b feature/nome-da-feature

# Trabalhar, fazer commits descritivos em português
git commit -m "feat: adicionar mapa de presenças mensal

Authored-By: Pedro Campos <pedro.campos@befirstrs.com>"

# Push e PR no GitHub
git push origin feature/nome-da-feature
```

### Regras de merge

- Branch nasce sempre de `main` actualizado
- Pedro faz review + merge no GitHub
- Vercel faz deploy automático apenas na `main`
- Nunca dois agentes nos mesmos ficheiros em simultâneo

### Divisão de responsabilidades (agentes)

| Agente | Responsabilidade | Ficheiros |
|---|---|---|
| **Claude Code** | Features completas (schema + API + UI), bugs complexos | `src/app/`, `src/components/`, `src/lib/` |
| **Codex** | Migrations, testes, RPCs, endpoints simples | `supabase/migrations/`, `src/tests/`, SQL |

### Ficheiros protegidos (não modificar sem revisão explícita)

```
# Calendário e link público
/api/calendar/events
calendar-events.service.ts
calendar-events.repository.ts
CalendarPayloadSchema

# Duplicação semanal
DuplicateWeekDialog.tsx
ut-numbering.ts
weekly-duplication.ts
/api/trainings/duplicate-week/
```

---

## 12. Regras de código

### Auto-review obrigatório antes de qualquer push

```bash
npx vitest run        # todos os testes passam?
pnpm lint             # zero erros?
npx tsc --noEmit      # sem erros de tipo?
```

### Proibido em ficheiros novos

- `createAdminClient()` — usar `createServerClient()` salvo excepção justificada
- `select("*")` — seleccionar apenas os campos necessários
- `catch` vazios — sempre logar o erro
- `console.log` — usar o logger centralizado
- Queries N+1 — usar joins ou RPCs

### z-index

Todos os elementos `fixed` / `absolute` devem seguir a hierarquia definida em `src/lib/constants/z-index.ts`. Elementos condicionais têm `pointer-events-none` quando não visíveis.

### Commits

```
feat: descrição curta em português

Corpo opcional com mais detalhe.

Authored-By: Pedro Campos <pedro.campos@befirstrs.com>
```

### Relatório de entrega (agentes)

Cada agente deve incluir no PR description:

```
## Ficheiros criados
- path/to/file.tsx — o que faz

## Ficheiros modificados
- path/to/other.ts — o que mudou e porquê

## Validação
- npx tsc --noEmit ✓
- pnpm lint ✓
- npx vitest run ✓ (N testes)

## Notas
Decisões tomadas, problemas encontrados, pendentes.
```

---

## 13. Observabilidade

### Sentry

Tracking de erros em produção. Configurado com `SENTRY_AUTH_TOKEN` (Organization Token). Source maps enviados no build.

```bash
# Ver erros no dashboard
https://sentry.io/organizations/[SENTRY_ORG]/
```

### PostHog (EU Cloud)

Analytics de comportamento. Project ID: `137851`. Dados alojados na EU (`eu.i.posthog.com`).

- Pageviews automáticos
- Eventos custom nos fluxos críticos (onboarding, criação de treino, finalização de jogo)

### Feedback in-app

Sistema de feedback integrado na aplicação — os coaches podem reportar problemas directamente a partir do campo, sem sair da app.

---

## Custos de operação

| Serviço | Plano | Custo/mês |
|---|---|---|
| Vercel | Pro | $20 |
| Supabase | Free | $0 |
| Resend | Free (100 emails/dia) | $0 |
| Sentry | Free | $0 |
| PostHog | Free (EU Cloud) | $0 |
| Domínio coach11.app | — | ~$1.50 |
| **Total infra** | | **~$21.50** |

Break-even (excluindo ferramentas de dev): **1 clube PRO a €29/mês.**

---

## Licença

Repositório privado. Todos os direitos reservados.  
© 2026 Pedro Campos / Coach11
