import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout } from "@/components/public/LegalPageLayout";

export const metadata: Metadata = {
  title: "Termos de Serviço — Coach11",
  description:
    "Termos e condições de utilização do Coach11: objecto do serviço, conta, planos e pagamento, obrigações do utilizador, responsabilidade e lei aplicável.",
};

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Termos de Serviço"
      intro="Estes Termos regulam o acesso e a utilização do Coach11. Ao criar conta ou usar a Plataforma, aceitas estes Termos. Lê-os com atenção."
      lastUpdated="14 de Junho de 2026"
    >
      <section>
        <h2>1. Objecto do serviço</h2>
        <p>
          O <strong>Coach11</strong> (a &quot;Plataforma&quot;) é uma aplicação
          web de gestão de futebol de formação, operada por Pedro Campos /{" "}
          <strong>Be First RS</strong>, com sede em Lisboa, Portugal (o
          &quot;Coach11&quot;, &quot;nós&quot;). A Plataforma permite a
          treinadores, coordenadores, staff e clubes gerir plantéis, treinos,
          jogos, convocatórias, presenças, competições e estatísticas.
        </p>
        <p>
          O Coach11 é fornecido como um serviço por subscrição (SaaS),
          acessível através de browser e instalável como aplicação (PWA). O
          âmbito concreto das funcionalidades depende do plano contratado.
        </p>
      </section>

      <section>
        <h2>2. Conta e elegibilidade</h2>
        <ul>
          <li>
            Para usar a Plataforma é necessário criar uma conta com dados
            verdadeiros, completos e actualizados.
          </li>
          <li>
            A conta destina-se a maiores de idade. Os atletas menores{" "}
            <strong>não</strong> são utilizadores da Plataforma: os seus dados
            são geridos pelos clubes e treinadores (ver secção 6).
          </li>
          <li>
            És responsável por manter a confidencialidade das tuas credenciais
            e por toda a actividade realizada na tua conta. Avisa-nos de
            imediato em caso de uso não autorizado.
          </li>
          <li>
            Cada conta é pessoal e intransmissível. O acesso de membros de
            staff e coordenadores é regido pelo modelo de permissões da
            Plataforma.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Planos, preços e pagamento</h2>
        <ul>
          <li>
            O <strong>plano individual</strong> custa{" "}
            <strong>&euro;7,99/mês (IVA incluído)</strong>, em subscrição
            mensal recorrente.
          </li>
          <li>
            Os <strong>planos de clube</strong> têm condições acordadas caso a
            caso em onboarding dedicado. Consulta{" "}
            <Link href="/precos">/precos</Link> para o detalhe dos planos.
          </li>
          <li>
            O pagamento é processado pela <strong>Stripe</strong>. O Coach11 não
            armazena os dados completos do teu cartão.
          </li>
          <li>
            A subscrição <strong>renova-se automaticamente</strong> no fim de
            cada período, ao preço em vigor, até ser cancelada.
          </li>
          <li>
            É emitida factura electrónica de cada cobrança, nos termos da
            legislação fiscal portuguesa.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Período experimental e cancelamento</h2>
        <ul>
          <li>
            O plano individual inclui um <strong>período experimental de 7
            dias</strong>. Se não cancelares durante esse período, a subscrição
            paga inicia-se automaticamente no fim do trial.
          </li>
          <li>
            Podes cancelar a qualquer momento através do{" "}
            <strong>Customer Portal da Stripe</strong>, acessível a partir das
            configurações da conta. O cancelamento produz efeitos{" "}
            <strong>no fim do período já pago</strong> &mdash; mantens o acesso
            até essa data e não há reembolso do período em curso, salvo
            imposição legal.
          </li>
          <li>
            Após o cancelamento, os dados operacionais do clube seguem o
            processo de retenção e purga descrito na{" "}
            <Link href="/privacidade">Política de Privacidade</Link> (janela de
            60 dias com possibilidade de reactivação, seguida de eliminação
            definitiva).
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Obrigações do utilizador</h2>
        <p>Ao usar a Plataforma, comprometes-te a:</p>
        <ul>
          <li>
            Fazer uma utilização <strong>lícita</strong> do serviço, em
            conformidade com a lei aplicável e com estes Termos.
          </li>
          <li>
            Não tentar aceder a dados de outros clubes ou contas, contornar
            mecanismos de segurança, sobrecarregar a infra-estrutura ou usar a
            Plataforma para fins indevidos.
          </li>
          <li>
            Ser <strong>responsável pelos dados que carregas</strong> na
            Plataforma &mdash; garantir que tens base legal e legitimidade para
            os tratar, e que são exactos e adequados.
          </li>
          <li>
            Não carregar conteúdos ilícitos, ofensivos ou que violem direitos
            de terceiros.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Dados de menores e consentimento dos encarregados</h2>
        <p>
          A Plataforma trata dados pessoais de atletas menores de idade (nome,
          data de nascimento, posição, número e contactos dos encarregados de
          educação), registados pelos clubes e treinadores.
        </p>
        <p>
          Ao registar e gerir dados de menores, assumes a responsabilidade de
          garantir o <strong>consentimento dos respectivos encarregados de
          educação</strong> e a legitimidade para esse tratamento, na qualidade
          de responsável pelos dados perante as famílias. O Coach11 actua como
          ferramenta ao serviço dessa relação e não como responsável pela
          recolha desse consentimento.
        </p>
        <p>
          O tratamento destes dados rege-se pela{" "}
          <Link href="/privacidade">Política de Privacidade</Link>, que faz
          parte integrante destes Termos.
        </p>
      </section>

      <section>
        <h2>7. Propriedade intelectual</h2>
        <p>
          O Coach11, incluindo o software, o design, a marca e todos os
          conteúdos da Plataforma, é propriedade do Coach11 / Be First RS ou dos
          seus licenciadores, e está protegido por direitos de propriedade
          intelectual. Estes Termos não te conferem qualquer direito sobre a
          marca ou o software, além do direito de uso da Plataforma enquanto a
          subscrição estiver activa.
        </p>
        <p>
          Os <strong>dados que introduzes</strong> na Plataforma continuam a ser
          teus (ou do clube). Concedes ao Coach11 apenas a autorização técnica
          necessária para alojar, processar e apresentar esses dados no âmbito
          da prestação do serviço.
        </p>
      </section>

      <section>
        <h2>8. Disponibilidade do serviço</h2>
        <p>
          Esforçamo-nos por manter a Plataforma disponível e fiável, mas o
          serviço é prestado &quot;tal como está&quot;, sem garantia de
          disponibilidade ininterrupta. Podem ocorrer interrupções para
          manutenção, actualizações ou por causas alheias ao nosso controlo
          (incluindo falhas de subcontratantes de infra-estrutura).
        </p>
      </section>

      <section>
        <h2>9. Limitação de responsabilidade</h2>
        <p>
          Na medida máxima permitida pela lei, o Coach11 não é responsável por
          danos indirectos, lucros cessantes, perda de dados ou prejuízos
          decorrentes do uso ou da impossibilidade de uso da Plataforma. Em
          qualquer caso, a responsabilidade total do Coach11 está limitada ao
          montante pago pelo utilizador nos 12 meses anteriores ao facto que
          deu origem à responsabilidade.
        </p>
        <p>
          Nada nestes Termos exclui ou limita a responsabilidade que não possa
          legalmente ser excluída ou limitada.
        </p>
      </section>

      <section>
        <h2>10. Suspensão e encerramento de conta</h2>
        <ul>
          <li>
            Podes encerrar a tua conta a qualquer momento, cancelando a
            subscrição (secção 4).
          </li>
          <li>
            O Coach11 pode <strong>suspender ou encerrar</strong> o acesso em
            caso de incumprimento destes Termos, uso ilícito ou falta de
            pagamento, sempre que possível com aviso prévio.
          </li>
          <li>
            Após o encerramento, aplica-se o processo de retenção e eliminação
            de dados descrito na{" "}
            <Link href="/privacidade">Política de Privacidade</Link>.
          </li>
        </ul>
      </section>

      <section>
        <h2>11. Alterações aos Termos</h2>
        <p>
          Podemos actualizar estes Termos. Alterações significativas são
          comunicadas por email ou através da Plataforma com antecedência
          razoável. A continuação do uso após a entrada em vigor das alterações
          implica a aceitação dos novos Termos. A data de &quot;última
          actualização&quot; no topo indica a versão actual.
        </p>
      </section>

      <section>
        <h2>12. Lei aplicável e foro</h2>
        <p>
          Estes Termos regem-se pela <strong>lei portuguesa</strong>. Para a
          resolução de qualquer litígio decorrente destes Termos é competente o
          foro da comarca de Lisboa, sem prejuízo das regras imperativas de
          competência aplicáveis a consumidores.
        </p>
      </section>

      <section>
        <h2>13. Contacto</h2>
        <p>
          Para questões sobre estes Termos:{" "}
          <a href="mailto:ola@coach11.app">ola@coach11.app</a>. Para assuntos de
          dados pessoais:{" "}
          <a href="mailto:privacidade@coach11.app">privacidade@coach11.app</a>.
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
