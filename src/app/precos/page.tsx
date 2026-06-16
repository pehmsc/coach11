import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteLayout, LegalProse } from "@/components/public/PublicSiteLayout";
import { PlanCtaButton } from "@/components/public/PlanCtaButton";

export const metadata: Metadata = {
  title: "Preços — Coach11",
  description:
    "Coach11 para treinadores de formação: €7,99/mês, IVA incluído, 7 dias de trial. Clubes e Entidades Formadoras: fala connosco.",
};

const TREINADOR_FEATURES = [
  "1 equipa, sem hierarquia",
  "Convocatórias, treinos e jogos",
  "Presenças e eventos ao vivo",
  "Estatísticas, insights e relatórios automáticos",
  "Calendário e convocatórias públicos por link",
  "App instalável no telemóvel (PWA)",
  "Suporte por email (48h úteis)",
];

export default function PrecosPage() {
  return (
    <PublicSiteLayout
      title="Preços"
      intro="Um plano, pensado para o treinador de formação. Clubes com vários escalões e Entidades Formadoras falam connosco."
      prose={false}
      wide
    >
      {/* Plano Treinador — em foco */}
      <section>
        <div className="mx-auto max-w-md rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-8 text-center shadow-lg shadow-emerald-500/10">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-400">
            Treinador
          </div>
          <div className="mt-3 text-5xl font-extrabold text-white">
            €7,99
            <span className="text-lg font-semibold text-white/50"> /mês</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-emerald-300">
            IVA incluído · 7 dias trial
          </p>

          <ul className="mx-auto mt-7 mb-8 space-y-3 text-left">
            {TREINADOR_FEATURES.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2.5 text-sm text-white/80"
              >
                <span className="mt-0.5 shrink-0 font-bold text-emerald-400">
                  ✓
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <PlanCtaButton
            href="/billing/start"
            label="Começar trial · 7 dias"
            planIntent="individual"
            className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
          />
          <p className="mt-4 text-xs text-white/40">
            Cancela quando quiseres · sem fidelização
          </p>
        </div>
      </section>

      {/* Bloco Clube / Entidade Formadora — discreto */}
      <section className="mx-auto mt-10 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <h2 className="text-lg font-bold text-white">
          És um clube ou Entidade Formadora?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          Ao registar no campo, o Coach11 vai construindo as evidências
          operacionais do{" "}
          <strong className="text-white">
            Critério 4.2 (Dossier de Treino)
          </strong>{" "}
          da certificação de Entidade Formadora da FPF — presenças, unidades de
          treino, microciclo e ficha de atleta — sem dupla introdução de dados. Em
          vez de recuperar tudo no fim da época, como acontece com as soluções de
          admin tradicionais, chegas à janela de autoavaliação (Out/Nov) com o
          material já reunido.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-white/40">
          A certificação é avaliada e atribuída pela FPF. O Coach11 ajuda-te a
          reunir e manter as evidências do dia a dia — não substitui o processo da
          Federação.
        </p>
        <Link
          href="/contacto?persona=club"
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
        >
          Falar connosco
          <span aria-hidden>→</span>
        </Link>
      </section>

      <LegalProse>
        <section>
          <h2>O que está incluído</h2>
          <ul>
            <li>Plantel, calendário, convocatórias, treinos e jogos</li>
            <li>Presenças em ~20 segundos e eventos live durante o jogo</li>
            <li>
              Duplicação semanal de treinos (uma semana modelo → época inteira)
            </li>
            <li>PDFs automáticos (relatório de jogo, planeamento de treino)</li>
            <li>PWA instalável em iOS, Android e desktop</li>
            <li>
              Encriptação em trânsito, isolamento por RLS, servidores na UE
            </li>
            <li>
              Cumprimento RGPD — ver{" "}
              <Link href="/privacidade">Política de Privacidade</Link>
            </li>
          </ul>
        </section>

        <section>
          <h2>Período experimental e cancelamento</h2>
          <p>
            São 7 dias de trial para experimentares tudo. Depois, um preço fixo
            de €7,99/mês (IVA incluído). Sem fidelização — cancelas quando
            quiseres a partir das configurações da conta.
          </p>
        </section>

        <section>
          <h2>Facturação</h2>
          <p>
            Subscrição mensal recorrente, com factura electrónica emitida
            automaticamente. Clubes em onboarding sales-led seguem a facturação
            acordada na proposta.
          </p>

          <p>
            Mais perguntas? Vê o nosso{" "}
            <Link href="/faqs">FAQ completo</Link> ou contacta-nos pelo{" "}
            <Link href="/contacto">formulário de contacto</Link>.
          </p>
        </section>
      </LegalProse>
    </PublicSiteLayout>
  );
}
