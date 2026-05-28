# Relatório de Estado — Faturação & Subscrições (Billing/Stripe)

> Documento para partilhar com o agente de UI/UX. Cobre tudo o que foi
> construído na vertente de faturação e subscrições, o estado actual, os bugs
> encontrados no smoke test de 2026-05-28, e as decisões de UX pendentes.
>
> Última actualização: 2026-05-28

---

## 1. Sumário executivo

O Coach11 tem **duas personas comerciais**, modeladas em `clubs`:

| Persona | `plan_type` | `tier` | Pagamento | Estado |
|---|---|---|---|---|
| **Treinador individual** | `individual` | `individual` | Stripe self-service (€7,99/mês, trial 7d) | Backend pronto, **fluxo de entrada partido** |
| **Clube Standard** | `club` | `standard` | Sales-led (factura manual no backoffice) | Funcional |
| **Clube Pro** | `club` | `pro` | Sales-led (factura manual + DB dedicada futura) | Funcional (sem DB dedicada) |

Foram entregues 4 blocos de trabalho (todos merged):
- **B1** — facturação manual sales-led (backoffice + tab coordenador)
- **B1.1** — drawer de detalhe de factura + reenviar email
- **B2** — vista global de atrasos + anexar PDF ao email
- **A1** — Stripe self-service para Individual (foundation)

**Problema crítico actual:** o fluxo de onboarding do treinador individual **não está diferenciado** do fluxo de clube. Um utilizador que vem de `/precos` → "Começar trial" acaba com um clube `plan_type='club'` e nunca chega ao Stripe Checkout. Detalhes na secção 5.

---

## 2. Modelo de dados

### 2.1 Campos em `clubs` (sales-led / fiscal — PR #242)
- `tier` — `individual | standard | pro`
- `legal_name`, `nif`, `billing_address`, `billing_email`, `country`
- `expected_age_groups_count`, `expected_players_count`, `expected_users_count`
- `pending_coordinator_name/email/phone/invite_sent_at`
- `notes`

### 2.2 Tabela `invoices` (B1 — facturação manual)
```
id, club_id, invoice_number, period_start, period_end,
issued_at, due_date, amount_cents, currency,
status (issued|paid|cancelled), paid_at,
pdf_path, notes, created_at, created_by, updated_at
```
- PDF guardado no bucket privado `invoices` (`{club_id}/{invoice_id}.pdf`)
- RLS: super-admin tudo; coordenador (via `club_memberships`) lê as do seu clube

### 2.3 Campos Stripe em `clubs` (A1 — subscrições)
- `stripe_customer_id`, `stripe_subscription_id`
- `subscription_status` — `trialing|active|past_due|canceled|incomplete|incomplete_expired|unpaid|paused`
- `subscription_current_period_end`, `trial_ends_at`
- `subscription_cancel_at_period_end`, `trial_reminder_sent_at`

### 2.4 Tabela `stripe_webhook_events` (A1 — idempotência)
```
id (evt_...), type, api_version, processed_at, payload
```

---

## 3. O que foi construído

### B1 — Facturação manual (PR #253)
**Endpoints admin** (`/api/admin/clubs/[id]/invoices`):
- `GET` lista · `POST` cria (multipart: metadata + PDF) · `PATCH [invoiceId]` mark_paid/cancel · `GET [invoiceId]/pdf` signed URL

**Endpoints coordenador** (`/api/club/invoices`):
- `GET` lista (RLS filtra) · `GET [invoiceId]/pdf` signed URL

**UI:**
- `/admin/clubs/[id]/billing` → `ClubBillingView` (lista, summary cards, filtros, criar, marcar paga, cancelar)
- `InvoiceCreateModal` (form multipart, PDF obrigatório)
- Tab "Facturação" em `/club` → `CoordinatorInvoicesTab` (read-only, alerta atraso, download)

**Helpers:** `src/lib/billing/invoice-helpers.ts` (`formatCents`, `isOverdue`, `daysOverdue`, `statusLabel`, `formatPeriod`) + 17 testes

**Email:** `src/lib/email/send-invoice-email.ts` (Resend, soft-fail)

### B1.1 — Detalhe + reenviar (PR #255)
- `GET .../invoices/[invoiceId]` detalhe · `POST .../resend` reenvia email
- `InvoiceDetailDrawer` (drawer lateral, PDF preview iframe, audit nas notas, acções)

### B2 + PDF anexo (PR #256)
- `GET /api/admin/invoices/overdue` (cross-club, summary + buckets 0-7/8-15/16-30/30+)
- `/admin/atrasos` → `OverdueInvoicesView`
- Badge "⚠ N em atraso" na lista de clubes
- PDF anexado ao email (criação + reenvio)

### Fix preview PDF (PRs #257, #259)
- `?stream=1` nos endpoints PDF (proxy same-origin)
- `next.config.ts`: `sameOriginEmbeddableSecurityHeaders` (X-Frame SAMEORIGIN para os 2 endpoints PDF)

### A1 — Stripe Individual (PR #260)
**SDK:** `stripe@22.1.1`, `src/lib/stripe/client.ts` (lazy + webhook verify), API version `2026-04-22.dahlia`

**Helpers:** `src/lib/stripe/subscription-status.ts` (`hasActiveAccess`, `isReadOnly`, `daysUntilTrialEnd`, `subscriptionLabel`, `blockedRedirectPath`) + 22 testes

**Endpoints:**
- `POST /api/billing/checkout` — Checkout Session (trial 7d, tax inclusive)
- `POST /api/billing/portal` — Customer Portal
- `GET /api/billing/me` — estado para UI
- `POST /api/webhooks/stripe` — signature verify + idempotência + sync

**Pages:** `/billing/start` (router), `/billing/success`, `/billing/blocked`

**UI:** card Individual em `/precos`, tab "Subscrição" em `/club` (`SubscriptionTab`, 4 estados)

**Guard:** `(dashboard)/layout.tsx` bloqueia Individual sem subscrição activa

**Cron:** `/api/notifications/cron/trial-reminder` (dia 5, Resend)

### Fix gate beta (PR #261)
- `OPEN_REGISTRATION=true` desliga gate beta-only

---

## 4. Estado de configuração Stripe (test mode)

- Produto criado: `price_1TbkVZHC1oQYweYhSQrHrmB7` (€7,99/mês)
- Env vars no Vercel: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_ID_INDIVIDUAL_MONTHLY`, `STRIPE_WEBHOOK_SECRET` (confirmado pelo Pedro)
- Webhook endpoint configurado
- Migration aplicada em produção (verificado via MCP)
- `OPEN_REGISTRATION=true` activo

---

## 5. BUGS encontrados no smoke test (2026-05-28)

Conta de teste: `pedro.campos@befirstrs.com` → criou clube "Sport Lisboa Olivais" com `plan_type='club'`, `tier='standard'`, `subscription_status=NULL`.

### BUG-1 (crítico) — Intenção de plano perde-se no `/register`
- `src/app/(auth)/register/page.tsx` lê `?email` e `?code` mas **ignora `?plan=individual`**
- O param vem do `PlanCard` (`/register?plan=individual`) mas nunca é capturado nem propagado
- **Resultado:** o sistema não sabe que o utilizador quer ser Individual

### BUG-2 (crítico) — RPC de onboarding não define `plan_type`
- `create_club_onboarding()` (migration `20260320200000`) só insere `name, short_name, slug, logo_url`
- `plan_type` e `tier` ficam com os defaults da coluna: `'club'` / `'standard'`
- **Resultado:** todo o clube criado no onboarding é "club", mesmo para individuais

### BUG-3 (crítico) — Onboarding não redirige para `/billing/start`
- `src/app/(onboarding)/onboarding/page.tsx` faz `router.push("/dashboard")` no fim (hardcoded)
- Não lê `?next` nem `?plan`
- **Resultado:** o utilizador nunca chega ao Stripe Checkout; fica no dashboard como se fosse clube

### BUG-4 (UX) — Onboarding mostra steps de clube ao individual
- Steps actuais: (1) nome do clube, (2) escalão, (3) convidar equipa técnica
- Para um treinador individual (1 equipa, sem hierarquia), os steps 2 e 3 não fazem sentido na forma actual — "convidar equipa técnica" não é plano individual
- **Decisão de UX necessária** (ver secção 6)

### BUG-5 (esperado, mas a confirmar com Pedro) — Sem email de confirmação
- `upsertInviteAuthCredentials` (`src/lib/auth/invite-auth-user.ts:92,113`) define `email_confirm: true`
- Isto marca a conta como confirmada e **não envia email** — intencional para self-service sem fricção
- **Pergunta:** queres email de boas-vindas (não de confirmação) ao registar? Hoje não há nenhum.

### BUG-6 (UI menor) — Botões desalinhados no onboarding step 3
- `onboarding/page.tsx:666-690`: botão direito tem `h-12`, esquerdo não → alturas diferentes
- Fix trivial: igualar altura

---

## 6. Decisões de UX pendentes (para o agente UI/UX)

### 6.1 Onboarding diferenciado por persona
O onboarding precisa de **dois caminhos** consoante `?plan`:

**Individual** (`?plan=individual`):
- Step único ou minimalista: nome da equipa/clube + escalão
- **Sem** convite de equipa técnica (não há hierarquia no plano individual)
- Criar automaticamente 1 escalão + 1 equipa? Ou deixar o utilizador criar depois?
- No fim → redirect para `/billing/start` (Stripe Checkout)

**Clube** (sem plan ou `?plan=club`):
- Fluxo actual completo (clube + escalão + equipa técnica)
- No fim → `/dashboard` (sales-led, sem Stripe)

### 6.2 Navegação diferenciada (legacy vs individual)
- O Pedro nota: "os menus de certa forma têm de ser diferentes, supostamente fica o legacy"
- Existe já segmentação de nav via `plan_type` (cookie `coach11_plan_type` + `PlanTypeCookieWriter`)
- A nav single-team (individual) vs multi-team (club) **já existe** mas só funciona se `plan_type` estiver correcto — que hoje não está por causa do BUG-2
- Corrigir BUG-1/2/3 deve fazer a nav individual aparecer automaticamente

### 6.3 Indicação de "subscrever" pós-onboarding
- Hoje não há CTA nenhum a dizer "subscreve agora"
- Com o fix do BUG-3, o utilizador vai directo ao Checkout — mas se cancelar o Checkout, precisa de um caminho de volta claro (banner no dashboard? card?)

### 6.4 Tab "Subscrição" para clube
- Hoje mostra "Plano · Clube · sales-led" (correcto), mas convém o agente UX validar a mensagem

---

## 7. Plano de correcção proposto

**Backend (pode ser feito já, sem decisão de UX):**
1. `PlanCard` Individual → apontar para `/billing/start` (não `/register?plan=individual` directo). O `/billing/start` já tem o router que manda para `/register?plan=individual&next=/billing/start`.
2. `/register` → ler `?plan` e `?next`; após registo, redirect para `next` (ou `/onboarding?next=...&plan=...`)
3. `/onboarding` → ler `?plan` e `?next`; passar `plan_type` ao criar clube; redirect para `next` no fim
4. RPC `create_club_onboarding` → aceitar `p_plan_type` (default 'club' para retrocompatibilidade) e setar `plan_type` + `tier` coerente
5. Fix BUG-6 (altura dos botões)

**UX (coordenar com o agente de UI/UX):**
6. Desenhar o onboarding diferenciado (secção 6.1)
7. Validar navegação single-team para individual (secção 6.2)
8. CTA pós-onboarding / recuperação de checkout abandonado (secção 6.3)

**Limpeza:**
9. Apagar a conta de teste `pedro.campos@befirstrs.com` + clube "Sport Lisboa Olivais" antes do próximo teste (ou converter para individual para testar a tab Subscrição)

---

## 8. Ficheiros-chave (referência rápida)

| Área | Ficheiro |
|---|---|
| Modelo subscrição | `src/lib/stripe/subscription-status.ts` |
| Stripe client | `src/lib/stripe/client.ts` |
| Checkout/portal/webhook | `src/app/api/billing/*`, `src/app/api/webhooks/stripe/route.ts` |
| Router de entrada | `src/app/billing/start/page.tsx` |
| Tab subscrição | `src/components/billing/SubscriptionTab.tsx` |
| Tab facturação | `src/components/billing/CoordinatorInvoicesTab.tsx` |
| Guard dashboard | `src/app/(dashboard)/layout.tsx` |
| Registo | `src/app/(auth)/register/page.tsx` |
| Onboarding | `src/app/(onboarding)/onboarding/page.tsx` |
| RPC onboarding | `supabase/migrations/20260320200000_rpc_club_onboarding.sql` |
| Nav segmentation | `src/components/auth/PlanTypeCookieWriter.tsx`, `src/proxy.ts` |
| Mockup A1 | `docs/mockups/sprint-stripe/A1-mockup.html` |
| Mockup B1 | `docs/mockups/sprint-billing/B1-mockup.html` |
