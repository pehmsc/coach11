"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { PlanCtaButton } from "@/components/public/PlanCtaButton";

const LINKS = [
  { href: "#features", label: "Funcionalidades" },
  { href: "#how", label: "Como Funciona" },
  { href: "#comparison", label: "Comparar" },
  { href: "#planos", label: "Planos" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
          aria-label="Coach11 — voltar ao topo"
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

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-white/60 transition hover:text-white"
            >
              {l.label}
            </a>
          ))}
          <a href="/login" className="text-sm text-white/60 transition hover:text-white">
            Entrar
          </a>
          <PlanCtaButton
            href="/billing/start"
            label="Começar"
            planIntent="individual"
            className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400 active:scale-[0.97]"
          />
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="text-white/60 transition active:scale-95 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu — montado sempre, animado via grid-rows + opacity.
          Exit mais rapido que enter; inert quando fechado tira-o do tab order. */}
      <div
        id="landing-mobile-menu"
        inert={!open}
        className="grid overflow-hidden bg-slate-950 transition-[grid-template-rows,opacity] ease-out md:hidden"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transitionDuration: open ? "220ms" : "140ms",
        }}
      >
        <div className="min-h-0 overflow-hidden border-t border-white/5">
          <div className="flex flex-col gap-4 px-6 py-4">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-white/60 transition active:scale-[0.98]"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <a
              href="/login"
              className="text-sm text-white/60 transition active:scale-[0.98]"
              onClick={() => setOpen(false)}
            >
              Entrar
            </a>
            <PlanCtaButton
              href="/billing/start"
              label="Começar — 7 dias grátis"
              planIntent="individual"
              className="rounded-lg bg-emerald-500 px-5 py-2.5 text-center text-sm font-semibold text-white transition active:scale-[0.97]"
            />
          </div>
        </div>
      </div>
    </nav>
  );
}
