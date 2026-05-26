import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout } from "@/components/public/LegalPageLayout";
import { FaqAccordion, type FaqSection } from "@/components/public/FaqAccordion";

export const metadata: Metadata = {
  title: "Perguntas Frequentes — Coach11",
  description:
    "Respostas às perguntas mais comuns sobre o Coach11: preços, planos, segurança, suporte, instalação e mais.",
};

const SECTIONS: FaqSection[] = [
  {
    title: "Sobre o Coach11",
    items: [
      {
        question: "O que é o Coach11?",
        answer: (
          <p>
            É uma plataforma de gestão para clubes de futebol de formação e
            treinadores individuais. Convocatórias, treinos, jogos, presenças,
            estatísticas, comunicação com encarregados — tudo num só sítio,
            optimizado para uso em campo (smartphone primeiro).
          </p>
        ),
      },
      {
        question: "Para quem é o Coach11?",
        answer: (
          <ul>
            <li>
              <strong>Treinadores individuais</strong>: gerir uma equipa de
              forma simples, sem hierarquia.
            </li>
            <li>
              <strong>Clubes pequenos</strong> (até ~30 staff): coordenador,
              treinadores, vários escalões.
            </li>
            <li>
              <strong>Clubes grandes</strong>: dezenas a centenas de staff,
              hierarquia completa, base de dados isolada.
            </li>
          </ul>
        ),
      },
      {
        question: "Em que se distingue de outras opções?",
        answer: (
          <>
            <p>
              A diferença chave é o modelo <strong>field-first</strong>: o
              treinador regista no campo (presença, evento de jogo, observação)
              e o sistema constrói automaticamente todo o trabalho
              administrativo — relatórios, estatísticas, alertas. Soluções
              tradicionais obrigam o coordenador a duplicar a informação
              manualmente no backoffice depois do treino, o que consome horas
              semanais. No Coach11, esse trabalho desaparece.
            </p>
            <p>
              Outras diferenças: interface moderna optimizada para telemóvel,
              duplicação automática de semanas de treino (deixa de criar 120
              sessões manualmente por época), partilha pública opcional com
              encarregados via link, sem instalação (PWA — funciona como app no
              telemóvel sem passar pela App Store).
            </p>
          </>
        ),
      },
    ],
  },
  {
    title: "Preços e planos",
    items: [
      {
        question: "Quanto custa?",
        answer: (
          <>
            <p>Há três planos:</p>
            <ul>
              <li>
                <strong>Individual</strong> (treinador, 1 equipa): subscrição
                mensal acessível, auto-serviço.
              </li>
              <li>
                <strong>Clube · Standard</strong> (até ~30 staff): plano
                sales-led, adaptado ao tamanho do clube.
              </li>
              <li>
                <strong>Clube · Pro</strong> (clubes grandes): base de dados
                dedicada, domínio próprio, proposta sob consulta.
              </li>
            </ul>
            <p>
              Detalhes em <Link href="/precos">/precos</Link> ou via pedido em{" "}
              <Link href="/contacto">/contacto</Link>.
            </p>
          </>
        ),
      },
      {
        question: "Há período experimental?",
        answer: (
          <p>
            Sim. Treinadores individuais podem testar antes de subscrever.
            Clubes têm onboarding com período de validação acordado caso a
            caso.
          </p>
        ),
      },
      {
        question: "Posso mudar de plano?",
        answer: (
          <p>
            Sim. Treinador individual que cresce e precisa de mais utilizadores
            pode subir para Clube Standard. Clube Standard que precisa de
            isolamento total dos dados pode subir para Pro. As mudanças
            preservam todo o histórico.
          </p>
        ),
      },
    ],
  },
  {
    title: "Acesso e instalação",
    items: [
      {
        question: "Preciso de instalar alguma coisa?",
        answer: (
          <p>
            Não. O Coach11 é uma{" "}
            <strong>aplicação web progressiva (PWA)</strong>: abres no browser,
            podes &quot;adicionar ao ecrã inicial&quot; do telemóvel e funciona
            como app nativa. Sem App Store, sem actualizações manuais, sem
            espaço ocupado.
          </p>
        ),
      },
      {
        question: "Funciona em iPhone e Android?",
        answer: (
          <p>
            Sim, em ambos. Também funciona em desktop (Chrome, Safari, Firefox,
            Edge).
          </p>
        ),
      },
      {
        question: "Funciona sem internet?",
        answer: (
          <p>
            Parcialmente. Registos básicos de presença e eventos durante o jogo
            ficam guardados localmente e sincronizam quando há rede. Operações
            que exigem servidor (criar nova convocatória, ver estatísticas
            históricas) precisam de ligação.
          </p>
        ),
      },
      {
        question: "Quanto tempo demora a configurar?",
        answer: (
          <p>
            Treinador individual: minutos. Clube pequeno: 1 hora típica
            (incluir escalão, convocar coordenador, registar atletas). Clube
            grande: processo guiado com a nossa equipa, normalmente em 1-2
            dias.
          </p>
        ),
      },
    ],
  },
  {
    title: "Migração e dados",
    items: [
      {
        question: "Posso importar dados de uma plataforma anterior?",
        answer: (
          <p>
            Sim. Para clubes em onboarding sales-led, ajudamos a migrar lista
            de atletas, escalões e calendário a partir de ficheiros Excel/CSV
            ou exportações da plataforma anterior. Para treinador individual
            com poucos dados, normalmente o registo manual é mais rápido.
          </p>
        ),
      },
      {
        question: "Posso exportar os meus dados?",
        answer: (
          <p>
            Sim. Tens direito de portabilidade ao abrigo do RGPD — pedido em{" "}
            <a href="mailto:privacidade@coach11.app">privacidade@coach11.app</a>{" "}
            e enviamos exportação em JSON/CSV no prazo legal.
          </p>
        ),
      },
      {
        question: "Se desistir do serviço, o que acontece aos dados?",
        answer: (
          <p>
            São apagados no prazo de 30 dias após a denúncia do contrato (ou
            mais cedo, mediante pedido). Dados de facturação ficam retidos
            durante 10 anos por obrigação legal fiscal.
          </p>
        ),
      },
    ],
  },
  {
    title: "Segurança e privacidade",
    items: [
      {
        question: "Os dados estão seguros?",
        answer: (
          <p>
            Sim. Aplicamos encriptação em trânsito (TLS), isolamento por{" "}
            <em>row-level security</em> (RLS — cada utilizador só vê o que
            devia), autenticação Supabase, e auditoria das acções sensíveis.
            Servidores na União Europeia.
          </p>
        ),
      },
      {
        question: "Quem vê os dados do meu clube?",
        answer: (
          <p>
            Apenas os utilizadores que tu autorizas. Coordenador vê tudo;
            treinador vê só o seu escalão; staff vê só o que foi atribuído.
            Nenhum outro cliente do Coach11 vê os teus dados.
          </p>
        ),
      },
      {
        question: "E os dados dos atletas menores?",
        answer: (
          <p>
            O clube é responsável por obter consentimento dos encarregados de
            educação. O Coach11 fornece ferramentas (formulários de
            registo/consentimento, partilha pública opcional com encarregados)
            mas o clube é o controlador desses dados.
          </p>
        ),
      },
      {
        question: "É compatível com o RGPD?",
        answer: (
          <p>
            Sim. Política completa em <Link href="/privacidade">/privacidade</Link>.
          </p>
        ),
      },
    ],
  },
  {
    title: "Suporte",
    items: [
      {
        question: "Como funciona o suporte?",
        answer: (
          <p>
            Individual: email com resposta em 48h úteis. Clube Standard: email
            prioritário, 24h úteis. Clube Pro: canal dedicado, resposta no
            mesmo dia útil.
          </p>
        ),
      },
      {
        question: "Há documentação ou tutoriais?",
        answer: (
          <p>
            Sim. Páginas de ajuda integradas em cada secção da app. Para
            clubes, sessão de onboarding ao vivo com a nossa equipa.
          </p>
        ),
      },
      {
        question: "Como sugiro uma funcionalidade?",
        answer: (
          <p>
            Por email, ou directamente do produto (botão de feedback no menu).
            Lemos tudo e respondemos.
          </p>
        ),
      },
    ],
  },
  {
    title: "Outras perguntas",
    items: [
      {
        question: "Posso ter mais que um clube na mesma conta?",
        answer: (
          <p>
            Treinador individual: hoje, uma equipa por conta. Em breve será
            possível ter várias equipas (mesmo de clubes diferentes) na mesma
            conta. Para coordenadores de clube, várias contas para vários
            clubes — uma conta por clube.
          </p>
        ),
      },
      {
        question: "Está disponível noutras línguas?",
        answer: (
          <p>
            Por agora, apenas português (PT). Tradução para inglês e espanhol
            está no roteiro.
          </p>
        ),
      },
      {
        question: "Como vos contacto?",
        answer: (
          <p>
            Pelo formulário em <Link href="/contacto">/contacto</Link>, ou por
            email: <a href="mailto:ola@coach11.app">ola@coach11.app</a>. Para
            assuntos de privacidade:{" "}
            <a href="mailto:privacidade@coach11.app">privacidade@coach11.app</a>.
          </p>
        ),
      },
    ],
  },
];

export default function FAQsPage() {
  return (
    <LegalPageLayout
      title="Perguntas Frequentes"
      intro="Tudo o que precisas de saber antes de começar. Não encontras a resposta? Contacta-nos."
      lastUpdated="26 de Maio de 2026"
    >
      <FaqAccordion sections={SECTIONS} />
    </LegalPageLayout>
  );
}
