# Coach11 - Avaliacao Completa & Roadmap para Nivel emjogo

## 1. Estado Atual da App

### Tech Stack
- **Frontend:** Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + Radix UI + shadcn
- **Backend:** Next.js API Routes (App Router) + Supabase (PostgreSQL + Auth + Storage + RLS)
- **State:** TanStack React Query v5
- **Observability:** Sentry + PostHog
- **PWA:** Push notifications (web-push), install prompts, offline badges
- **Mapas:** Leaflet + OpenStreetMap (Nominatim)
- **PDF:** jspdf + jspdf-autotable (relatorios de jogo e estatisticas)
- **Email:** Resend
- **Deploy:** Vercel

### Funcionalidades Implementadas

| Modulo | Estado | Notas |
|--------|--------|-------|
| Auth (registo/login) | OK | Supabase Auth, beta invite-only, recovery gate |
| Escaloes (age_groups) | OK | Raiz funcional do dominio, formato futebol (5/7/9/11) |
| Equipas (teams) | OK | Filhas do escalao, contexto competitivo |
| Jogadores (players) | OK | CRUD, convites, status, posicoes |
| Equipa tecnica (age_group_staff) | Parcial | Apenas 2 roles: coach, assistant_coach. Limite de 1 staff tecnico por escalao |
| Jogos (games) | Avancado | CRUD, convocatorias, lineup, sistema tatico, live scoring, checkpoints, eventos, sumario |
| Treinos (trainings) | OK | CRUD, presencas |
| Presencas (attendance) | OK | Treinos e jogos, marcacao por staff |
| Calendario | OK | Vista unificada treinos + jogos |
| Competicoes | OK | Liga/taca/amigavel, fases, jornadas, oponentes |
| Mensagens | OK | Mensagens da equipa, unread tracking |
| Notificacoes | OK | Push notifications, in-app, prune automatico |
| Estatisticas | OK | Jogadores, jogos, PDF export |
| Convocatorias | Avancado | Draft/confirmed/closed, jogadores externos de outros escaloes, lineup, kits, sistema tatico |
| Live scoring | Avancado | Golos, cartoes, substituicoes, fases do jogo, cronometro |
| Paginas publicas | OK | Partilha publica por token encriptado, rate limiting |
| Admin | OK | Beta invites, audit logs, public links |
| PWA | OK | Install, push notifications, iOS modal |
| Localizacao | OK | Autocomplete OSM, mapas, OpenMapsButton |
| Kits | OK | Configuracao de equipamentos (camisola/calcoes/meias) por kit |
| Settings | OK | Conta, equipa setup, logo, configuracao geral |

### Arquitectura de Dados (Pontos Fortes)

- **age_group-first**: Decisao arquitectural solida. `age_groups` e a raiz funcional, nao `clubs`
- **Domain boundaries**: Guardrail automatizado (`guard:architecture`) que impede regressoes
- **Compatibilidade legada**: `clubs`, `club_memberships`, `team_staff` existem mas estao congelados
- **RLS robusto**: Politicas por escalao, policies SQL bem estruturadas
- **Cascade delete**: Implementacao completa e defensiva

---

## 2. Gaps Criticos para Nivel emjogo

### 2.1 Hierarquia Clube > Escaloes (PRIORIDADE MAXIMA)

**Problema atual:** A app opera num contexto de escalao unico. Nao ha dashboard de clube que agrupe todos os escaloes.

**O que falta:**

```
Clube (Master Admin)
  |-- Seniores
  |     |-- Seniores A
  |     |-- Seniores B (Sub-23)
  |-- Juniores (Sub-19)
  |-- Juvenis
  |     |-- Juvenis A (Sub-17)
  |     |-- Juvenis B (Sub-16)
  |-- Iniciados
  |     |-- Iniciados A (Sub-15)
  |     |-- Iniciados B (Sub-14)
  |-- Infantis
  |     |-- Infantis A (Sub-13)
  |     |-- Infantis B (Sub-12)
  |-- Benjamins
  |     |-- Benjamins A (Sub-11)
  |     |-- Benjamins B (Sub-10)
  |-- [Escaloes customizados]
```

**Accoes necessarias:**
1. **Dashboard de Clube** - Vista panoramica de todos os escaloes, com metricas agregadas
2. **Gestao de escaloes** - CRUD de escaloes pelo admin do clube, com categorias (Seniores, Juniores, etc.) e sub-escaloes (A, B)
3. **Role "Club Admin" / Master Admin** - Perfil que ve e gere todos os escaloes do clube
4. **Switching de contexto** - Sidebar/dropdown para navegar entre escaloes sem logout
5. **Escaloes agrupados** - Modelo de dados para categorias pai (ex: "Juvenis") com sub-escaloes

### 2.2 Roles da Equipa Tecnica (PRIORIDADE ALTA)

**Problema atual:** Apenas 2 roles (`coach`, `assistant_coach`) com limite de 1 staff tecnico por escalao.

**O que falta para o modelo desejado:**

| Role | Descricao |
|------|-----------|
| Coordenador Geral | Master admin do clube |
| Coordenador de Escalao | Ja existe como `coordinator_id` |
| Treinador Principal | Ja existe como `coach` |
| Treinador Adjunto | Ja existe como `assistant_coach` |
| Treinador Estagiario | **Novo** |
| Preparador Fisico | **Novo** |
| Treinador de Guarda-Redes | **Novo** |
| Fisioterapeuta | **Novo** |
| Delegado | **Novo** |
| Analista | **Novo** |
| Diretor Desportivo | **Novo** (nivel clube) |

**Accoes necessarias:**
1. Expandir `AGE_GROUP_STAFF_ROLES` para incluir todos os roles necessarios
2. Remover ou tornar configuravel o limite de 1 staff (`TECHNICAL_STAFF_LIMIT`)
3. Definir permissoes granulares por role (quem pode editar lineup, quem so ve, etc.)
4. Suportar roles a nivel de clube (Diretor Desportivo, Coordenador Geral)

### 2.3 Convocatorias Cross-Escalao (PRIORIDADE ALTA)

**Problema atual:** Ja existe suporte parcial para jogadores externos em convocatorias (`external_player_convocations` migration), mas precisa de ser mais robusto.

**O que falta:**
1. **UI de selecao cross-escalao** - Ao convocar, poder pesquisar e selecionar jogadores de qualquer escalao do clube
2. **Aprovacao do coordenador de origem** - Workflow de aprovacao quando se convoca jogador de outro escalao
3. **Visibilidade bidirecional** - O coordenador de origem ve que o jogador foi convocado noutro escalao
4. **Historico** - Rastreio completo de emprestimos/convocatorias externas

### 2.4 Paginas Que Faltam vs emjogo

| Funcionalidade | emjogo | Coach11 | Gap |
|----------------|--------|---------|-----|
| Gestao financeira (quotas, mensalidades) | Sim | Nao | Grande |
| Website publico do clube | Sim | Parcial (paginas publicas por token) | Medio |
| Scouting / Avaliacao de jogadores | Sim | Nao | Grande |
| Multi-desporto | Sim | Nao (so futebol) | Baixo (pode nao ser prioridade) |
| Gestao de socios/membros | Sim | Nao | Medio |
| Classificacoes/standings | Sim | Parcial (competicoes) | Medio |
| Comunicacao pais/encarregados | Parcial | Nao | Medio |

---

## 3. Problemas Tecnicos a Resolver

### 3.1 Ficheiros Page.tsx Demasiado Grandes

Ficheiros criticos que precisam de refactoring:

| Ficheiro | Linhas | Problema |
|----------|--------|----------|
| `games/[id]/live/page.tsx` | 2941 | Demasiado grande, dificil de manter |
| `games/[id]/page.tsx` | 2067 | Logica de convocatoria misturada com display |
| `team/setup/page.tsx` | 1380 | Setup wizard monolitico |
| `trainings/page.tsx` | 1266 | CRUD + attendance num so ficheiro |
| `statistics/page.tsx` | 1181 | Tabelas + calculos + PDF inline |
| `calendar/page.tsx` | 1092 | Vista calendario + filtros + modals |

**Recomendacao:** Extrair para componentes e custom hooks. Cada page.tsx deveria ter < 300 linhas.

### 3.2 Ausencia de Testes

- Existem apenas testes unitarios para funcoes utilitarias (`*.test.ts`)
- **Zero testes de integracao ou E2E**
- Nenhum teste para API routes
- Nenhum teste para componentes React

### 3.3 Tipo de Dados Fraco

- `database.ts` usa tipos manuais em vez de tipos gerados pelo Supabase (`supabase gen types`)
- Risco de dessincronia entre schema real e tipos TypeScript

### 3.4 API Routes sem Validacao Consistente

- Algumas routes usam Zod, outras fazem validacao manual
- Falta middleware unificado de autorizacao

---

## 4. Roadmap Sugerido (8 Semanas)

### Semana 1-2: Fundacao Multi-Escalao

- [ ] Modelo de dados para hierarquia Clube > Categoria > Escalao
- [ ] Migration para `age_group_categories` (Seniores, Juniores, Juvenis, etc.)
- [ ] Role "Club Admin" com acesso a todos os escaloes
- [ ] Dashboard de clube com vista panoramica
- [ ] Navegacao/switching entre escaloes

### Semana 3-4: Equipa Tecnica Completa

- [ ] Expandir roles da equipa tecnica (estagiario, preparador fisico, GR trainer, delegado, etc.)
- [ ] Remover limite de 1 staff e tornar configuravel
- [ ] Permissoes granulares por role
- [ ] UI de gestao de equipa tecnica melhorada
- [ ] Convite e onboarding de staff com roles especificos

### Semana 5-6: Convocatorias Cross-Escalao + Refactoring

- [ ] Pesquisa e selecao de jogadores de outros escaloes nas convocatorias
- [ ] Notificacao/aprovacao do coordenador de origem
- [ ] Historico de emprestimos
- [ ] Refactoring dos page.tsx grandes em componentes
- [ ] Extrair hooks customizados para logica de negocio

### Semana 7-8: Polish + Funcionalidades Complementares

- [ ] Avaliacao de jogadores (fichas individuais com metricas)
- [ ] Portal de pais/encarregados (vista read-only + confirmacao de presencas)
- [ ] Classificacoes automaticas nas competicoes
- [ ] Testes E2E para fluxos criticos
- [ ] Performance e optimizacao mobile

---

## 5. Mudancas de Schema Sugeridas

### Nova tabela: `age_group_categories`

```sql
CREATE TABLE public.age_group_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES public.clubs(id),
  name TEXT NOT NULL,           -- "Seniores", "Juniores", "Juvenis", etc.
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Alterar `age_groups`

```sql
ALTER TABLE public.age_groups
  ADD COLUMN category_id UUID REFERENCES public.age_group_categories(id),
  ADD COLUMN sub_label TEXT;   -- "A", "B", ou NULL
```

### Expandir roles em `age_group_staff`

```sql
-- Alterar constraint de role
ALTER TABLE public.age_group_staff
  DROP CONSTRAINT IF EXISTS age_group_staff_role_check;

ALTER TABLE public.age_group_staff
  ADD CONSTRAINT age_group_staff_role_check
  CHECK (role IN (
    'coach', 'assistant_coach', 'intern_coach',
    'fitness_coach', 'goalkeeper_coach',
    'physiotherapist', 'delegate', 'analyst'
  ));
```

### Nova tabela: `club_admins`

```sql
CREATE TABLE public.club_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id),
  profile_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (club_id, profile_id)
);
```

---

## 6. Resumo Executivo

### O que ja esta BEM:
- Arquitectura age_group-first e solida e escalavel
- Domain boundaries com guardrails automatizados
- Stack moderna e bem escolhida (Next.js 16, React 19, Supabase)
- Live scoring avancado com fases de jogo
- PWA com push notifications
- Convocatorias ja suportam jogadores externos (base para cross-escalao)

### O que PRECISA de mudar para nivel emjogo:
1. **Hierarquia de clube** - Sem isto, nao ha produto multi-escalao
2. **Mais roles de staff** - Limitar a 2 roles e 1 convite nao serve um clube real
3. **Cross-escalao robusto** - Fundamental para clubes de formacao
4. **Refactoring de pages grandes** - Manutenibilidade a longo prazo
5. **Testes** - Sem testes, e arriscado fazer mudancas estruturais

### Prioridade absoluta para as proximas 2 semanas:
> Implementar a hierarquia Clube > Escaloes com dashboard de clube e switching de contexto.
> Tudo o resto depende desta fundacao.
