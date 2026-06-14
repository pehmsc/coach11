import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

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

export function LegalPageLayout({
  title,
  intro,
  lastUpdated,
  prose = true,
  wide = false,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-slate-950 text-white antialiased">
      <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            aria-label="Coach11 — voltar à página inicial"
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
          <Link
            href="/"
            className="text-sm text-white/60 transition hover:text-white"
          >
            Voltar
          </Link>
        </div>
      </nav>

      <main
        className={`mx-auto px-6 pt-32 pb-20 ${wide ? "max-w-5xl" : "max-w-3xl"}`}
      >
        <header className="mb-12 border-b border-white/10 pb-8">
          <h1 className="mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">
            {title}
          </h1>
          {intro ? (
            <p className="text-white/60">{intro}</p>
          ) : null}
          {lastUpdated ? (
            <p className="mt-4 text-xs text-white/40">
              Última actualização: {lastUpdated}
            </p>
          ) : null}
        </header>

        {prose ? (
          <article className={PROSE_CLASSES}>{children}</article>
        ) : (
          <div className="space-y-12 text-white/80">{children}</div>
        )}
      </main>

      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <Link
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            aria-label="Coach11 — voltar à página inicial"
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
            <Link href="/precos" className="transition hover:text-white/70">
              Preços
            </Link>
            <Link href="/contacto" className="transition hover:text-white/70">
              Contacto
            </Link>
            <Link href="/faqs" className="transition hover:text-white/70">
              FAQs
            </Link>
            <Link href="/termos" className="transition hover:text-white/70">
              Termos
            </Link>
            <Link href="/privacidade" className="transition hover:text-white/70">
              Privacidade
            </Link>
          </div>
          <p className="text-xs text-white/30">
            &copy; 2026 Coach11
          </p>
        </div>
      </footer>
    </div>
  );
}
