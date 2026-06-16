import Link from "next/link";
import type { ReactNode } from "react";
import { PlanCtaButton } from "@/components/public/PlanCtaButton";
import "./public-site.css";

/**
 * Chrome publico partilhado das paginas /precos /contacto /faqs /termos
 * /privacidade. Header e footer espelham a landing (.c11lp): tema escuro navy,
 * logo SO TEXTO (Coach11), nav fixa solida e footer com tagline + links. A
 * landing mantem o seu nav/footer bespoke; aqui reproduzimos o aspecto sem
 * acoplar a folha .c11lp (cujos seletores de elemento colidiriam com o
 * conteudo legal em <section>). Estilos em ./public-site.css (escopo .c11site).
 */

const PROSE_CLASSES =
  "space-y-10 text-white/80 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mb-3 [&_h2]:mt-10 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1.5 [&_a]:text-emerald-400 [&_a]:underline [&_a:hover]:text-emerald-300 [&_strong]:text-white";

interface Props {
  title: string;
  intro?: string;
  lastUpdated?: string;
  /**
   * When true (default), wraps children in <article> with prose-like typography
   * applied to descendant h2/h3/p/ul/a/strong. Disable when the page mixes
   * custom layouts (grids of cards, forms) with body copy, and use
   * <LegalProse> for the prose blocks instead.
   */
  prose?: boolean;
  /** Optional wider main column (default `max-w-3xl`). */
  wide?: boolean;
  children: ReactNode;
}

export function LegalProse({ children }: { children: ReactNode }) {
  return <div className={PROSE_CLASSES}>{children}</div>;
}

export function PublicSiteLayout({
  title,
  intro,
  lastUpdated,
  prose = true,
  wide = false,
  children,
}: Props) {
  return (
    <div className="c11site">
      <nav className="site-nav">
        <div className="nav-in">
          <Link href="/" className="logo" aria-label="Coach11 — página inicial">
            Coach<span className="e">11</span>
          </Link>
          <div className="nav-r">
            <Link className="lnk" href="/#como">
              Como funciona
            </Link>
            <Link className="lnk" href="/#funcionalidades">
              Funcionalidades
            </Link>
            <Link className="lnk" href="/precos">
              Preço
            </Link>
            <PlanCtaButton
              href="/billing/start"
              label="Começar grátis"
              planIntent="individual"
              className="btn btn-em"
            />
          </div>
        </div>
      </nav>

      <main className="site-main">
        <div className={`wrap${wide ? " wide" : ""}`}>
          <header className="page-head">
            <h1>{title}</h1>
            {intro ? <p className="intro">{intro}</p> : null}
            {lastUpdated ? (
              <p className="updated">Última actualização: {lastUpdated}</p>
            ) : null}
          </header>

          {prose ? (
            <article className={PROSE_CLASSES}>{children}</article>
          ) : (
            <div className="space-y-12 text-white/80">{children}</div>
          )}
        </div>
      </main>

      <footer className="site-foot">
        <div className="foot-in">
          <div className="foot-logo">
            Coach<span className="e">11</span> ·{" "}
            <span className="foot-tag">
              feito em Lisboa para treinadores de formação
            </span>
          </div>
          <div className="foot-links">
            <Link href="/#funcionalidades">Funcionalidades</Link>
            <Link href="/precos">Preço</Link>
            <Link href="/contacto">Contacto</Link>
            <Link href="/faqs">FAQs</Link>
            <Link href="/termos">Termos</Link>
            <Link href="/privacidade">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
