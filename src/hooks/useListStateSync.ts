"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Hook genérico para sincronizar state de listas com URL query params.
 *
 * - Lê valor da URL via useSearchParams
 * - Se URL não tem o param, usa defaultValue
 * - setValue actualiza URL via router.replace (sem nova entrada no histórico)
 * - Quando o valor é igual ao default, o param é omitido (URL fica limpa)
 * - Refresh-safe: state vive na URL, não em memória
 *
 * @param paramName Nome do query param (ex: "tab", "sort", "filter")
 * @param defaultValue Valor a usar quando URL não tem o param
 * @param options.scrollOnChange Se true, scroll-to-top ao mudar (default: false)
 */
export function useListStateSync<T extends string>(
  paramName: string,
  defaultValue: T,
  options?: { scrollOnChange?: boolean },
): [T, (value: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollOnChange = options?.scrollOnChange ?? false;

  const value = useMemo<T>(() => {
    const fromUrl = searchParams.get(paramName);
    return (fromUrl as T) ?? defaultValue;
  }, [searchParams, paramName, defaultValue]);

  const setValue = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next === defaultValue || next === "") {
        params.delete(paramName);
      } else {
        params.set(paramName, next);
      }

      const queryString = params.toString();
      const url = queryString ? `${pathname}?${queryString}` : pathname;

      router.replace(url, { scroll: scrollOnChange });
    },
    [router, pathname, searchParams, paramName, defaultValue, scrollOnChange],
  );

  return [value, setValue];
}
