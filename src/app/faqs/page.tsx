import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/public/LegalPageLayout";

export const metadata: Metadata = {
  title: "Perguntas Frequentes — Coach11",
  description:
    "Respostas às perguntas mais comuns sobre o Coach11: preços, planos, segurança, suporte, instalação e mais.",
};

export default function FAQsPage() {
  return (
    <LegalPageLayout
      title="Perguntas Frequentes"
      intro="Tudo o que precisas de saber antes de começar. Não encontras a resposta? Contacta-nos."
      lastUpdated="26 de Maio de 2026"
    >
      <section>
        <h2>Sobre o Coach11</h2>

        <h3>O que é o Coach11?</h3>
        <p>
          É uma plataforma de gestão para clubes de futebol de formação e
          treinadores individuais. Convocatórias, treinos, jogos, presenças,
          estatísticas, comunicação com encarregados — tudo num só sítio,
          optimizado para uso em campo (smartphone primeiro).
        </p>

        <h3>Para quem é o Coach11?</h3>
        <ul>
          <li>
            <strong>Treinadores individuais</strong>: gerir uma equipa de forma
            simples, sem hierarquia
          </li>
          <li>
            <strong>Clubes pequenos</strong> (até ~30 staff): coordenador,
            treinadores, vários escalões
          </li>
          <li>
            <strong>Clubes grandes</strong>: dezenas a centenas de staff,
            hierarquia completa, base de dados isolada
          </li>
        </ul>

        <h3>Em que se distingue de outras opções?</h3>
        <p>
          A diferença chave é o modelo <strong>field-first</strong>: o
          treinador regista no campo (presença, evento de jogo, observação) e
          o sistema constrói automaticamente todo o trabalho administrativo —
          relatórios, estatísticas, alertas. Soluções tradicionais obrigam o
          coordenador a duplicar a informação manualmente no backoffice depois
          do treino, o que consome horas semanais. No Coach11, esse trabalho
          desaparece.
        </p>
        <p>
          Outras diferenças: interface moderna optimizada para telemóvel,
          duplicação automática de semanas de treino (deixa de criar 120
          sessões manualmente por época), partilha pública opcional com
          encarregados via link, sem instalação (PWA — funciona como app no
          telemóvel sem passar pela App Store).
        </p>
      </section>

      <section>
        <h2>Preços e planos</h2>

        <h3>Quanto custa?</h3>
        <p>
          Há três planos:
        </p>
        <ul>
          <li>
            <strong>Individual</strong> (treinador, 1 equipa): subscrição
            mensal acessível, auto-serviço
          </li>
          <li>
            <strong>Clube · Standard</strong> (até ~30 staff): plano sales-led,
            adaptado ao tamanho do clube
          </li>
          <li>
            <strong>Clube · Pro</strong> (clubes grandes): base de dados
            dedicada, domínio próprio, proposta sob consulta
          </li>
        </ul>
        <p>
          Os valores definitivos estão na página de preços ou via pedido de
          contacto.
        </p>

        <h3>Há período experimental?</h3>
        <p>
          Sim. Treinadores individuais podem testar antes de subscrever.
          Clubes têm onboarding com período de validação acordado caso a caso.
        </p>

        <h3>Posso mudar de plano?</h3>
        <p>
          Sim. Treinador individual que cresce e precisa de mais utilizadores
          pode subir para Clube Standard. Clube Standard que precisa de
          isolamento total dos dados pode subir para Pro. As mudanças
          preservam todo o histórico.
        </p>
      </section>

      <section>
        <h2>Acesso e instalação</h2>

        <h3>Preciso de instalar alguma coisa?</h3>
        <p>
          Não. O Coach11 é uma <strong>aplicação web progressiva (PWA)</strong>:
          abres no browser, podes &quot;adicionar ao ecrã inicial&quot; do
          telemóvel e funciona como app nativa. Sem App Store, sem
          actualizações manuais, sem espaço ocupado.
        </p>

        <h3>Funciona em iPhone e Android?</h3>
        <p>
          Sim, em ambos. Também funciona em desktop (Chrome, Safari, Firefox,
          Edge).
        </p>

        <h3>Funciona sem internet?</h3>
        <p>
          Parcialmente. Registos básicos de presença e eventos durante o jogo
          ficam guardados localmente e sincronizam quando há rede. Operações
          que exigem servidor (criar nova convocatória, ver estatísticas
          históricas) precisam de ligação.
        </p>

        <h3>Quanto tempo demora a configurar?</h3>
        <p>
          Treinador individual: minutos. Clube pequeno: 1 hora típica (incluir
          escalão, convocar coordenador, registar atletas). Clube grande:
          processo guiado com a nossa equipa, normalmente em 1-2 dias.
        </p>
      </section>

      <section>
        <h2>Migração e dados</h2>

        <h3>Posso importar dados de uma plataforma anterior?</h3>
        <p>
          Sim. Para clubes em onboarding sales-led, ajudamos a migrar lista de
          atletas, escalões e calendário a partir de ficheiros Excel/CSV ou
          exportações da plataforma anterior. Para treinador individual com
          poucos dados, normalmente o registo manual é mais rápido.
        </p>

        <h3>Posso exportar os meus dados?</h3>
        <p>
          Sim. Tens direito de portabilidade ao abrigo do RGPD — pedido em{" "}
          <a href="mailto:privacidade@coach11.app">privacidade@coach11.app</a>
          {" "}
          e enviamos exportação em JSON/CSV no prazo legal.
        </p>

        <h3>Se desistir do serviço, o que acontece aos dados?</h3>
        <p>
          São apagados no prazo de 30 dias após a denúncia do contrato (ou
          mais cedo, mediante pedido). Dados de faturação ficam retidos
          durante 10 anos por obrigação legal fiscal.
        </p>
      </section>

      <section>
        <h2>Segurança e privacidade</h2>

        <h3>Os dados estão seguros?</h3>
        <p>
          Sim. Aplicamos encriptação em trânsito (TLS), isolamento por{" "}
          <em>row-level security</em> (RLS — cada utilizador só vê o que
          devia), autenticação Supabase, e auditoria das acções sensíveis.
          Servidores na União Europeia.
        </p>

        <h3>Quem vê os dados do meu clube?</h3>
        <p>
          Apenas os utilizadores que tu autorizas. Coordenador vê tudo;
          treinador vê só o seu escalão; staff vê só o que foi atribuído.
          Nenhum outro cliente do Coach11 vê os teus dados.
        </p>

        <h3>E os dados dos atletas menores?</h3>
        <p>
          O clube é responsável por obter consentimento dos encarregados de
          educação. O Coach11 fornece ferramentas (formulários de
          registo/consentimento, partilha pública opcional com encarregados)
          mas o clube é o controlador desses dados.
        </p>

        <h3>É compatível com o RGPD?</h3>
        <p>
          Sim. Política completa em{" "}
          <a href="/privacidade">/privacidade</a>.
        </p>
      </section>

      <section>
        <h2>Suporte</h2>

        <h3>Como funciona o suporte?</h3>
        <p>
          Individual: email com resposta em 48h úteis. Clube Standard: email
          prioritário, 24h úteis. Clube Pro: canal dedicado, resposta no
          mesmo dia útil.
        </p>

        <h3>Há documentação ou tutoriais?</h3>
        <p>
          Sim. Páginas de ajuda integradas em cada secção da app. Para clubes,
          sessão de onboarding ao vivo com a nossa equipa.
        </p>

        <h3>Como sugiro uma funcionalidade?</h3>
        <p>
          Por email, ou directamente do produto (botão de feedback no menu).
          Lemos tudo e respondemos.
        </p>
      </section>

      <section>
        <h2>Outras perguntas</h2>

        <h3>Posso ter mais que um clube na mesma conta?</h3>
        <p>
          Treinador individual: hoje, uma equipa por conta. Em breve será
          possível ter várias equipas (mesmo de clubes diferentes) na mesma
          conta. Para coordenadores de clube, várias contas para vários
          clubes — uma conta por clube.
        </p>

        <h3>Está disponível noutras línguas?</h3>
        <p>
          Por agora, apenas português (PT). Tradução para inglês e espanhol
          está no roteiro.
        </p>

        <h3>Como vos contacto?</h3>
        <p>
          Email: <a href="mailto:ola@coach11.app">ola@coach11.app</a>. Para
          assuntos de privacidade:{" "}
          <a href="mailto:privacidade@coach11.app">privacidade@coach11.app</a>.
        </p>
      </section>
    </LegalPageLayout>
  );
}
