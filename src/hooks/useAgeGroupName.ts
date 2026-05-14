"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AgeGroupMeta = {
  /** Nome do escalão (e.g. "Infantis A"). */
  name: string | null;
  /** Formato de futebol (e.g. "7", "9", "11"). Usado para filtrar formações. */
  football_format: string | null;
};

const EMPTY_META: AgeGroupMeta = { name: null, football_format: null };

/**
 * Fetch leve de metadados do escalão (nome + formato de futebol) para uso
 * em breadcrumbs, títulos e filtros de UI. Mantém uma única round-trip ao
 * Supabase. Devolve `{ name: null, football_format: null }` enquanto carrega.
 */
type FetchedState = { id: string; meta: AgeGroupMeta } | null;

export function useAgeGroupMeta(
  ageGroupId: string | null,
): AgeGroupMeta {
  const supabase = useMemo(() => createClient(), []);
  const [fetched, setFetched] = useState<FetchedState>(null);

  useEffect(() => {
    if (!ageGroupId) return;
    let cancelled = false;
    void supabase
      .from("age_groups")
      .select("name, football_format")
      .eq("id", ageGroupId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setFetched({
          id: ageGroupId,
          meta: {
            name: data?.name ?? null,
            football_format: data?.football_format ?? null,
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [ageGroupId, supabase]);

  // Derive: só devolvemos meta quando o id pedido coincide com o último
  // resolvido. Mantém EMPTY_META durante transições e quando ageGroupId é null.
  return fetched && fetched.id === ageGroupId ? fetched.meta : EMPTY_META;
}

/**
 * Wrapper retrocompat sobre useAgeGroupMeta: devolve apenas o `name`.
 * Mantido para os callers do PR #154 que só precisam do nome.
 */
export function useAgeGroupName(ageGroupId: string): string | null {
  return useAgeGroupMeta(ageGroupId).name;
}
