import Image from "next/image";
import Link from "next/link";
import {
  Timer,
  Smartphone,
  BarChart3,
  ClipboardCheck,
  Zap,
  Shield,
  Users,
  Trophy,
  ChevronRight,
  CheckCircle2,
  Bell,
  FileText,
  Copy,
  ArrowRight,
} from "lucide-react";
import { PlanCard, PLANS } from "@/components/public/PlanCard";
import { PlanCtaButton } from "@/components/public/PlanCtaButton";
import { LandingNav } from "@/components/public/landing/LandingNav";
import { WaitlistForm } from "@/components/public/landing/WaitlistForm";
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

// ── Feature Card ──
const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "Presenças em 20 segundos",
    description:
      "Lista de jogadores com foto e toggle grande. Guardar fixo no fundo. Feito antes do apito.",
    accent: true,
  },
  {
    icon: Timer,
    title: "Eventos live em jogo",
    description:
      "Golos, cartões, substituições — 2 toques com minuto auto-preenchido. Regista durante o jogo, não depois.",
    accent: true,
  },
  {
    icon: Copy,
    title: "Duplicar semana de treinos",
    description:
      "Cria a semana 1 (UT01-UT03). Duplica para o resto da época. 120 sessões em segundos, não em horas.",
    accent: true,
  },
  {
    icon: BarChart3,
    title: "Insights no telemóvel",
    description:
      "Minutos jogados, golos, presenças, alertas de suspensão. Consulta rápida no banco antes de decidir uma substituição.",
  },
  {
    icon: Bell,
    title: "Notificações push",
    description:
      "Convocatórias, treinos, alterações — tudo chega ao atleta e ao pai sem depender do WhatsApp.",
  },
  {
    icon: FileText,
    title: "PDF automático",
    description:
      "Relatório de jogo e planeamento de treino gerados automaticamente com logo do clube. Partilha com 1 toque.",
  },
  {
    icon: Shield,
    title: "Dossier de treino FPF",
    description:
      "UTs estruturadas, biblioteca de exercícios, avaliações, objectivos — tudo o que a certificação pede, pronto para a visita técnica.",
  },
  {
    icon: Users,
    title: "Multi-equipa, multi-escalão",
    description:
      "Coordenador vê tudo. Treinador vê a sua equipa. Adjunto marca presenças. Cada um vê o que precisa.",
  },
  {
    icon: Smartphone,
    title: "PWA instalável",
    description:
      "Instala no telemóvel como uma app nativa. Sem App Store, sem Play Store. Abre e usa.",
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

// ── Comparison Row ──
const COMPARISONS = [
  { feature: "Marcar presenças", old: "5+ minutos, laptop", better: "< 20 segundos, telemóvel" },
  { feature: "Evento em jogo", old: "Anotar em papel, passar depois", better: "2 toques, tempo real" },
  { feature: "Criar 120 treinos", old: "120 operações manuais", better: "4 cliques (duplicar semana)" },
  { feature: "Ver minutos de jogador", old: "Procurar em tabelas desktop", better: "2 toques no banco" },
  { feature: "Enviar convocatória", old: "WhatsApp manual", better: "Push notification automática" },
  { feature: "Relatório de jogo", old: "Preencher formulário", better: "PDF gerado automaticamente" },
  { feature: "Dossier para FPF", old: "Compilar no final da época", better: "Sempre actualizado, exportável" },
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
                <span>Para treinadores e clubes de formação</span>
              </div>

              <h1 className="c11-hero-in c11-hero-in-2 mb-6 text-5xl font-extrabold leading-[1.02] tracking-[-0.02em] md:text-6xl lg:text-7xl">
                O treinador regista.
                <br />
                <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                  O sistema faz o resto.
                </span>
              </h1>

              <p className="c11-hero-in c11-hero-in-3 mx-auto mb-8 max-w-xl text-lg leading-relaxed text-white/55 md:text-xl lg:mx-0">
                Plataforma de gestão desportiva para futebol de formação. Regista
                no campo com o telemóvel — o backoffice preenche-se sozinho, sem
                inserir dados duas vezes.
              </p>

              <div className="c11-hero-in c11-hero-in-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <PlanCtaButton
                  href="/billing/start"
                  label="Começar — 7 dias grátis"
                  planIntent="individual"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 text-base font-semibold text-white transition hover:bg-emerald-400 active:scale-[0.97] sm:w-auto"
                />
                <Link
                  href="/contacto?persona=club"
                  className="group flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-8 py-4 text-base font-medium text-white/80 transition hover:border-white/30 hover:text-white active:scale-[0.97] sm:w-auto"
                >
                  Sou um clube
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
              </div>

              <p className="c11-hero-in c11-hero-in-4 mt-5 text-center text-sm text-white/50 lg:text-left">
                7 dias grátis, sem compromisso. Já tens conta?{" "}
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
              131 treinos agendados. Apenas 1 com presenças registadas. Não
              porque o treinador não quer — porque a ferramenta não deixa.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            <Reveal d={1}>
              <div className="h-full rounded-xl border border-red-500/10 bg-red-500/5 p-6">
                <div className="mb-3 text-2xl font-bold text-red-400/80">Desktop</div>
                <p className="text-sm text-white/55">
                  Plataformas pensadas para o escritório. No campo, com frio e
                  luvas, ninguém abre um laptop para marcar presenças.
                </p>
              </div>
            </Reveal>
            <Reveal d={2}>
              <div className="h-full rounded-xl border border-red-500/10 bg-red-500/5 p-6">
                <div className="mb-3 text-2xl font-bold text-red-400/80">Manual</div>
                <p className="text-sm text-white/55">
                  Dados inseridos duas vezes. O treinador regista e depois o
                  admin volta a preencher. Duplicação constante.
                </p>
              </div>
            </Reveal>
            <Reveal d={3}>
              <div className="h-full rounded-xl border border-red-500/10 bg-red-500/5 p-6">
                <div className="mb-3 text-2xl font-bold text-red-400/80">
                  <CountUp to={120} suffix="×" />
                </div>
                <p className="text-sm text-white/55">
                  120 treinos por época criados um a um. Sem duplicação semanal,
                  sem auto-incremento. Trabalho repetitivo que ninguém quer fazer.
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
              Tudo o que precisas. Nada do que não precisas.
            </h2>
            <p className="text-lg text-white/55">
              Desenhado por treinadores, para treinadores. Cada funcionalidade
              foi pensada para o contexto real: campo, banco, viagem.
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
                  O coordenador consulta
                </h3>
                <p className="text-sm text-white/55">
                  Dashboard com insights, dossier de treino pronto, relatórios
                  exportáveis. Sem inserir um único dado manualmente.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">
                    Dashboard
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">
                    Export PDF/Excel
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

      {/* ═══ FOR WHO ═══ */}
      <section className="border-t border-white/[0.06] bg-slate-900/30 py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Para quem é o Coach11?
            </h2>
          </Reveal>

          <div className="grid gap-6 md:grid-cols-2">
            <Reveal d={1} className="h-full">
              <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-8">
                <div className="mb-4 inline-flex rounded-xl bg-emerald-500/20 p-3">
                  <Trophy className="h-6 w-6 text-emerald-400" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">
                  Clubes certificados FPF
                </h3>
                <p className="mb-4 text-sm text-white/55">
                  Dossier de treino completo, UTs estruturadas, biblioteca de
                  exercícios, avaliações — tudo o que a certificação exige,
                  gerado automaticamente a partir do trabalho no campo.
                </p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-sm text-white/65">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    Critério 4 da FPF coberto
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/65">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    Pronto para visita técnica
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/65">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    Export PDF com logo do clube
                  </li>
                </ul>
              </div>
            </Reveal>

            <Reveal d={2} className="h-full">
              <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-8">
                <div className="mb-4 inline-flex rounded-xl bg-white/10 p-3">
                  <Users className="h-6 w-6 text-white/70" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">
                  Escolas de futebol e clubes pequenos
                </h3>
                <p className="mb-4 text-sm text-white/55">
                  Começar a usar em minutos. Sem configuração complexa, sem
                  obrigações administrativas. Foco no que importa: treinar e
                  gerir a equipa.
                </p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-sm text-white/65">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    7 dias grátis para experimentar
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/65">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    Mobile-first, instala como app
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/65">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    Presenças, jogos e convocatórias
                  </li>
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ PLANOS ═══ */}
      <section id="planos" className="scroll-mt-24 border-t border-white/[0.06] py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              Planos para cada fase do clube
            </h2>
            <p className="text-lg text-white/55">
              Treinador individual em auto-serviço. Clube com onboarding
              dedicado. Sempre com o mesmo produto por baixo.
            </p>
          </Reveal>

          <div className="grid gap-6 md:grid-cols-3">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.name} d={i + 1} className="h-full">
                <div className="h-full c11-hover-lift-lg">
                  <PlanCard {...plan} />
                </div>
              </Reveal>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-white/50">
            Detalhes completos na{" "}
            <Link
              href="/precos"
              className="text-emerald-400 underline-offset-2 hover:underline"
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

            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <PlanCtaButton
                href="/billing/start"
                label="Começar — 7 dias grátis"
                planIntent="individual"
                className="flex w-full items-center justify-center rounded-xl bg-emerald-500 px-8 py-4 font-semibold text-white transition hover:bg-emerald-400 active:scale-[0.97] sm:w-auto"
              />
              <Link
                href="/contacto?persona=club"
                className="group flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-8 py-4 font-medium text-white/80 transition hover:border-white/30 hover:text-white active:scale-[0.97] sm:w-auto"
              >
                Sou um clube
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>

          {/* Captura secundaria — para quem prefere ser contactado */}
          <div className="mx-auto mt-10 max-w-md border-t border-white/5 pt-8">
            <p className="mb-4 text-sm text-white/55">
              Preferes que te contactemos? Deixa o email.
            </p>
            <WaitlistForm />
            <p className="mt-4 text-xs text-white/40">
              Sem spam. Cancelas quando quiseres.
            </p>
          </div>
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
