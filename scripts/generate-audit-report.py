#!/usr/bin/env python3
"""Generate Coach11 Audit Report PDF."""

import sys
# Work around broken cryptography module in this environment
for mod in ['cryptography', 'cryptography.hazmat', 'cryptography.hazmat.primitives',
            'cryptography.hazmat.primitives.serialization',
            'cryptography.hazmat.primitives.serialization.pkcs12']:
    sys.modules[mod] = type(sys)(mod)

from fpdf import FPDF
from datetime import date


class AuditPDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "Coach11 - Auditoria Tecnica | Marco 2026", align="R")
        self.ln(12)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Pagina {self.page_no()}/{{nb}}", align="C")

    def chapter_title(self, title, level=1):
        if level == 1:
            self.set_font("Helvetica", "B", 16)
            self.set_text_color(20, 60, 120)
            self.ln(4)
            self.cell(0, 10, title)
            self.ln(10)
            self.set_draw_color(20, 60, 120)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(4)
        elif level == 2:
            self.set_font("Helvetica", "B", 13)
            self.set_text_color(40, 80, 140)
            self.ln(2)
            self.cell(0, 8, title)
            self.ln(10)
        elif level == 3:
            self.set_font("Helvetica", "B", 11)
            self.set_text_color(60, 60, 60)
            self.cell(0, 7, title)
            self.ln(8)

    def body_text(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def bullet(self, text, indent=10):
        x = self.get_x()
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.set_x(x + indent)
        self.cell(4, 5.5, "-")
        self.multi_cell(0, 5.5, text)
        self.ln(1)

    def severity_badge(self, severity, text):
        colors = {
            "CRITICO": (220, 38, 38),
            "ALTO": (234, 88, 12),
            "MEDIO": (202, 138, 4),
            "BAIXO": (22, 163, 74),
            "OK": (22, 163, 74),
            "INFO": (59, 130, 246),
        }
        r, g, b = colors.get(severity, (100, 100, 100))
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(r, g, b)
        self.set_text_color(255, 255, 255)
        w = self.get_string_width(severity) + 6
        self.cell(w, 6, severity, fill=True)
        self.set_text_color(40, 40, 40)
        self.set_font("Helvetica", "", 10)
        self.cell(0, 6, f"  {text}")
        self.ln(8)

    def table_header(self, cols, widths):
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(240, 240, 245)
        self.set_text_color(40, 40, 40)
        for i, col in enumerate(cols):
            self.cell(widths[i], 7, col, border=1, fill=True, align="C")
        self.ln()

    def table_row(self, cols, widths, fill=False):
        self.set_font("Helvetica", "", 9)
        self.set_text_color(40, 40, 40)
        if fill:
            self.set_fill_color(248, 248, 252)
        max_h = 7
        for i, col in enumerate(cols):
            self.cell(widths[i], max_h, col[:50], border=1, fill=fill)
        self.ln()

    def check_page_break(self, h=30):
        if self.get_y() + h > 270:
            self.add_page()


pdf = AuditPDF()
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)

# ============ COVER PAGE ============
pdf.add_page()
pdf.ln(50)
pdf.set_font("Helvetica", "B", 32)
pdf.set_text_color(20, 60, 120)
pdf.cell(0, 15, "Coach11", align="C")
pdf.ln(18)
pdf.set_font("Helvetica", "", 20)
pdf.set_text_color(80, 80, 80)
pdf.cell(0, 12, "Auditoria Tecnica Completa", align="C")
pdf.ln(12)
pdf.set_font("Helvetica", "", 14)
pdf.cell(0, 10, "Arquitectura | Seguranca | Performance | Qualidade", align="C")
pdf.ln(30)
pdf.set_font("Helvetica", "", 12)
pdf.set_text_color(120, 120, 120)
pdf.cell(0, 8, f"Data: {date.today().strftime('%d/%m/%Y')}", align="C")
pdf.ln(8)
pdf.cell(0, 8, "Dominio: coach11.app", align="C")
pdf.ln(8)
pdf.cell(0, 8, "Stack: Next.js 16 + React 19 + Supabase + TypeScript", align="C")

# ============ TABLE OF CONTENTS ============
pdf.add_page()
pdf.chapter_title("Indice")
sections = [
    "1. Resumo Executivo",
    "2. Arquitectura UML do Projeto",
    "3. Erros e Problemas Identificados",
    "4. Auditoria de Seguranca",
    "5. Analise de Performance e Escalabilidade",
    "6. Refactoring Necessario",
    "7. Smoke Test / Community Test",
    "8. Migracao de Dominio (vercel.app -> coach11.app)",
    "9. Plano de Acao por Sprints",
]
for s in sections:
    pdf.body_text(s)

# ============ 1. RESUMO EXECUTIVO ============
pdf.add_page()
pdf.chapter_title("1. Resumo Executivo")

pdf.body_text(
    "O Coach11 e uma aplicacao web/PWA para gestao de escaloes de futebol em clubes. "
    "Esta auditoria avalia o estado actual do projecto em 6 dimensoes: arquitectura, "
    "seguranca, performance, qualidade de codigo, testes e preparacao para producao."
)

pdf.chapter_title("Scorecard Geral", level=2)

scores = [
    ("Seguranca", "8.5/10", "Forte - CSP, RLS, sanitizacao, rate limiting"),
    ("Arquitectura", "7.5/10", "Solida age_group-first, domain boundaries"),
    ("Qualidade Codigo", "8/10", "0 erros TS, 0 any, boa tipagem"),
    ("Performance", "6/10", "Todas paginas client-side, sem loading states"),
    ("Testes", "4/10", "17 test files, 0 E2E, 0 componentes"),
    ("Producao-ready", "6.5/10", "Dominio OK, PWA OK, falta CI/CD robusto"),
]

widths = [35, 20, 135]
pdf.table_header(["Area", "Score", "Observacao"], widths)
for i, (area, score, obs) in enumerate(scores):
    pdf.table_row([area, score, obs], widths, fill=i % 2 == 0)

pdf.ln(6)
pdf.body_text(
    "PONTOS FORTES: Zero erros TypeScript, zero uso de 'any', security headers "
    "robustos, domain boundaries com guardrails automatizados, RPC parametrizado, "
    "sanitizacao de HTML, rate limiting implementado."
)
pdf.body_text(
    "PONTOS A MELHORAR: 22 paginas todas client-rendered, sem loading.tsx/error.tsx, "
    "cobertura de testes insuficiente para escalar, 66% das API routes sem validacao Zod, "
    "rate limiting in-memory (nao distribuido)."
)

# ============ 2. ARQUITECTURA UML ============
pdf.add_page()
pdf.chapter_title("2. Arquitectura UML do Projeto")

pdf.chapter_title("2.1 Visao Geral da Estrutura", level=2)
pdf.body_text(
    "O projecto segue o Next.js App Router com a seguinte organizacao:\n\n"
    "src/\n"
    "  app/             -> Rotas (pages, layouts, API)\n"
    "    (auth)/         -> Login, registo, convites\n"
    "    (dashboard)/    -> Area autenticada principal\n"
    "    api/            -> 62 API routes REST\n"
    "    public/         -> Paginas publicas por token\n"
    "  components/       -> 20 modulos de UI organizados por dominio\n"
    "  lib/              -> Logica de negocio, hooks, utils, services\n"
    "  types/            -> Definicoes TypeScript (database.ts manual)\n"
)

pdf.chapter_title("2.2 Diagrama de Componentes", level=2)
pdf.body_text(
    "CAMADA DE APRESENTACAO (Client Components)\n"
    "  |-- Layout (Sidebar, Navigation, TopBar)\n"
    "  |-- Dashboard (DashboardPage, StatsCards, UpcomingEvents)\n"
    "  |-- Players (PlayerList, PlayerCard, PlayerForm)\n"
    "  |-- Games (GameList, GameDetail, LiveGame, Convocation)\n"
    "  |-- Trainings (TrainingList, AttendanceGrid)\n"
    "  |-- Calendar (CalendarView, EventModal)\n"
    "  |-- Statistics (StatsTable, PDFExport)\n"
    "  |-- Settings (TeamSetup, AccountSettings)\n"
    "  |-- PWA (PWAProvider, InstallPrompt, PushNotifications)\n\n"
    "CAMADA DE LOGICA (Hooks + Services)\n"
    "  |-- useLiveGameState (1668 linhas - necessita refactoring)\n"
    "  |-- useTeamSetup, useGameDetailData, useCalendarData\n"
    "  |-- calendar-events.service.ts (795 linhas)\n"
    "  |-- public-share.ts, rate-limit.ts, auth/beta-access.ts\n\n"
    "CAMADA DE DADOS (Supabase)\n"
    "  |-- Supabase Client (SSR + Browser)\n"
    "  |-- RPC Functions (7 stored procedures)\n"
    "  |-- Row Level Security (RLS policies)\n"
    "  |-- Storage (logos, imagens de eventos)\n"
    "  |-- Auth (email/password + recovery)\n"
)

pdf.chapter_title("2.3 Modelo de Dados (Entidades Principais)", level=2)
entities = [
    ("Profile", "Utilizador autenticado (coordenador, treinador, jogador, pai)"),
    ("AgeGroup", "Escalao - raiz funcional do sistema (ex: Sub-15)"),
    ("Player", "Jogador pertencente a um escalao"),
    ("AgeGroupStaff", "Staff tecnico do escalao (coach, assistant_coach)"),
    ("Game", "Jogo agendado/live/finalizado"),
    ("Convocation", "Convocatoria para jogo (draft/confirmed/closed)"),
    ("GameEvent", "Evento de jogo (golo, cartao, substituicao)"),
    ("Training", "Sessao de treino"),
    ("Attendance", "Presenca em treino ou jogo"),
    ("Competition", "Liga, taca ou amigavel"),
    ("Message", "Mensagem de equipa com tracking de leitura"),
    ("Notification", "Push notification e in-app"),
    ("KitConfig", "Configuracao de equipamentos por kit"),
]

widths2 = [45, 145]
pdf.table_header(["Entidade", "Descricao"], widths2)
for i, (ent, desc) in enumerate(entities):
    pdf.table_row([ent, desc], widths2, fill=i % 2 == 0)

pdf.ln(4)
pdf.chapter_title("2.4 Relacoes Chave", level=2)
pdf.body_text(
    "AgeGroup (1) --> (*) Player\n"
    "AgeGroup (1) --> (*) AgeGroupStaff\n"
    "AgeGroup (1) --> (*) Game\n"
    "AgeGroup (1) --> (*) Training\n"
    "AgeGroup (1) --> (*) Competition\n"
    "Game (1) --> (*) Convocation --> (*) Player\n"
    "Game (1) --> (*) GameEvent\n"
    "Training (1) --> (*) Attendance --> (1) Player\n"
    "Profile (1) --> (*) AgeGroupStaff\n"
    "Profile (1) --> (1) AgeGroup (as coordinator)\n"
)

pdf.chapter_title("2.5 Evolucao Arquitectural Prevista", level=2)
pdf.body_text(
    "FASE ATUAL: age_group-first (escalao unico por coordenador)\n\n"
    "FASE 2 (Proxima): Club-first hierarchy\n"
    "  Club --> AgeGroupCategory --> AgeGroup\n"
    "  Novo: ClubAdmin, cross-age-group visibility\n\n"
    "FASE 3: Multi-tenant\n"
    "  Platform --> Club --> AgeGroup\n"
    "  Subscricoes, billing, onboarding autonomo\n"
)

# ============ 3. ERROS IDENTIFICADOS ============
pdf.add_page()
pdf.chapter_title("3. Erros e Problemas Identificados")

pdf.chapter_title("3.1 TypeScript e Lint", level=2)
pdf.severity_badge("OK", "0 erros TypeScript (tsc --noEmit limpo)")
pdf.severity_badge("OK", "0 erros de lint (apenas 3 warnings)")
pdf.severity_badge("OK", "0 uso de 'any', @ts-ignore, @ts-expect-error")

pdf.chapter_title("3.2 Warnings a Resolver", level=2)
pdf.severity_badge("BAIXO", "getLineupLabel nao utilizado (summary/page.tsx:110)")
pdf.severity_badge("BAIXO", "2x <img> em vez de next/image (staff/page.tsx, ClubLogoUpload.tsx)")
pdf.severity_badge("BAIXO", "11 eslint-disable (7 exhaustive-deps + 4 set-state-in-effect)")

pdf.chapter_title("3.3 Problemas de Producao", level=2)
pdf.severity_badge("MEDIO", "Build falha sem SUPER_COORDINATOR_EMAIL env var")
pdf.body_text(
    "O ficheiro beta-access.ts faz throw no module load time quando a variavel "
    "de ambiente nao existe. Isto impede builds locais e CI sem configuracao completa."
)
pdf.severity_badge("MEDIO", "console.info('[auth.debug]') em PWAProvider.tsx em producao")
pdf.body_text(
    "~5 chamadas de debug logging que executam em cada mudanca de estado de auth "
    "e resume do foreground. Devem ser gated por NODE_ENV === 'development'."
)

# ============ 4. SEGURANCA ============
pdf.add_page()
pdf.chapter_title("4. Auditoria de Seguranca")

pdf.chapter_title("4.1 Autenticacao e Autorizacao", level=2)
pdf.severity_badge("OK", "Todas as API routes verificam supabase.auth.getUser()")
pdf.severity_badge("OK", "Admin routes usam getSuperUserAccess() dedicado")
pdf.severity_badge("OK", "RPC functions parametrizadas (0 vectores de SQL injection)")
pdf.severity_badge("OK", "Open redirect protegido via sanitizeNextPath()")
pdf.severity_badge("OK", "Password minimo 10 caracteres enforced (Zod server-side)")
pdf.severity_badge("OK", "PKCE OAuth flow configurado correctamente")
pdf.severity_badge("MEDIO", "Sem middleware.ts - sem gatekeeper centralizado de auth")
pdf.body_text(
    "Se um developer esquecer de adicionar auth check a uma nova API route, "
    "fica publicamente acessivel. Recomenda-se adicionar middleware.ts com "
    "route matcher para /api/* e /(dashboard)/*."
)

pdf.chapter_title("4.2 Sessao e Cookies", level=2)
pdf.severity_badge("MEDIO", "Auth cookie httpOnly: false (acessivel a JS client)")
pdf.body_text(
    "O Supabase SSR requer acesso client-side ao cookie, mas isto significa que "
    "um XSS poderia roubar o session token. O cookie tem maxAge de 400 dias, "
    "prolongando a janela de vulnerabilidade."
)
pdf.severity_badge("OK", "SameSite: lax configurado (proteccao CSRF basica)")
pdf.severity_badge("OK", "secure: true em producao")
pdf.severity_badge("INFO", "Sem CSRF token explicito (depende de SameSite + JSON-only)")

pdf.chapter_title("4.3 Headers de Seguranca", level=2)
pdf.severity_badge("OK", "CSP configurado sem unsafe-eval")
pdf.severity_badge("OK", "X-Frame-Options: DENY, frame-ancestors 'none'")
pdf.severity_badge("OK", "Strict-Transport-Security: max-age=63072000")
pdf.severity_badge("OK", "Permissions-Policy: camera=(), microphone=(), geolocation=()")
pdf.severity_badge("OK", "X-Content-Type-Options: nosniff")

pdf.chapter_title("4.4 Input Validation", level=2)
pdf.severity_badge("MEDIO", "34% das API routes usam Zod (21/62)")
pdf.body_text(
    "41 API routes (~66%) nao tem validacao explicita Zod. Usam validacao manual "
    "que e mais propensa a erros. Existe helper parseBody() reutilizavel em "
    "lib/http/validate.ts. Recomenda-se migrar para Zod progressivamente."
)

pdf.chapter_title("4.5 Rate Limiting", level=2)
pdf.severity_badge("MEDIO", "Maioria das API routes SEM rate limiting")
pdf.body_text(
    "Rate limiting existe apenas para: invites (5/15min), location (12/min), "
    "redeem (10/hr). Falta em: games CRUD, players CRUD, messages, "
    "notifications, team, push, competitions. Um atacante autenticado pode "
    "inundar a maioria dos endpoints."
)
pdf.severity_badge("MEDIO", "Endpoints publicos sem rate limiting")
pdf.body_text(
    "/api/auth/register e /api/auth/beta-access/check nao tem rate limiting, "
    "permitindo brute-force ou enumeracao de emails."
)
pdf.severity_badge("MEDIO", "Rate limiting in-memory (per-instance em serverless)")
pdf.body_text(
    "Em Vercel serverless, cada instancia tem o seu rate limiter independente. "
    "Para proteccao distribuida real, migrar para Upstash Redis ou Vercel KV."
)

pdf.chapter_title("4.6 Upload de Ficheiros", level=2)
pdf.severity_badge("MEDIO", "Upload de SVG aceite (risco de stored XSS)")
pdf.body_text(
    "O endpoint /api/team/logo aceita SVG, que pode conter JavaScript embebido. "
    "Positivo: limite 5MB, whitelist de extensoes, validacao MIME, auth check. "
    "Recomendacao: remover SVG do whitelist ou sanitizar server-side. "
    "Tambem falta validacao magic-byte (tipo real do ficheiro)."
)

pdf.chapter_title("4.7 XSS e Sanitizacao", level=2)
pdf.severity_badge("OK", "dangerouslySetInnerHTML com sanitizacao completa")
pdf.severity_badge("OK", "escapeHtml() aplicado ANTES de markdown transforms")

pdf.chapter_title("4.8 Enumeracao de Emails", level=2)
pdf.severity_badge("BAIXO", "beta-access/check revela status de invite por email")
pdf.body_text(
    "O endpoint retorna {allowed, reason} para qualquer email, revelando se "
    "tem beta invite, staff invite ou e legacy user. Considerar remover 'reason' "
    "ou limitar informacao exposta."
)
pdf.severity_badge("OK", "Register retorna erro generico para 'ja registado' (SEC-06)")

pdf.chapter_title("4.9 RLS e Base de Dados", level=2)
pdf.severity_badge("OK", "RLS extensivo em 18+ migrations Supabase")
pdf.severity_badge("OK", "Policies usam security definer functions")
pdf.severity_badge("OK", "Admin client protegido com 'server-only' import")
pdf.severity_badge("OK", "Cross-club boundary policies RESTRICTIVE")

pdf.chapter_title("4.10 Suite de Testes de Seguranca", level=2)
pdf.severity_badge("OK", "security-fixes.test.ts com 19 testes automatizados")
pdf.body_text(
    "Valida: CSP sem unsafe-eval, password min 10 chars, sem hardcoded secrets, "
    "score max cap, correlationId hidden em producao, validacao de nomes. "
    "Erros em producao retornam apenas 'Erro interno do servidor' sem detalhes."
)

# ============ 5. PERFORMANCE ============
pdf.add_page()
pdf.chapter_title("5. Analise de Performance e Escalabilidade")

pdf.chapter_title("5.1 Renderizacao", level=2)
pdf.severity_badge("ALTO", "22/22 paginas sao 'use client' - zero SSR")
pdf.body_text(
    "TODAS as paginas do dashboard sao client-rendered. Isto significa:\n"
    "- Maior bundle JS enviado ao browser\n"
    "- Sem beneficio de streaming SSR do Next.js\n"
    "- SEO limitado (menos relevante para dashboard, mas critico para paginas publicas)\n"
    "- Maior Time to Interactive (TTI)\n\n"
    "Recomendacao: Migrar paginas para Server Components com 'use client' apenas nos "
    "componentes interactivos. Priorizar dashboard, calendar, statistics."
)

pdf.chapter_title("5.2 Loading States e Error Boundaries", level=2)
pdf.severity_badge("ALTO", "0 ficheiros loading.tsx encontrados")
pdf.severity_badge("ALTO", "0 ficheiros error.tsx (apenas global-error.tsx)")
pdf.body_text(
    "Sem loading.tsx, o utilizador ve um ecra branco durante a navegacao. "
    "Sem error.tsx por segmento, erros em sub-paginas crashes toda a app.\n\n"
    "Recomendacao: Adicionar loading.tsx com skeletons em (dashboard)/ e cada "
    "sub-rota. Adicionar error.tsx em (dashboard)/ e (auth)/."
)

pdf.chapter_title("5.3 Caching", level=2)
pdf.severity_badge("OK", "React Query (TanStack) para caching client-side")
pdf.severity_badge("OK", "unstable_cache para paginas publicas (ISR)")
pdf.severity_badge("OK", "Cache-Control headers bem configurados para assets")
pdf.severity_badge("MEDIO", "Sem caching server-side para API routes autenticadas")

pdf.chapter_title("5.4 Queries de Base de Dados", level=2)
pdf.severity_badge("ALTO", "Convocation route: 10+ queries sequenciais (waterfall)")
pdf.body_text(
    "A route GET /api/games/[id]/convocation faz 10+ queries sequenciais ao "
    "Supabase que poderiam ser parallelizadas com Promise.all. Inclui: game, "
    "access context, convocations, players, external players, same-day games, "
    "kit pieces, checkpoints."
)
pdf.severity_badge("ALTO", "resolveUserTeamContext: 3-5 queries POR REQUEST")
pdf.body_text(
    "Esta funcao corre em CADA request autenticado e no dashboard layout, "
    "fazendo 3-5 queries sem qualquer caching. Para 100 utilizadores activos, "
    "isto representa 300-500 queries/request ao Supabase. Implementar caching "
    "com unstable_cache ou React Query server-side."
)
pdf.severity_badge("ALTO", "N+1 em messages: getUserById por sender")
pdf.body_text(
    "loadAuthDisplayNamesById() chama auth.admin.getUserById() individualmente "
    "por cada sender unico. Com muitos senders, cria N+1 auth lookups."
)
pdf.severity_badge("ALTO", "/api/games e /api/trainings sem paginacao")
pdf.body_text(
    "Ambos retornam TODOS os registos sem limite. A medida que as temporadas "
    "acumulam, estas respostas crescem sem controlo. Adicionar cursor pagination."
)

pdf.chapter_title("5.5 Bundle e Dependencias", level=2)
pdf.severity_badge("ALTO", "radix-ui umbrella package importa tudo")
pdf.body_text(
    "O package 'radix-ui' (v1.4.3) importa TODOS os primitivos Radix mesmo "
    "quando so alguns sao usados. Migrar para packages individuais "
    "(@radix-ui/react-dialog, etc.) para tree-shaking efectivo."
)
pdf.severity_badge("OK", "leaflet e jspdf ja usam dynamic import")
pdf.severity_badge("MEDIO", "posthog-js (~45KB) carregado em todas as paginas")

pdf.chapter_title("5.6 React Query Subutilizado", level=2)
pdf.severity_badge("ALTO", "React Query instalado mas maioria usa raw fetch/useState")
pdf.body_text(
    "A maioria das pages usa fetch() + useState/useEffect em vez de React Query. "
    "Perde-se deduplicacao, caching, background refetching e retry automatico. "
    "Migrar progressivamente para useQuery/useMutation."
)

pdf.chapter_title("5.7 Optimizacoes React", level=2)
pdf.severity_badge("OK", "111 usos de useMemo/useCallback em 27 ficheiros")
pdf.severity_badge("MEDIO", "Sem React.memo em list items (ConvocatedRow, etc.)")
pdf.severity_badge("MEDIO", "Pages com 15+ useState - considerar useReducer")

pdf.chapter_title("5.8 Polling Redundante", level=2)
pdf.severity_badge("MEDIO", "Notifications: polling 60-120s + Supabase Realtime")
pdf.body_text(
    "use-unread-notifications.ts faz polling E subscreve Supabase Realtime. "
    "O polling e redundante - remover e confiar apenas no realtime."
)

pdf.chapter_title("5.9 Memory Leaks", level=2)
pdf.severity_badge("OK", "Todos event listeners e intervals limpos correctamente")
pdf.severity_badge("OK", "Supabase realtime channels limpos no cleanup")
pdf.body_text("Nenhum memory leak detectado - boa pratica de cleanup.")

# ============ 6. REFACTORING ============
pdf.add_page()
pdf.chapter_title("6. Refactoring Necessario")

pdf.chapter_title("6.1 Ficheiros Grandes (Prioridade Alta)", level=2)

large_files = [
    ("useLiveGameState.ts", "1,668", "Dividir em sub-hooks por responsabilidade"),
    ("games/[id]/summary/page.tsx", "952", "Extrair componentes de sumario"),
    ("competitions/page.tsx", "928", "Separar CRUD de display"),
    ("team/page.tsx", "909", "Extrair tabs em componentes"),
    ("staff/page.tsx", "840", "Separar lista de formularios"),
    ("players/page.tsx", "813", "Extrair PlayerForm e PlayerList"),
    ("calendar-events.service.ts", "795", "Dividir por tipo de evento"),
    ("games/page.tsx", "680", "Extrair GameCard e GameFilters"),
    ("LandingPage.tsx", "664", "Dividir em seccoes"),
    ("settings/page.tsx", "652", "Extrair cada tab em componente"),
]

widths3 = [70, 20, 100]
pdf.table_header(["Ficheiro", "Linhas", "Accao Recomendada"], widths3)
for i, (f, l, a) in enumerate(large_files):
    pdf.table_row([f, l, a], widths3, fill=i % 2 == 0)

pdf.ln(4)
pdf.chapter_title("6.2 Validacao de API Routes", level=2)
pdf.severity_badge("ALTO", "41 API routes sem validacao Zod (66% do total)")
pdf.body_text(
    "Criar schemas Zod para todas as API routes. Priorizar routes que aceitam POST/PUT/PATCH. "
    "Padrao recomendado: schema.safeParse(body) no inicio de cada handler."
)

pdf.check_page_break(50)
pdf.chapter_title("6.3 Tipos de Base de Dados", level=2)
pdf.severity_badge("MEDIO", "database.ts e manual (298 linhas) - risco de dessincronia")
pdf.body_text(
    "Usar 'supabase gen types typescript' para gerar tipos automaticamente. "
    "Manter database.ts como facade que re-exporta os tipos gerados."
)

pdf.chapter_title("6.4 Camada de Repositorio", level=2)
pdf.severity_badge("MEDIO", "Apenas 3 ficheiros em src/lib/repositories/")
pdf.body_text(
    "57+ ficheiros usam Supabase directamente. Consolidar queries repetidas "
    "em repositorios por dominio: PlayerRepository, GameRepository, etc."
)

pdf.chapter_title("6.5 Blocos catch {} Vazios", level=2)
pdf.severity_badge("ALTO", "104 blocos catch {} vazios em todo o codebase")
pdf.body_text(
    "104 blocos catch que engolem erros silenciosamente. Torna o debugging "
    "extremamente dificil. Adicionar pelo menos console.error ou toast em cada um. "
    "Priorizar os que estao em componentes client-side e API routes."
)

pdf.chapter_title("6.6 API Routes sem respondInternalError", level=2)
pdf.severity_badge("MEDIO", "3 API routes sem error reporting padronizado")
pdf.body_text(
    "Falta respondInternalError + Sentry em:\n"
    "- api/calendar/events/route.ts\n"
    "- api/invite/redeem/route.ts\n"
    "- api/waitlist/route.ts\n\n"
    "Todas as outras ~58 routes usam o padrao correctamente."
)

pdf.chapter_title("6.7 Chamadas Supabase Directas em Pages", level=2)
pdf.severity_badge("MEDIO", "6 dashboard pages com supabase.from() directo")
pdf.body_text(
    "Pages que devem migrar para hooks/repositories:\n"
    "- competitions/page.tsx\n"
    "- dashboard/page.tsx\n"
    "- join/page.tsx\n"
    "- messages/page.tsx\n"
    "- notifications/page.tsx\n"
    "- settings/page.tsx"
)

pdf.chapter_title("6.8 Padroes de Data Fetching Inconsistentes", level=2)
pdf.severity_badge("MEDIO", "3 padroes diferentes de fetch no client-side")
pdf.body_text(
    "O codebase usa 3 padroes diferentes:\n"
    "1. fetch() directo com res.json().catch(() => ({}))\n"
    "2. apiFetch<T>() wrapper (lib/http/apiFetch.ts)\n"
    "3. supabase.from() directo em pages\n\n"
    "Recomendacao: Standardizar em apiFetch para client->API, mover Supabase "
    "para server components ou camada de repositorio."
)

pdf.chapter_title("6.9 eslint-disable Comments", level=2)
pdf.severity_badge("BAIXO", "11 eslint-disable comments (7 exhaustive-deps)")
pdf.body_text(
    "Revisar cada supressao - muitas podem ser resolvidas com useCallback ou "
    "refs. As restantes devem ter comentarios explicativos."
)

pdf.chapter_title("6.10 Environment Variables", level=2)
pdf.severity_badge("MEDIO", "20+ env vars sem .env.example documentado")
pdf.body_text(
    "Variaveis criticas dispersas pelo codebase sem documentacao centralizada. "
    "Nota: SUPABASE_SERVICE_ROLE_KEY tem 3 nomes fallback diferentes - consolidar. "
    "Criar .env.example com todas as variaveis e descricoes."
)

# ============ 7. SMOKE TEST ============
pdf.add_page()
pdf.chapter_title("7. Smoke Test / Community Test")

pdf.chapter_title("7.1 Resultados", level=2)
pdf.severity_badge("OK", "17 ficheiros de teste, 66 testes unitarios - TODOS PASSAM")
pdf.severity_badge("OK", "Lint: 0 erros, 3 warnings")
pdf.severity_badge("OK", "Architecture guard: 313 ficheiros, PASSED")
pdf.severity_badge("MEDIO", "Build: FALHA sem env vars (SUPER_COORDINATOR_EMAIL)")

pdf.chapter_title("7.2 Cobertura de Testes Existente", level=2)

test_areas = [
    ("security-fixes.test.ts", "19 testes", "Validacao de seguranca"),
    ("sanitize-next.test.ts", "6 testes", "Open redirect protection"),
    ("canonical-app-url.test.ts", "3 testes", "URL canonica"),
    ("convocation-editor.test.ts", "Varios", "Editor de convocatorias"),
    ("live-kickoff.test.ts", "Varios", "Inicio de jogo live"),
    ("live-persistence.test.ts", "Varios", "Persistencia de estado"),
    ("public-live/convocation.test.ts", "Varios", "Paginas publicas"),
    ("osm/google-place-id.test.ts", "8 testes", "Providers de localizacao"),
]

widths4 = [65, 30, 95]
pdf.table_header(["Ficheiro", "Testes", "Area"], widths4)
for i, (f, t, a) in enumerate(test_areas):
    pdf.table_row([f, t, a], widths4, fill=i % 2 == 0)

pdf.ln(4)
pdf.chapter_title("7.3 Lacunas Criticas de Testes", level=2)
pdf.severity_badge("CRITICO", "0 testes E2E (Playwright/Cypress)")
pdf.severity_badge("CRITICO", "0 testes de componentes React")
pdf.severity_badge("ALTO", "0 testes de integracao para API routes")
pdf.severity_badge("MEDIO", "Sem .env.example para onboarding de developers")
pdf.severity_badge("MEDIO", "Sem vitest.config.ts (defaults usados)")

pdf.chapter_title("7.4 Community Test Recomendado", level=2)
pdf.body_text(
    "Fluxos criticos que DEVEM ter testes E2E:\n\n"
    "1. Login -> Dashboard -> Ver escalao\n"
    "2. Criar jogo -> Convocatoria -> Confirmar -> Live game\n"
    "3. Live game -> Golos/Cartoes -> Finalizar -> Sumario\n"
    "4. Criar treino -> Marcar presencas\n"
    "5. Convidar staff -> Aceitar convite -> Acesso ao escalao\n"
    "6. Pagina publica -> Verificar dados visiveis\n"
    "7. PWA -> Push notification -> Click -> Navegacao\n"
    "8. Exportar PDF de estatisticas\n"
)

# ============ 8. MIGRACAO DE DOMINIO ============
pdf.add_page()
pdf.chapter_title("8. Migracao de Dominio")

pdf.chapter_title("8.1 Estado Actual", level=2)
pdf.severity_badge("OK", "Codigo-fonte 100% migrado para coach11.app")
pdf.severity_badge("BAIXO", "1 referencia restante em README.md (exemplo curl)")

pdf.chapter_title("8.2 Accoes Necessarias", level=2)
pdf.bullet("Actualizar README.md:53 - curl URL de coach11.vercel.app para coach11.app")
pdf.bullet("Verificar configuracao DNS no Vercel (dominio custom coach11.app)")
pdf.bullet("Configurar redirect 301 de coach11.vercel.app para coach11.app")
pdf.bullet("Actualizar Supabase Auth redirect URLs para coach11.app")
pdf.bullet("Verificar CORS origins no Supabase dashboard")
pdf.bullet("Actualizar canonical URLs em meta tags (SEO)")
pdf.bullet("Verificar push notification VAPID_SUBJECT usa coach11.app")
pdf.bullet("Actualizar quaisquer webhooks externos (Resend, Sentry, PostHog)")

# ============ 9. PLANO DE ACAO ============
pdf.add_page()
pdf.chapter_title("9. Plano de Acao por Sprints")

pdf.chapter_title("Sprint 1: Fundacao e Qualidade (Semana 1-2)", level=2)
pdf.chapter_title("Prioridade: Critico", level=3)
pdf.bullet("Criar .env.example com todas as env vars necessarias")
pdf.bullet("Fix: beta-access.ts - mover throw para runtime, nao module load")
pdf.bullet("Adicionar loading.tsx em (dashboard)/ com skeleton screens")
pdf.bullet("Adicionar error.tsx em (dashboard)/ e (auth)/")
pdf.bullet("Remover getLineupLabel nao utilizada")
pdf.bullet("Actualizar README.md com dominio coach11.app")
pdf.bullet("Configurar Playwright para testes E2E")
pdf.bullet("Criar 3-5 testes E2E para fluxos criticos (login, criar jogo, live game)")
pdf.bullet("Gating dos console.info debug em PWAProvider.tsx")
pdf.bullet("Corrigir catch {} vazios mais criticos (API routes e hooks)")
pdf.bullet("Adicionar respondInternalError a 3 API routes em falta")
pdf.bullet("Consolidar 3 nomes fallback de SUPABASE_SERVICE_ROLE_KEY")

pdf.check_page_break(60)
pdf.chapter_title("Sprint 2: Performance e Validacao (Semana 3-4)", level=2)
pdf.chapter_title("Prioridade: Alto", level=3)
pdf.bullet("Adicionar Zod validation a API routes POST/PUT (priorizar games, players, staff)")
pdf.bullet("Corrigir restantes catch {} vazios (104 no total)")
pdf.bullet("Parallelizar queries na convocation route (Promise.all)")
pdf.bullet("Adicionar paginacao a /api/games e /api/trainings")
pdf.bullet("Cachear resolveUserTeamContext (corre 3-5 queries por request)")
pdf.bullet("Corrigir N+1 getUserById em messages route")
pdf.bullet("Migrar radix-ui umbrella para packages individuais")
pdf.bullet("Migrar pages para React Query (eliminar raw fetch/useState)")
pdf.bullet("Remover polling redundante em notifications (manter Realtime)")
pdf.bullet("Migrar dashboard page para Server Component")
pdf.bullet("Substituir <img> por next/image em staff/page.tsx e ClubLogoUpload.tsx")
pdf.bullet("Refactorar useLiveGameState.ts (1668 linhas) em sub-hooks")
pdf.bullet("Implementar rate limiting distribuido (Upstash Redis)")
pdf.bullet("Adicionar mais 5-10 testes E2E para fluxos secundarios")

pdf.check_page_break(60)
pdf.chapter_title("Sprint 3: Refactoring e Arquitectura (Semana 5-6)", level=2)
pdf.chapter_title("Prioridade: Medio", level=3)
pdf.bullet("Refactorar pages grandes: summary, competitions, team, staff, players (>800 linhas)")
pdf.bullet("Expandir camada de repositorio (PlayerRepo, GameRepo, TrainingRepo)")
pdf.bullet("Mover 6 pages com supabase.from() directo para hooks/repositories")
pdf.bullet("Standardizar data fetching em apiFetch (eliminar 3 padroes diferentes)")
pdf.bullet("Gerar tipos Supabase automaticamente (supabase gen types)")
pdf.bullet("Revisar e resolver 7 eslint-disable exhaustive-deps")
pdf.bullet("Adicionar middleware.ts centralizado para auth (opcional mas recomendado)")
pdf.bullet("Adicionar testes unitarios para repositories e services")

pdf.check_page_break(60)
pdf.chapter_title("Sprint 4: Escalabilidade Multi-Clube (Semana 7-8)", level=2)
pdf.chapter_title("Prioridade: Estrategico", level=3)
pdf.bullet("Modelo de dados: Club > AgeGroupCategory > AgeGroup")
pdf.bullet("Dashboard de clube com vista panoramica de escaloes")
pdf.bullet("Role 'Club Admin' com acesso cross-escalao")
pdf.bullet("Switching de contexto entre escaloes (sidebar dropdown)")
pdf.bullet("Expandir roles de staff (estagiario, preparador fisico, delegado, etc.)")
pdf.bullet("Cross-escalao: convocatoria de jogadores de outros escaloes")
pdf.bullet("Testes E2E para novos fluxos multi-escalao")

pdf.check_page_break(60)
pdf.chapter_title("Sprint 5: Polish e Producao (Semana 9-10)", level=2)
pdf.chapter_title("Prioridade: Importante", level=3)
pdf.bullet("Pipeline CI/CD completo (lint + tsc + test + build)")
pdf.bullet("Monitoring e alertas (Sentry alerts, uptime checks)")
pdf.bullet("Performance audit com Lighthouse (target: >80 em todas as metricas)")
pdf.bullet("Documentacao tecnica para novos developers")
pdf.bullet("Security penetration testing manual")
pdf.bullet("Load testing para cenarios multi-clube (50+ clubes)")
pdf.bullet("Portal de pais/encarregados (vista read-only)")
pdf.bullet("Avaliacao de jogadores (fichas individuais)")

# ============ FINAL SUMMARY ============
pdf.add_page()
pdf.chapter_title("Resumo de Accoes Imediatas (Top 10)")

immediate = [
    ("1", "CRITICO", "Criar .env.example e fix beta-access.ts build error"),
    ("2", "CRITICO", "Adicionar loading.tsx e error.tsx boundaries"),
    ("3", "CRITICO", "Configurar Playwright e criar primeiros testes E2E"),
    ("4", "ALTO", "Corrigir 104 catch {} vazios (erros silenciosos)"),
    ("5", "ALTO", "Adicionar Zod validation a 41 API routes"),
    ("6", "ALTO", "Refactorar useLiveGameState.ts (1668 linhas)"),
    ("7", "ALTO", "Migrar paginas para Server Components"),
    ("8", "MEDIO", "Standardizar data fetching (3 padroes -> 1)"),
    ("9", "MEDIO", "Implementar rate limiting distribuido"),
    ("10", "MEDIO", "Expandir camada repositorio + gerar tipos Supabase"),
]

widths5 = [10, 25, 155]
pdf.table_header(["#", "Severidade", "Accao"], widths5)
for i, (num, sev, action) in enumerate(immediate):
    pdf.table_row([num, sev, action], widths5, fill=i % 2 == 0)

pdf.ln(10)
pdf.set_font("Helvetica", "I", 10)
pdf.set_text_color(100, 100, 100)
pdf.multi_cell(0, 6,
    "Este relatorio foi gerado automaticamente com base na analise estatica do "
    "codigo-fonte, execucao de testes, e inspecao de configuracoes. "
    "Recomenda-se complementar com testes manuais e penetration testing."
)

# Save
output_path = "/home/user/coach11/docs/coach11-audit-report.pdf"
pdf.output(output_path)
print(f"PDF generated: {output_path}")
print(f"Pages: {pdf.pages_count}")
