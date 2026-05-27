import Link from "next/link";
import { Check } from "lucide-react";

export interface PlanCardProps {
  name: string;
  tagline: string;
  price: string;
  priceNote?: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
  badge?: string;
}

export function PlanCard({
  name,
  tagline,
  price,
  priceNote,
  features,
  ctaLabel,
  ctaHref,
  highlighted = false,
  badge,
}: PlanCardProps) {
  return (
    <div
      className={`relative flex h-full flex-col rounded-2xl border p-6 transition ${
        highlighted
          ? "border-emerald-500/40 bg-emerald-950/30 shadow-lg shadow-emerald-500/10"
          : "border-white/10 bg-white/[0.03] hover:border-white/20"
      }`}
    >
      {badge ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white">
          {badge}
        </span>
      ) : null}

      <div className="mb-6">
        <h3 className="text-xl font-bold text-white">{name}</h3>
        <p className="mt-1 text-sm text-white/50">{tagline}</p>
      </div>

      <div className="mb-6">
        <div className="text-2xl font-extrabold text-white md:text-3xl">
          {price}
        </div>
        {priceNote ? (
          <p className="mt-1 text-xs text-white/40">{priceNote}</p>
        ) : null}
      </div>

      <ul className="mb-8 flex-1 space-y-3">
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm text-white/70"
          >
            <Check
              size={16}
              className={`mt-0.5 shrink-0 ${
                highlighted ? "text-emerald-400" : "text-white/40"
              }`}
              aria-hidden="true"
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={`mt-auto inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition ${
          highlighted
            ? "bg-emerald-500 text-white hover:bg-emerald-400"
            : "border border-white/15 text-white hover:bg-white/5"
        }`}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

export const PLANS: PlanCardProps[] = [
  {
    name: "Individual",
    tagline: "Treinador, 1 equipa",
    price: "€7,99",
    priceNote: "/ mês · IVA incluído · 7 dias trial",
    features: [
      "1 equipa, sem hierarquia",
      "Convocatórias, treinos, jogos",
      "Presenças e eventos live",
      "PDF e partilha com encarregados",
      "Suporte por email (48h úteis)",
    ],
    ctaLabel: "Começar trial · 7 dias",
    ctaHref: "/register?plan=individual",
  },
  {
    name: "Clube · Standard",
    tagline: "Até ~30 staff",
    price: "Sob consulta",
    priceNote: "Sales-led · adaptado ao clube",
    features: [
      "Coordenador + treinadores + adjuntos",
      "Vários escalões e equipas",
      "Insights de clube agregados",
      "Onboarding guiado",
      "Suporte prioritário (24h úteis)",
    ],
    ctaLabel: "Pedir proposta",
    ctaHref: "/contacto?persona=club",
    highlighted: true,
    badge: "Mais popular",
  },
  {
    name: "Clube · Pro",
    tagline: "Clubes grandes",
    price: "Sob consulta",
    priceNote: "Proposta dedicada",
    features: [
      "Base de dados isolada",
      "Domínio próprio (clube.coach11.app)",
      "Auditoria reforçada",
      "Integrações específicas",
      "Canal de suporte dedicado",
    ],
    ctaLabel: "Falar connosco",
    ctaHref: "/contacto?persona=club",
  },
];
