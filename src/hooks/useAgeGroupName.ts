"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Fetch leve do nome do escalão para uso em breadcrumbs e títulos.
 * Devolve `null` enquanto carrega (use fallback "Escalão" no consumidor).
 */
export function useAgeGroupName(ageGroupId: string): string | null {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("age_groups")
      .select("name")
      .eq("id", ageGroupId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setName(data?.name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [ageGroupId, supabase]);

  return name;
}
