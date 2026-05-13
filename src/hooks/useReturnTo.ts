"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const STORAGE_KEY_PREFIX = "coach11:returnTo:";

/**
 * Hook para preservar a URL actual (com query params) no sessionStorage
 * antes de navegar para uma página de detalhe.
 *
 * A página de detalhe usa `getReturnTo(destinationKey)` para obter a URL
 * preservada e passá-la ao StickyBackLink via prop `href`.
 *
 * Comportamento defensivo:
 * - try/catch para sessionStorage (incognito Safari, quota cheia → silent fail)
 * - SSR-safe (verifica typeof window)
 * - Dispatch de event "coach11:saveScroll" para coordenar com useScrollRestoration
 *
 * @param destinationKey Identificador único (ex: "games", "trainings", "players")
 */
export function useReturnTo(destinationKey: string) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const saveReturnTo = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      const queryString = searchParams.toString();
      const fullUrl = queryString ? `${pathname}?${queryString}` : pathname;
      const storageKey = `${STORAGE_KEY_PREFIX}${destinationKey}`;
      window.sessionStorage.setItem(storageKey, fullUrl);

      // Coordena com useScrollRestoration: captura scrollY actual antes de navegar.
      window.dispatchEvent(new CustomEvent("coach11:saveScroll"));
    } catch {
      // sessionStorage indisponível (incognito Safari, quota) — graceful fallback.
    }
  }, [pathname, searchParams, destinationKey]);

  return { saveReturnTo };
}

/**
 * Lê a URL preservada do sessionStorage. Síncrona — chamar dentro de
 * useEffect para evitar hydration mismatch.
 *
 * @param destinationKey Mesmo key usado no saveReturnTo
 * @param fallback URL default a usar se sessionStorage não tiver entrada
 */
export function getReturnTo(destinationKey: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;

  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${destinationKey}`;
    return window.sessionStorage.getItem(storageKey) ?? fallback;
  } catch {
    return fallback;
  }
}
