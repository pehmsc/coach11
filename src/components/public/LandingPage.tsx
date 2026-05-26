"use client";

import { useState, useEffect } from "react";
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
  Menu,
  X,
} from "lucide-react";

// ── Animated counter hook ──
function useCounter(target: number, duration = 2000, trigger = true) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, trigger]);
  return count;
}

// ── Feature Card ──
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
      className={`group relative rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 ${
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
      <span className="text-center text-white/30 line-through">{old}</span>
      <span className="text-center font-semibold text-emerald-400">{better}</span>
    </div>
  );
}

// ── Main Page ──
export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!email) return;

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setSubmitted(true);
        setEmail("");
      }
    } catch {
      // Falha silenciosa — não bloquear UX por erro de rede
    }
  };

  const stats = {
    seconds: useCounter(20, 1500),
    touches: useCounter(2, 1000),
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white antialiased">
      {/* ═══ NAV ═══ */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            aria-label="Coach11 — voltar ao topo"
          >
            <Image
              src="/icons/icon-192.png"
              alt="Coach11"
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg"
              priority
            />
            <span className="text-lg font-bold tracking-tight">
              Coach<span className="text-emerald-400">11</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-white/60 transition hover:text-white">
              Funcionalidades
            </a>
            <a href="#how" className="text-sm text-white/60 transition hover:text-white">
              Como Funciona
            </a>
            <a href="#comparison" className="text-sm text-white/60 transition hover:text-white">
              Comparar
            </a>
            <a
              href="/login"
              className="text-sm text-white/60 transition hover:text-white"
            >
              Entrar
            </a>
            <a
              href="#cta"
              className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
            >
              Comecar
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden text-white/60"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            {mobileMenu ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenu && (
          <div className="border-t border-white/5 bg-slate-950 px-6 py-4 md:hidden">
            <div className="flex flex-col gap-4">
              <a href="#features" className="text-sm text-white/60" onClick={() => setMobileMenu(false)}>
                Funcionalidades
              </a>
              <a href="#how" className="text-sm text-white/60" onClick={() => setMobileMenu(false)}>
                Como Funciona
              </a>
              <a href="#comparison" className="text-sm text-white/60" onClick={() => setMobileMenu(false)}>
                Comparar
              </a>
              <a
                href="/login"
                className="text-sm text-white/60"
                onClick={() => setMobileMenu(false)}
              >
                Entrar
              </a>
              <a
                href="#cta"
                className="rounded-lg bg-emerald-500 px-5 py-2.5 text-center text-sm font-semibold text-white"
                onClick={() => setMobileMenu(false)}
              >
                Comecar
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden pt-32 pb-20 md:pt-44 md:pb-32">
        {/* Background gradient */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-emerald-500/8 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-[300px] w-[400px] rounded-full bg-emerald-600/5 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-400">
              <Zap className="h-3.5 w-3.5" />
              <span>Beta aberta para clubes de formacao</span>
            </div>

            {/* Headline */}
            <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight md:text-6xl md:leading-none">
              O treinador regista.
              <br />
              <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                O sistema faz o resto.
              </span>
            </h1>

            {/* Subhead */}
            <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-white/50 md:text-xl">
              Plataforma de gestao desportiva para futebol de formacao.
              Regista no campo com o telemovel. Consulta tudo no dashboard
              sem inserir dados duas vezes.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <a
                href="#cta"
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 text-base font-semibold text-white transition hover:bg-emerald-400 sm:w-auto"
              >
                Quero experimentar
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </a>
              <a
                href="#how"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-8 py-4 text-base font-medium text-white/70 transition hover:border-white/20 hover:text-white sm:w-auto"
              >
                Como funciona
              </a>
            </div>

            {/* Login link */}
            <p className="mt-6 text-sm text-white/30">
              Já tens conta?{" "}
              <a href="/login" className="text-white/60 underline underline-offset-2 hover:text-white transition">
                Entrar
              </a>
            </p>

            {/* Stats bar */}
            <div className="mx-auto mt-16 grid max-w-lg grid-cols-3 gap-8 border-t border-white/5 pt-8">
              <div>
                <div className="text-2xl font-bold text-emerald-400 md:text-3xl">
                  &lt;{stats.seconds}s
                </div>
                <div className="mt-1 text-xs text-white/40">para marcar presencas</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white md:text-3xl">{stats.touches}</div>
                <div className="mt-1 text-xs text-white/40">toques por evento</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white md:text-3xl">0€</div>
                <div className="mt-1 text-xs text-white/40">para comecar</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PAIN SECTION ═══ */}
      <section className="border-t border-white/5 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-2xl font-bold md:text-3xl">
              O problema que todos os treinadores conhecem
            </h2>
            <p className="text-white/50">
              131 treinos agendados. Apenas 1 com presencas registadas.
              Nao porque o treinador nao quer — porque a ferramenta nao deixa.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-6">
              <div className="mb-3 text-2xl font-bold text-red-400/80">Desktop</div>
              <p className="text-sm text-white/40">
                Plataformas pensadas para o escritorio. No campo, com frio e luvas,
                ninguem abre um laptop para marcar presencas.
              </p>
            </div>
            <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-6">
              <div className="mb-3 text-2xl font-bold text-red-400/80">Manual</div>
              <p className="text-sm text-white/40">
                Dados inseridos duas vezes. O treinador regista e depois
                o admin volta a preencher. Duplicacao constante.
              </p>
            </div>
            <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-6">
              <div className="mb-3 text-2xl font-bold text-red-400/80">120×</div>
              <p className="text-sm text-white/40">
                120 treinos por epoca criados um a um. Sem duplicacao semanal.
                Sem auto-incremento. Trabalho repetitivo que ninguem quer fazer.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-4 text-2xl font-bold md:text-3xl">
              Tudo o que precisas. Nada do que nao precisas.
            </h2>
            <p className="text-white/50">
              Desenhado por treinadores, para treinadores. Cada funcionalidade
              foi pensada para o contexto real: campo, banco, viagem.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={ClipboardCheck}
              title="Presencas em 20 segundos"
              description="Lista de jogadores com foto e toggle grande. Guardar fixo no fundo. Feito antes do apito."
              accent
            />
            <FeatureCard
              icon={Timer}
              title="Eventos live em jogo"
              description="Golos, cartoes, substituicoes — 2 toques com minuto auto-preenchido. Regista durante o jogo, nao depois."
              accent
            />
            <FeatureCard
              icon={Copy}
              title="Duplicar semana de treinos"
              description="Cria a semana 1 (UT01-UT03). Duplica para o resto da epoca. 120 sessoes em segundos, nao em horas."
              accent
            />
            <FeatureCard
              icon={BarChart3}
              title="Insights no telemovel"
              description="Minutos jogados, golos, presencas, alertas de suspensao. Consulta rapida no banco antes de decidir uma substituicao."
            />
            <FeatureCard
              icon={Bell}
              title="Notificacoes push"
              description="Convocatorias, treinos, alteracoes — tudo chega ao atleta e ao pai sem depender do WhatsApp."
            />
            <FeatureCard
              icon={FileText}
              title="PDF automatico"
              description="Relatorio de jogo e planeamento de treino gerados automaticamente com logo do clube. Partilha com 1 toque."
            />
            <FeatureCard
              icon={Shield}
              title="Dossier de treino FPF"
              description="UTs estruturadas, biblioteca de exercicios, avaliacoes, objectivos — tudo o que a certificacao pede, pronto para a visita tecnica."
            />
            <FeatureCard
              icon={Users}
              title="Multi-equipa, multi-escalao"
              description="Coordenador ve tudo. Treinador ve a sua equipa. Adjunto marca presencas. Cada um ve o que precisa."
            />
            <FeatureCard
              icon={Smartphone}
              title="PWA instalavel"
              description="Instala no telemovel como uma app nativa. Sem App Store, sem Play Store. Abre e usa."
            />
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how" className="border-t border-white/5 bg-slate-900/30 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-4 text-2xl font-bold md:text-3xl">
              Campo → Sistema → Dashboard
            </h2>
            <p className="text-white/50">
              Os dados nascem no campo e fluem automaticamente.
              Ninguem insere nada duas vezes.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {/* Step 1 */}
            <div className="relative">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-xl font-bold text-emerald-400">
                1
              </div>
              <h3 className="mb-2 text-lg font-semibold">O treinador regista no campo</h3>
              <p className="text-sm text-white/50">
                Presencas, eventos de jogo, avaliacoes pos-jogo, notas de treino.
                Tudo no telemovel, rapido, com uma mao.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                  Mobile-first
                </span>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                  Offline-ready
                </span>
              </div>
              {/* Connector arrow (hidden on mobile) */}
              <div className="hidden md:block absolute top-6 right-0 translate-x-1/2">
                <ChevronRight className="h-6 w-6 text-white/10" />
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-xl font-bold text-white/70">
                2
              </div>
              <h3 className="mb-2 text-lg font-semibold">O sistema processa</h3>
              <p className="text-sm text-white/50">
                Agrega estatisticas, calcula minutos, gera rankings,
                detecta alertas (3 amarelos, faltas consecutivas),
                prepara relatorios.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/40">
                  Automatico
                </span>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/40">
                  Tempo real
                </span>
              </div>
              <div className="hidden md:block absolute top-6 right-0 translate-x-1/2">
                <ChevronRight className="h-6 w-6 text-white/10" />
              </div>
            </div>

            {/* Step 3 */}
            <div>
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-xl font-bold text-white/70">
                3
              </div>
              <h3 className="mb-2 text-lg font-semibold">O coordenador consulta</h3>
              <p className="text-sm text-white/50">
                Dashboard com insights, dossier de treino pronto,
                relatorios exportaveis. Sem inserir um unico dado manualmente.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/40">
                  Dashboard
                </span>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/40">
                  Export PDF/Excel
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ COMPARISON ═══ */}
      <section id="comparison" className="py-20 md:py-28">
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-2xl font-bold md:text-3xl">
              A diferenca no dia-a-dia
            </h2>
            <p className="text-white/50">
              Nao se trata de mais funcionalidades. Trata-se de melhor execucao
              nos momentos que importam.
            </p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 md:p-8">
            {/* Header */}
            <div className="grid grid-cols-3 gap-4 border-b border-white/10 pb-4 text-sm font-semibold">
              <span className="text-white/40">Tarefa</span>
              <span className="text-center text-white/30">Antes</span>
              <span className="text-center text-emerald-400">Coach11</span>
            </div>

            <ComparisonRow
              feature="Marcar presencas"
              old="5+ minutos, laptop"
              better="< 20 segundos, telemovel"
            />
            <ComparisonRow
              feature="Evento em jogo"
              old="Anotar papel, passar depois"
              better="2 toques, tempo real"
            />
            <ComparisonRow
              feature="Criar 120 treinos"
              old="120 operacoes manuais"
              better="4 cliques (duplicar semana)"
            />
            <ComparisonRow
              feature="Ver minutos de jogador"
              old="Procurar em tabelas desktop"
              better="2 toques no banco"
            />
            <ComparisonRow
              feature="Enviar convocatoria"
              old="WhatsApp manual"
              better="Push notification automatica"
            />
            <ComparisonRow
              feature="Relatorio de jogo"
              old="Preencher formulario"
              better="PDF gerado automaticamente"
            />
            <ComparisonRow
              feature="Dossier para FPF"
              old="Compilar no final da epoca"
              better="Sempre actualizado, exportavel"
            />
          </div>
        </div>
      </section>

      {/* ═══ FOR WHO ═══ */}
      <section className="border-t border-white/5 bg-slate-900/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mb-4 text-2xl font-bold md:text-3xl">Para quem e o Coach11?</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
              <div className="mb-4 inline-flex rounded-xl bg-emerald-500/20 p-3">
                <Trophy className="h-6 w-6 text-emerald-400" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Clubes certificados FPF</h3>
              <p className="mb-4 text-sm text-white/50">
                Dossier de treino completo, UTs estruturadas, biblioteca de exercicios,
                avaliacoes — tudo o que a certificacao exige, gerado automaticamente
                a partir do trabalho no campo.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm text-white/60">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  Criterio 4 da FPF coberto
                </li>
                <li className="flex items-center gap-2 text-sm text-white/60">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  Pronto para visita tecnica
                </li>
                <li className="flex items-center gap-2 text-sm text-white/60">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  Export PDF com logo do clube
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
              <div className="mb-4 inline-flex rounded-xl bg-white/10 p-3">
                <Users className="h-6 w-6 text-white/70" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Escolas de futebol e clubes pequenos</h3>
              <p className="mb-4 text-sm text-white/50">
                Comecar a usar em minutos. Sem configuracao complexa, sem obrigacoes
                administrativas. Foco no que importa: treinar e gerir a equipa.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm text-white/60">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  Gratis para comecar
                </li>
                <li className="flex items-center gap-2 text-sm text-white/60">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  Mobile-first, instala como app
                </li>
                <li className="flex items-center gap-2 text-sm text-white/60">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  Presencas, jogos e convocatorias
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section id="cta" className="relative py-20 md:py-28">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-emerald-500/8 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-xl px-6 text-center">
          <h2 className="mb-4 text-2xl font-bold md:text-3xl">
            Pronto para deixar o papel no banco?
          </h2>
          <p className="mb-8 text-white/50">
            Deixa o teu email e entramos em contacto.
            Acesso gratuito durante a fase beta.
          </p>

          {submitted ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-6">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
              <p className="font-semibold text-emerald-400">Email registado com sucesso!</p>
              <p className="mt-1 text-sm text-white/50">
                Entramos em contacto em breve.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                placeholder="O teu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-white placeholder-white/30 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
              />
              <button
                type="submit"
                className="group flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 font-semibold text-white transition hover:bg-emerald-400"
              >
                Quero acesso
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </button>
            </form>
          )}

          <p className="mt-4 text-xs text-white/30">
            Sem spam. Sem compromisso. Cancelar a qualquer momento.
          </p>
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
          <div className="flex items-center gap-4 text-xs text-white/40">
            <Link href="/privacidade" className="transition hover:text-white/70">
              Privacidade
            </Link>
            <Link href="/faqs" className="transition hover:text-white/70">
              FAQs
            </Link>
          </div>
          <p className="text-xs text-white/30">
            &copy; 2026 Coach11. Feito em Lisboa para treinadores de formacao.
          </p>
        </div>
      </footer>
    </div>
  );
}
