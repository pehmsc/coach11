"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const STORAGE_KEY_PREFIX = "coach11:scroll:";

/**
 * Hook para preservar e restaurar scroll position de uma lista entre
 * navegações.
 *
 * Comportamento:
 * - Salva window.scrollY no sessionStorage em (a) beforeunload e (b)
 *   custom event "coach11:saveScroll" disparado pelo useReturnTo
 *   antes da navegação.
 * - Ao montar, aguarda 2 RAFs para layout assentar, depois restaura
 *   scrollY com Math.min contra a altura disponível (evita "preso
 *   no fundo" se a lista renderizou menos itens que o esperado).
 * - Limpa entrada após restaurar — próxima navegação para esta lista
 *   começa do topo a menos que nova navegação dispare save.
 *
 * @param scopeKey Mesma key usada no useReturnTo para coordenar.
 * @param options.enabled Se false, hook é no-op.
 */
export function useScrollRestoration(
  scopeKey: string,
  options?: { enabled?: boolean },
) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const restoredRef = useRef(false);
  const enabled = options?.enabled ?? true;

  const storageKey = `${STORAGE_KEY_PREFIX}${scopeKey}`;

  useEffect(() => {
    if (!enabled) return;

    const saveScroll = () => {
      try {
        window.sessionStorage.setItem(storageKey, String(window.scrollY));
      } catch {
        // Silent fail
      }
    };

    window.addEventListener("beforeunload", saveScroll);
    window.addEventListener("coach11:saveScroll", saveScroll);

    return () => {
      window.removeEventListener("beforeunload", saveScroll);
      window.removeEventListener("coach11:saveScroll", saveScroll);
    };
  }, [enabled, storageKey]);

  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    restoredRef.current = true;

    try {
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved === null) return;

      const scrollY = Number.parseInt(saved, 10);
      if (Number.isNaN(scrollY) || scrollY <= 0) return;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const maxScroll =
            document.documentElement.scrollHeight - window.innerHeight;
          const safeScrollY = Math.min(scrollY, Math.max(0, maxScroll));

          if (safeScrollY > 0) {
            window.scrollTo({ top: safeScrollY, behavior: "instant" });
          }

          try {
            window.sessionStorage.removeItem(storageKey);
          } catch {
            // Silent fail
          }
        });
      });
    } catch {
      // Silent fail
    }
  }, [enabled, storageKey, pathname, searchParams]);
}
