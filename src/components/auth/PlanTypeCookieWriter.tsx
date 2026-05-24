"use client";

import { useEffect } from "react";
import type { PlanType } from "@/components/layout/nav-config";

/**
 * Escreve o cookie `coach11_plan_type` no client, espelhando o `plan_type`
 * resolvido pelo server layout (`TeamContextClub.plan_type`).
 *
 * O cookie e lido pelo proxy (`src/proxy.ts`) para decidir redirects de
 * rotas legacy <-> multi-team conforme a persona do utilizador. Sem este
 * cookie, o proxy usa default 'club' (comportamento conservador).
 *
 * Server components nao podem escrever cookies directamente em Next.js;
 * por isso este componente client minimal trata da escrita no mount e
 * sempre que o `planType` mudar (ex: utilizador troca de clube via
 * ScopeToggle no futuro).
 */
interface Props {
  planType: PlanType;
}

const COOKIE_KEY = "coach11_plan_type";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function PlanTypeCookieWriter({ planType }: Props) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    try {
      document.cookie = `${COOKIE_KEY}=${encodeURIComponent(planType)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    } catch {
      // sessao restrita (incognito) — graceful no-op. O proxy assume 'club' por defeito.
    }
  }, [planType]);

  return null;
}
