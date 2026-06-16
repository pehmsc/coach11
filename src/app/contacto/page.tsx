import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicSiteLayout, LegalProse } from "@/components/public/PublicSiteLayout";
import { ContactForm } from "@/components/public/ContactForm";

export const metadata: Metadata = {
  title: "Contacto — Coach11",
  description:
    "Treinador individual? Entra na lista de espera. Clube? Pede proposta personalizada. Um único formulário, dois caminhos.",
};

export default function ContactoPage() {
  return (
    <PublicSiteLayout
      title="Falar connosco"
      intro="Treinador individual entra na lista de espera. Clube pede proposta — entramos em contacto em poucos dias úteis."
      prose={false}
    >
      <section>
        <Suspense
          fallback={
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/40">
              A carregar formulário...
            </div>
          }
        >
          <ContactForm />
        </Suspense>
      </section>

      <LegalProse>
        <section>
          <h2>Preferes email?</h2>
          <p>
            Geral: <a href="mailto:hello@coach11.app">hello@coach11.app</a>
            <br />
            Privacidade / RGPD:{" "}
            <a href="mailto:privacy@coach11.app">privacy@coach11.app</a>
          </p>
        </section>
      </LegalProse>
    </PublicSiteLayout>
  );
}
