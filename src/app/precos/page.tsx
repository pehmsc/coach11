import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout, LegalProse } from "@/components/public/LegalPageLayout";
import { PlanCard, PLANS } from "@/components/public/PlanCard";

export const metadata: Metadata = {
  title: "Preços e Planos — Coach11",
  description:
    "Treinador individual ou clube? Coach11 tem três planos — Individual, Clube Standard e Clube Pro. Sem cartão para começar a lista de espera.",
};

export default function PrecosPage() {
  return (
    <LegalPageLayout
      title="Preços e Planos"
      intro="Um produto, três entradas. Auto-serviço para treinadores individuais; sales-led com onboarding para clubes; isolamento total para clubes grandes."
      prose={false}
      wide
    >
      <section>
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} {...plan} />
          ))}
        </div>
      </section>

      <LegalProse>
        <section>
          <h2>O que está incluído em todos os planos</h2>
          <ul>
            <li>Plantel, calendário, convocatórias, treinos e jogos</li>
            <li>Presenças em ~20 segundos e eventos live durante o jogo</li>
            <li>
              Duplicação semanal de treinos (uma semana modelo → época
              inteira)
            </li>
            <li>PDFs automáticos (relatório de jogo, planeamento de treino)</li>
            <li>PWA instalável em iOS, Android e desktop</li>
            <li>
              Encriptação em trânsito, isolamento por RLS, servidores na UE
            </li>
            <li>
              Cumprimento RGPD — política em{" "}
              <Link href="/privacidade">/privacidade</Link>
            </li>
          </ul>
        </section>

        <section>
          <h2>Como passamos de um plano para outro</h2>
          <p>
            Treinador individual que cresce e precisa de mais utilizadores pode
            subir para Clube Standard sem perder histórico. Clube Standard que
            precisa de base de dados isolada e domínio próprio pode subir para
            Pro, com migração assistida pela nossa equipa.
          </p>
        </section>

        <section>
          <h2>FAQ rápido</h2>

          <h3>Há período experimental?</h3>
          <p>
            Sim. Treinadores individuais podem testar antes de subscrever.
            Clubes têm onboarding com período de validação acordado caso a
            caso.
          </p>

          <h3>Posso cancelar quando quiser?</h3>
          <p>
            Sim. Sem fidelizações. Treinador individual em auto-serviço
            cancela a partir das configurações da conta. Clubes seguem o que
            ficou acordado no onboarding.
          </p>

          <h3>Como funciona a facturação?</h3>
          <p>
            Individual: subscrição mensal recorrente, factura electrónica
            emitida automaticamente. Clube: factura mensal ou anual conforme
            proposta — Coach11 emite recibo verde / factura conforme estatuto
            fiscal.
          </p>

          <p>
            Mais perguntas? Vê o nosso{" "}
            <Link href="/faqs">FAQ completo</Link> ou contacta-nos por{" "}
            <Link href="/contacto">/contacto</Link>.
          </p>
        </section>
      </LegalProse>
    </LegalPageLayout>
  );
}
