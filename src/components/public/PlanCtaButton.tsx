"use client";

import Link from "next/link";
import { setPlanIntent, type PlanIntent } from "@/lib/billing/plan-intent";

interface Props {
  href: string;
  label: string;
  className: string;
  /** Quando presente, escreve o cookie de intencao antes de navegar. */
  planIntent?: PlanIntent;
}

/**
 * CTA de plano que escreve o cookie de intencao (ex: individual) antes de
 * navegar para /billing/start. Garante que a intencao sobrevive a OAuth,
 * refreshes e navegacao directa (ver lib/billing/plan-intent).
 */
export function PlanCtaButton({ href, label, className, planIntent }: Props) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (planIntent) setPlanIntent(planIntent);
      }}
    >
      {label}
    </Link>
  );
}
