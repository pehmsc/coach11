import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/public/LegalPageLayout";

export const metadata: Metadata = {
  title: "Política de Privacidade — Coach11",
  description:
    "Como o Coach11 trata os dados pessoais de treinadores, coordenadores, staff e atletas. Compatível com o RGPD.",
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Política de Privacidade"
      intro="Esta página descreve como o Coach11 recolhe, usa, partilha e protege dados pessoais. Aplica-se a treinadores individuais, clubes, coordenadores, staff e atletas registados na plataforma."
      lastUpdated="14 de Junho de 2026"
    >
      <section>
        <h2>1. Responsável pelo tratamento</h2>
        <p>
          O <strong>Coach11</strong> (a &quot;Plataforma&quot;) é operado por
          Pedro Campos / <strong>Be First RS</strong>, com sede em Lisboa,
          Portugal. Para questões sobre dados pessoais, contacta o nosso ponto
          de contacto RGPD em{" "}
          <a href="mailto:privacidade@coach11.app">privacidade@coach11.app</a>.
          Para assuntos gerais:{" "}
          <a href="mailto:ola@coach11.app">ola@coach11.app</a>.
        </p>
      </section>

      <section>
        <h2>2. Que dados recolhemos</h2>

        <h3>2.1. Conta e perfil</h3>
        <ul>
          <li>Nome completo, email, telefone (opcional)</li>
          <li>Fotografia de perfil (se carregada pelo utilizador)</li>
          <li>Função na plataforma (treinador, coordenador, staff, atleta)</li>
          <li>Clube e escalão associados</li>
        </ul>

        <h3>2.2. Dados operacionais do clube</h3>
        <ul>
          <li>Lista de atletas: nome, data de nascimento, número, posição, contactos de encarregados</li>
          <li>Sessões de treino: data, presenças, exercícios, notas</li>
          <li>Jogos: convocatórias, eventos (golos, cartões), estatísticas</li>
          <li>Competições e calendário</li>
        </ul>

        <h3>2.3. Dados de utilização (analítica)</h3>
        <ul>
          <li>Eventos de produto (sessões iniciadas, convocações criadas, presenças marcadas)</li>
          <li>Informação técnica de acesso (browser, dispositivo, IP de origem aproximado)</li>
          <li>Logs de erro técnicos (Sentry) para diagnóstico</li>
        </ul>

        <h3>2.4. Dados de faturação (apenas clubes pagantes)</h3>
        <ul>
          <li>NIF, morada de faturação, razão social</li>
          <li>Histórico de pagamentos (processado por gateway externo)</li>
        </ul>
      </section>

      <section>
        <h2>3. Finalidades e base legal</h2>
        <p>Tratamos dados para:</p>
        <ul>
          <li>
            <strong>Operação da Plataforma</strong> (execução de contrato): permitir que clubes e treinadores giram escalões, treinos, jogos e atletas
          </li>
          <li>
            <strong>Comunicação contratual</strong> (execução de contrato): notificações sobre convocações, treinos, jogos
          </li>
          <li>
            <strong>Faturação e cumprimento legal</strong> (obrigação legal): emissão de faturas, retenção fiscal
          </li>
          <li>
            <strong>Melhoria do produto</strong> (interesse legítimo): analítica agregada e anonimizada via PostHog
          </li>
          <li>
            <strong>Suporte técnico</strong> (interesse legítimo): logs Sentry para diagnosticar e corrigir erros
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Partilha com terceiros</h2>
        <p>
          O Coach11 partilha dados <strong>apenas</strong> com fornecedores de
          infraestrutura sujeitos a contratos de subcontratante (DPA), todos
          com servidores na União Europeia ou abrangidos pelo EU-US Data
          Privacy Framework:
        </p>
        <ul>
          <li>
            <strong>Supabase (EU)</strong> — armazenamento da base de dados e
            autenticação
          </li>
          <li>
            <strong>Vercel</strong> — alojamento da aplicação web
          </li>
          <li>
            <strong>Resend</strong> — envio de emails transaccionais a partir
            do domínio coach11.app (convites, recuperação de password, avisos
            de ciclo de vida da subscrição)
          </li>
          <li>
            <strong>PostHog (EU Cloud)</strong> — analítica de produto agregada
          </li>
          <li>
            <strong>Sentry</strong> — captura de erros técnicos
          </li>
          <li>
            <strong>Stripe</strong> — processamento de pagamentos e gestão de
            subscrições (apenas para contas pagantes)
          </li>
        </ul>
        <p>
          Nunca vendemos dados pessoais. Nunca partilhamos com fins de marketing externo.
        </p>
      </section>

      <section>
        <h2>5. Retenção</h2>
        <ul>
          <li>
            <strong>Dados de conta e operacionais</strong>: mantidos enquanto a
            subscrição estiver activa. Após o cancelamento (ou pedido de
            eliminação), inicia-se uma <strong>janela de 60 dias</strong> antes
            da eliminação definitiva — período durante o qual a conta pode ser
            reactivada sem perda de dados. Durante essa janela enviamos avisos
            por email: no momento do cancelamento (dia 0), a meio do período
            (cerca do dia 30) e um aviso final antes da purga (cerca do dia
            53). Decorridos os 60 dias sem reactivação, os dados operacionais
            do clube são eliminados de forma definitiva e irreversível.
          </li>
          <li>
            <strong>Dados de faturação</strong>: retidos por obrigação legal
            (legislação fiscal, Autoridade Tributária) durante o prazo legal
            aplicável (cerca de 10 anos). Estes dados são geridos pela Stripe e{" "}
            <strong>nunca são apagados pelo processo de purga acima</strong> —
            sobrevivem à eliminação da conta para cumprimento das obrigações
            fiscais.
          </li>
          <li>
            <strong>Logs técnicos</strong>: 90 dias.
          </li>
          <li>
            <strong>Eventos analíticos</strong>: 12 meses; anonimizados após esse período.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Os teus direitos (RGPD)</h2>
        <p>Tens o direito de:</p>
        <ul>
          <li>
            <strong>Acesso</strong>: pedir cópia dos dados pessoais que temos sobre ti
          </li>
          <li>
            <strong>Retificação</strong>: corrigir dados incorrectos
          </li>
          <li>
            <strong>Eliminação</strong> (&quot;direito ao esquecimento&quot;): pedir apagamento
          </li>
          <li>
            <strong>Portabilidade</strong>: receber os teus dados em formato estruturado (JSON/CSV)
          </li>
          <li>
            <strong>Oposição</strong>: opor-te ao tratamento baseado em interesse legítimo
          </li>
          <li>
            <strong>Limitação</strong>: pedir restrição temporária do tratamento
          </li>
        </ul>
        <p>
          Para exercer qualquer destes direitos: <a href="mailto:privacidade@coach11.app">privacidade@coach11.app</a>.
          Respondemos em até 30 dias.
        </p>
      </section>

      <section>
        <h2>7. Atletas menores de idade</h2>
        <p>
          A natureza do Coach11 implica o tratamento de dados pessoais de
          atletas menores de idade. Esses dados &mdash; nome, data de
          nascimento, posição, número e contactos dos encarregados de educação
          &mdash; são registados pelos clubes e treinadores, e não pelos
          próprios menores.
        </p>
        <p>
          <strong>Os menores não são utilizadores directos da Plataforma</strong>:
          não criam conta, não fazem sessão e não interagem com o Coach11.
          Quem regista e gere estes dados é o clube ou o treinador responsável.
        </p>
        <p>
          A <strong>recolha do consentimento dos encarregados de educação</strong>{" "}
          para o tratamento dos dados do menor é da responsabilidade do clube ou
          do treinador que regista o atleta, na qualidade de responsável por
          esses dados perante as famílias. O Coach11 actua como ferramenta ao
          serviço dessa relação.
        </p>
        <p>
          O encarregado de educação pode, a qualquer momento, exercer os
          direitos do menor &mdash; incluindo o{" "}
          <strong>direito de eliminação</strong> dos seus dados &mdash; junto do
          clube ou treinador responsável, ou através de{" "}
          <a href="mailto:privacidade@coach11.app">privacidade@coach11.app</a>.
          Tratamos estes pedidos com prioridade.
        </p>
      </section>

      <section>
        <h2>8. Cookies</h2>
        <p>
          A Plataforma usa cookies estritamente necessários para autenticação
          (sessão Supabase) e preferências (escalão activo, tema). Não usamos
          cookies de tracking publicitário.
        </p>
      </section>

      <section>
        <h2>9. Segurança</h2>
        <p>
          Aplicamos medidas técnicas e organizacionais adequadas: encriptação
          em trânsito (TLS), isolamento de dados por <em>row-level security</em>{" "}
          (RLS), autenticação via Supabase Auth, logs de auditoria das acções
          sensíveis e procedimentos de resposta a incidentes.
        </p>
      </section>

      <section>
        <h2>10. Reclamações</h2>
        <p>
          Se considerares que tratamos os teus dados de forma incorrecta,
          podes apresentar reclamação à <strong>Comissão Nacional de Protecção
          de Dados (CNPD)</strong>:{" "}
          <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer">
            www.cnpd.pt
          </a>
          .
        </p>
      </section>

      <section>
        <h2>11. Alterações a esta política</h2>
        <p>
          Reservamo-nos o direito de actualizar esta política. Mudanças
          significativas são comunicadas por email com 30 dias de
          antecedência. A data de &quot;última actualização&quot; no topo
          indica a versão actual.
        </p>
      </section>

      <section>
        <p className="text-sm text-white/40">
          <em>
            Este documento é um modelo informativo e não constitui
            aconselhamento jurídico; deve ser revisto por advogado antes do
            lançamento comercial.
          </em>
        </p>
      </section>
    </LegalPageLayout>
  );
}
