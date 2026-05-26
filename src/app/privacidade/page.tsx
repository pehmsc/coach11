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
      lastUpdated="26 de Maio de 2026"
    >
      <section>
        <h2>1. Responsável pelo tratamento</h2>
        <p>
          O <strong>Coach11</strong> (a &quot;Plataforma&quot;) é operado por
          Pedro Campos, com sede em Lisboa, Portugal. Para questões sobre
          dados pessoais, contacta{" "}
          <a href="mailto:privacidade@coach11.app">privacidade@coach11.app</a>.
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
            <strong>Resend</strong> — envio de emails transaccionais (convites, recuperação de password)
          </li>
          <li>
            <strong>PostHog (EU Cloud)</strong> — analítica de produto agregada
          </li>
          <li>
            <strong>Sentry</strong> — captura de erros técnicos
          </li>
          <li>
            <strong>Gateway de pagamento</strong> (apenas para clubes pagantes) — Stripe ou equivalente
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
            <strong>Dados de conta</strong> e operacionais: enquanto a conta
            estiver activa. Após pedido de eliminação, dados pessoais são
            apagados em até 30 dias.
          </li>
          <li>
            <strong>Dados de faturação</strong>: 10 anos (obrigação legal AT).
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
          Quando o clube regista atletas menores de 16 anos, é responsabilidade
          do clube garantir o consentimento dos encarregados de educação. O
          Coach11 fornece ferramentas para os encarregados consultarem dados
          do seu educando (calendário, convocatórias), mas não trata
          directamente com menores como utilizadores.
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
    </LegalPageLayout>
  );
}
