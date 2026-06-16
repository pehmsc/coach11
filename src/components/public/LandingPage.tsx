import Image from "next/image";
import Link from "next/link";
import {
  Timer,
  Smartphone,
  BarChart3,
  ClipboardCheck,
  Zap,
  Users,
  ChevronRight,
  FileText,
  Copy,
  CalendarDays,
  ArrowRight,
  ArrowDown,
  Gift,
  XCircle,
  Download,
  Rocket,
  Quote,
} from "lucide-react";
import { PlanCard, PLANS } from "@/components/public/PlanCard";
import { PlanCtaButton } from "@/components/public/PlanCtaButton";
import { LandingNav } from "@/components/public/landing/LandingNav";
import { HeroDevice } from "@/components/public/landing/HeroDevice";
import { CountUp } from "@/components/public/landing/CountUp";

// Classes de stagger (cascata ao scroll) — ver globals.css.
const D = ["", "c11-d1", "c11-d2", "c11-d3", "c11-d4", "c11-d5", "c11-d6", "c11-d7"];

// ── Reveal (server, zero JS): wrapper que anima via animation-timeline ──
// Mantido separado dos cards com hover-lift para nao colidir no `transform`.
function Reveal({
  children,
  d = 0,
  strong = false,
  className = "",
}: {
  children: React.ReactNode;
  d?: number;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={`${strong ? "c11-reveal-strong" : "c11-reveal"} ${D[d] ?? ""} ${className}`}>
      {children}
    </div>
  );
}

// ── Stat (hero) ──
function Stat({
  value,
  label,
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className={`text-2xl font-bold md:text-3xl ${
          accent ? "text-emerald-400" : "text-white"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-white/50">{label}</div>
    </div>
  );
}

// ── Founder avatar (iniciais — sem foto, RGPD-safe) ──
function FounderAvatar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 font-bold text-white ${className}`}
    >
      PC
    </div>
  );
}

// ── Feature Card ──
const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "Presenças em 20 segundos",
    description: "Presente, atrasado, ausente ou lesionado num toque.",
    accent: true,
  },
  {
    icon: Timer,
    title: "Jogos ao vivo",
    description: "Eventos em 2 toques, com o minuto preenchido automaticamente.",
    accent: true,
  },
  {
    icon: Copy,
    title: "Duplica a semana",
    description: "Repete o microciclo de treinos sem montar tudo de novo.",
    accent: true,
  },
  {
    icon: Users,
    title: "Convocatórias",
    description: "Define o onze e partilha por link com atletas e famílias.",
  },
  {
    icon: CalendarDays,
    title: "Calendário público",
    description: "Os pais sabem onde e quando, sem te andarem a perguntar.",
  },
  {
    icon: BarChart3,
    title: "Estatísticas & insights",
    description: "Minutos, golos e evolução de cada atleta, sem esforço.",
  },
  {
    icon: FileText,
    title: "Relatórios automáticos",
    description: "Documentos prontos a partilhar com o clube, sem trabalho extra.",
  },
  {
    icon: Smartphone,
    title: "Instala como app",
    description: "Funciona como aplicação no telemóvel, sem passar pela App Store.",
  },
];

function FeatureCard({
  icon: Icon,
  title,
  description,
  accent = false,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`group relative flex h-full flex-col rounded-2xl border p-6 c11-hover-lift ${
        accent
          ? "border-emerald-500/30 bg-emerald-950/40 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/10"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
      }`}
    >
      <div
        className={`mb-4 inline-flex rounded-xl p-3 ${
          accent ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/70"
        }`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-white/60">{description}</p>
    </div>
  );
}

// ── Comparison ──
const COMPARISONS = [
  { feature: "Marcar presenças", old: "5+ minutos, laptop", better: "< 20 segundos, telemóvel" },
  { feature: "Evento em jogo", old: "Anotar em papel, passar depois", better: "2 toques, tempo real" },
  { feature: "Criar 120 treinos", old: "120 operações manuais", better: "4 cliques (duplicar semana)" },
  { feature: "Ver minutos de jogador", old: "Procurar em tabelas desktop", better: "2 toques no banco" },
  { feature: "Enviar convocatória", old: "WhatsApp manual", better: "Link partilhado automático" },
  { feature: "Relatório de jogo", old: "Preencher formulário", better: "PDF gerado automaticamente" },
];

function ComparisonRow({
  feature,
  old,
  better,
}: {
  feature: string;
  old: string;
  better: string;
}) {
  return (
    <div className="grid grid-cols-3 items-center gap-4 border-b border-white/5 py-4 text-sm">
      <span className="font-medium text-white/80">{feature}</span>
      <span className="text-center text-white/40 line-through">{old}</span>
      <span className="text-center font-semibold text-emerald-400">{better}</span>
    </div>
  );
}

// ── Garantias (reversao de risco) ──
const GUARANTEES = [
  { icon: Gift, title: "7 dias grátis", description: "Testa tudo sem dar o cartão." },
  { icon: XCircle, title: "Cancela num clique", description: "Sem chamadas, sem fidelização." },
  { icon: Download, title: "Os dados são teus", description: "Exporta o que é teu quando quiseres." },
  { icon: Rocket, title: "Pronto em minutos", description: "Cria conta e começa no mesmo dia." },
];

// Plano em foco: apenas o do treinador individual (clube vai para a linha discreta).
const individualPlan = PLANS.find((p) => p.name === "Individual");

// ── Main Page (server component) ──
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white antialiased">
      <LandingNav />

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden pt-36 pb-24 md:pt-44 md:pb-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="c11-orb-drift absolute top-0 left-1/2 -ml-[400px] h-[600px] w-[800px] rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="c11-orb-drift-slow absolute bottom-0 right-0 h-[320px] w-[440px] rounded-full bg-emerald-600/8 blur-3xl" />
          {/* Vinheta radial subtil para profundidade */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.06),transparent_55%)]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
            {/* Copy */}
            <div className="text-center lg:text-left">
              <div className="c11-hero-in c11-hero-in-1 mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-300">
                <Zap className="h-3.5 w-3.5" />
                <span>Para treinadores de formação</span>
              </div>

              {/* Alternativa aprovada (trocar facilmente):
                  "O treinador regista." / "O sistema faz o resto." */}
              <h1 className="c11-hero-in c11-hero-in-2 mb-6 text-5xl font-extrabold leading-[1.02] tracking-[-0.02em] md:text-6xl lg:text-7xl">
                Do treino ao
                <br />
                <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                  apito final.
                </span>
              </h1>

              <p className="c11-hero-in c11-hero-in-3 mx-auto mb-8 max-w-xl text-lg leading-relaxed text-white/55 md:text-xl lg:mx-0">
                Marca presenças, convoca o onze e regista o jogo ao vivo — tudo
                no telemóvel, em segundos, no relvado. As estatísticas e os
                relatórios preenchem-se sozinhos. Sem papel, sem voltar a lançar
                tudo no computador.
              </p>

              <div className="c11-hero-in c11-hero-in-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <PlanCtaButton
                  href="/billing/start"
                  label="Começar — 7 dias grátis"
                  planIntent="individual"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 text-base font-semibold text-white transition hover:bg-emerald-400 active:scale-[0.97] sm:w-auto"
                />
                <a
                  href="#features"
                  className="group flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-8 py-4 text-base font-medium text-white/80 transition hover:border-white/30 hover:text-white active:scale-[0.97] sm:w-auto"
                >
                  Ver a app a funcionar
                  <ArrowDown className="h-4 w-4 transition group-hover:translate-y-0.5" />
                </a>
              </div>

              <p className="c11-hero-in c11-hero-in-4 mt-5 text-center text-sm text-white/50 lg:text-left">
                Sem cartão para experimentar · cancela quando quiseres. Já tens
                conta?{" "}
                <a
                  href="/login"
                  className="text-white/70 underline underline-offset-2 transition hover:text-white"
                >
                  Entrar
                </a>
              </p>

              <div className="c11-hero-in c11-hero-in-5 mx-auto mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/5 pt-8 lg:mx-0">
                <Stat value="<20s" label="para marcar presenças" accent />
                <Stat value="2 toques" label="por evento de jogo" />
                <Stat value="€7,99" label="/mês · 7 dias grátis" />
              </div>

              {/* Tira de confianca do fundador */}
              <div className="c11-hero-in c11-hero-in-6 mx-auto mt-8 flex max-w-lg items-center gap-3 border-t border-white/5 pt-6 lg:mx-0">
                <FounderAvatar className="h-10 w-10 text-xs" />
                <p className="text-left text-sm leading-relaxed text-white/55">
                  Feito por um treinador de formação no{" "}
                  <span className="font-semibold text-white/75">
                    CF Os Belenenses
                  </span>{" "}
                  — para resolver a própria dor.
                </p>
              </div>
            </div>

            {/* Device */}
            <div className="c11-hero-in c11-hero-in-6 relative mt-6 lg:mt-0">
              <HeroDevice />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PAIN SECTION ═══ */}
      <section className="border-t border-white/[0.06] bg-slate-900/50 py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              O problema que todos os treinadores conhecem
            </h2>
            <p className="text-lg text-white/55">
              <CountUp to={131} /> treinos agendados. Apenas 1 com presenças
              registadas. Não porque o treinador não quer — porque a ferramenta
              não deixa.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            <Reveal d={1}>
              <div className="h-full rounded-xl border border-red-500/10 bg-red-500/5 p-6">
                <div className="mb-3 text-2xl font-bold text-red-400/80">
                  Papel no banco
                </div>
                <p className="text-sm text-white/55">
                  Fichas e cadernos que se perdem, molham e nunca chegam ao sítio
                  certo. No fim do jogo, metade da informação evapora-se.
                </p>
              </div>
            </Reveal>
            <Reveal d={2}>
              <div className="h-full rounded-xl border border-red-500/10 bg-red-500/5 p-6">
                <div className="mb-3 text-2xl font-bold text-red-400/80">
                  Tudo duas vezes
                </div>
                <p className="text-sm text-white/55">
                  Registas no campo e depois voltas a lançar tudo num backoffice
                  pesado, à secretária. O mesmo trabalho, feito a dobrar.
                </p>
              </div>
            </Reveal>
            <Reveal d={3}>
              <div className="h-full rounded-xl border border-red-500/10 bg-red-500/5 p-6">
                <div className="mb-3 text-2xl font-bold text-red-400/80">
                  Sem histórico
                </div>
                <p className="text-sm text-white/55">
                  Quem faltou? Quantos minutos jogou? Como evoluiu? Sem registo
                  consistente, não há respostas — nem para ti, nem para os pais.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="scroll-mt-24 py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              O teu escalão, organizado.
            </h2>
            <p className="text-lg text-white/55">
              As ferramentas que usas todas as semanas — pensadas para o
              telemóvel, prontas para o relvado.
            </p>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} d={(i % 3) + 1} className="h-full">
                <FeatureCard {...f} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section
        id="how"
        className="scroll-mt-24 border-t border-white/[0.06] bg-slate-900/30 py-24 md:py-32"
      >
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              Campo → Sistema → Dashboard
            </h2>
            <p className="text-lg text-white/55">
              Os dados nascem no campo e fluem automaticamente. Ninguém insere
              nada duas vezes.
            </p>
          </Reveal>

          <div className="grid gap-8 md:grid-cols-3">
            {/* Step 1 */}
            <Reveal d={1}>
              <div className="relative">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-xl font-bold text-emerald-400">
                  1
                </div>
                <h3 className="mb-2 text-lg font-semibold">
                  O treinador regista no campo
                </h3>
                <p className="text-sm text-white/55">
                  Presenças, eventos de jogo, avaliações pós-jogo, notas de
                  treino. Tudo no telemóvel, rápido, com uma mão.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                    Mobile-first
                  </span>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                    Offline-ready
                  </span>
                </div>
                <div className="c11-reveal c11-d5 absolute top-6 right-0 hidden translate-x-1/2 md:block">
                  <ChevronRight className="h-6 w-6 text-white/20" />
                </div>
              </div>
            </Reveal>

            {/* Step 2 */}
            <Reveal d={2}>
              <div className="relative">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-xl font-bold text-white/70">
                  2
                </div>
                <h3 className="mb-2 text-lg font-semibold">O sistema processa</h3>
                <p className="text-sm text-white/55">
                  Agrega estatísticas, calcula minutos, gera rankings, detecta
                  alertas (3 amarelos, faltas consecutivas), prepara relatórios.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">
                    Automático
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">
                    Tempo real
                  </span>
                </div>
                <div className="c11-reveal c11-d6 absolute top-6 right-0 hidden translate-x-1/2 md:block">
                  <ChevronRight className="h-6 w-6 text-white/20" />
                </div>
              </div>
            </Reveal>

            {/* Step 3 */}
            <Reveal d={3}>
              <div>
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-xl font-bold text-white/70">
                  3
                </div>
                <h3 className="mb-2 text-lg font-semibold">
                  Em casa, vês tudo pronto
                </h3>
                <p className="text-sm text-white/55">
                  Dashboard, evolução dos atletas e relatórios prontos a
                  partilhar com o clube e com os pais. Sem inserir um único dado
                  manualmente.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">
                    Dashboard
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">
                    Relatórios
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ COMPARISON ═══ */}
      <section id="comparison" className="scroll-mt-24 py-24 md:py-32">
        <div className="mx-auto max-w-3xl px-6">
          <Reveal className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              A diferença no dia a dia
            </h2>
            <p className="text-lg text-white/55">
              Não se trata de mais funcionalidades. Trata-se de melhor execução
              nos momentos que importam.
            </p>
          </Reveal>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 md:p-8">
            <div className="grid grid-cols-3 gap-4 border-b border-white/10 pb-4 text-sm font-semibold">
              <span className="text-white/50">Tarefa</span>
              <span className="text-center text-white/40">Antes</span>
              <span className="text-center text-emerald-400">Coach11</span>
            </div>

            {COMPARISONS.map((row, i) => (
              <Reveal key={row.feature} d={Math.min(i + 1, 7)}>
                <ComparisonRow {...row} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FOUNDER ═══ */}
      <section className="border-t border-white/[0.06] bg-slate-900/30 py-24 md:py-32">
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:p-12">
              <Quote
                className="absolute right-8 top-8 h-12 w-12 text-emerald-500/15"
                aria-hidden
              />
              <FounderAvatar className="mb-6 h-16 w-16 text-lg" />
              <blockquote className="text-lg leading-relaxed text-white/80 md:text-xl">
                &ldquo;Construí o Coach11 porque vivo o problema. Sou treinador de
                formação e estava farto de registar tudo em papel e voltar a
                escrever no computador. Quis uma ferramenta que estivesse onde eu
                estou — no campo, no telemóvel. Uso-a todas as semanas com o meu
                escalão.&rdquo;
              </blockquote>
              <p className="mt-6 text-sm font-medium text-white/55">
                — Pedro Campos, treinador de formação · CF Os Belenenses ·
                fundador do Coach11
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ GARANTIAS ═══ */}
      <section className="border-t border-white/[0.06] py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Experimentar não tem risco.
            </h2>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GUARANTEES.map((g, i) => (
              <Reveal key={g.title} d={i + 1} className="h-full">
                <div className="h-full rounded-2xl border border-emerald-500/15 bg-emerald-950/20 p-6">
                  <div className="mb-4 inline-flex rounded-xl bg-emerald-500/15 p-3 text-emerald-400">
                    <g.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-1.5 text-base font-semibold text-white">
                    {g.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-white/55">
                    {g.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PLANOS ═══ */}
      <section id="planos" className="scroll-mt-24 border-t border-white/[0.06] py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              Preço simples, sem surpresas.
            </h2>
            <p className="text-lg text-white/55">
              Experimenta 7 dias grátis. Depois, um preço fixo — sem
              fidelização, cancelas quando quiseres.
            </p>
          </Reveal>

          {individualPlan ? (
            <Reveal className="mx-auto max-w-sm">
              <div className="c11-hover-lift-lg">
                <PlanCard {...individualPlan} highlighted />
              </div>
            </Reveal>
          ) : null}

          <p className="mt-8 text-center text-sm text-white/55">
            Tens um clube com vários escalões?{" "}
            <Link
              href="/contacto?persona=club"
              className="inline-flex items-center gap-1 text-emerald-400 underline-offset-2 hover:underline"
            >
              Fala connosco
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </p>

          <p className="mt-3 text-center text-sm text-white/40">
            Detalhes completos na{" "}
            <Link
              href="/precos"
              className="text-white/60 underline-offset-2 hover:underline"
            >
              página de preços
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section id="cta" className="relative scroll-mt-24 overflow-hidden py-24 md:py-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="c11-orb-drift absolute bottom-0 left-1/2 -ml-[300px] h-[420px] w-[600px] rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-xl px-6 text-center">
          <Reveal>
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              Pronto para deixar o papel no banco?
            </h2>
            <p className="mb-8 text-lg text-white/55">
              Começa hoje com 7 dias grátis. Sem compromisso.
            </p>

            <div className="flex justify-center">
              <PlanCtaButton
                href="/billing/start"
                label="Começar — 7 dias grátis"
                planIntent="individual"
                className="flex w-full items-center justify-center rounded-xl bg-emerald-500 px-8 py-4 font-semibold text-white transition hover:bg-emerald-400 active:scale-[0.97] sm:w-auto"
              />
            </div>

            <p className="mt-5 text-sm text-white/50">
              Sem cartão · cancela quando quiseres.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <Link
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            aria-label="Coach11 — voltar ao topo"
          >
            <Image
              src="/icons/icon-192.png"
              alt="Coach11"
              width={28}
              height={28}
              className="h-7 w-7 rounded-md"
            />
            <span className="text-sm font-semibold">
              Coach<span className="text-emerald-400">11</span>
            </span>
          </Link>
          <div className="flex items-center gap-4 text-xs text-white/50">
            <Link href="/precos" className="transition hover:text-white/80">
              Preços
            </Link>
            <Link href="/contacto" className="transition hover:text-white/80">
              Contacto
            </Link>
            <Link href="/faqs" className="transition hover:text-white/80">
              FAQs
            </Link>
            <Link href="/termos" className="transition hover:text-white/80">
              Termos
            </Link>
            <Link href="/privacidade" className="transition hover:text-white/80">
              Privacidade
            </Link>
          </div>
          <p className="text-xs text-white/50">
            &copy; 2026 Coach11. Feito em Lisboa para treinadores de formação.
          </p>
        </div>
      </footer>
    </div>
  );
}
