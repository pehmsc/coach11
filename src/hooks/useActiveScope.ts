"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAgeGroup } from "@/contexts/AgeGroupContext";

/**
 * Active scope discriminated union.
 * - 'global': vista de todos os escalões acessíveis ao utilizador
 * - 'team': vista de um escalão específico
 */
export type ActiveScope =
  | { scope: "global" }
  | { scope: "team"; teamId: string; teamName: string };

export type UseActiveScopeResult = {
  /** Current active scope (discriminated union). */
  active: ActiveScope;
  /** Set scope explicitly. Persiste em localStorage via AgeGroupContext. */
  setScope: (next: ActiveScope) => void;
  /** Convenience: alterna para global ("Todos os escalões"). */
  setGlobal: () => void;
  /** Convenience: alterna para um escalão específico. */
  setTeam: (teamId: string) => void;
  /** Todos os escalões acessíveis ao utilizador. */
  availableTeams: { id: string; name: string }[];
  /** Se o user pode alternar (false = single team, selector não faz sentido). */
  canToggle: boolean;
};

/**
 * Wrapper sobre useAgeGroup() que expõe o conceito de "active scope"
 * com discriminated union mais ergonómico.
 *
 * Convenções:
 * - selectedAgeGroupId === null  ⇒  scope: 'global'
 * - selectedAgeGroupId === <uuid> ⇒  scope: 'team', teamId, teamName
 *
 * Zero breaking changes — useAgeGroup continua a funcionar para callers
 * existentes (useTrainingsData, etc).
 *
 * Os helpers setGlobal/setTeam/setScope disparam router.refresh() apos
 * actualizar o context, para que server components (e.g. /dashboard) que
 * leem o cookie coach11_active_age_group re-rendereizem com o novo valor.
 * Client components reagem automaticamente via React Context — o refresh
 * e no-op para esses; apenas server components beneficiam.
 */
export function useActiveScope(): UseActiveScopeResult {
  const router = useRouter();
  const {
    ageGroups,
    selectedAgeGroupId,
    setSelectedAgeGroupId,
    showAgeGroupSelector,
  } = useAgeGroup();

  const active = useMemo<ActiveScope>(() => {
    if (selectedAgeGroupId === null) {
      return { scope: "global" };
    }
    const team = ageGroups.find((g) => g.id === selectedAgeGroupId);
    if (!team) {
      // Fallback defensivo: id stale (escalão removido) → trata como global.
      return { scope: "global" };
    }
    return { scope: "team", teamId: team.id, teamName: team.name };
  }, [selectedAgeGroupId, ageGroups]);

  const setScope = useCallback(
    (next: ActiveScope) => {
      if (next.scope === "global") {
        setSelectedAgeGroupId(null);
      } else {
        setSelectedAgeGroupId(next.teamId);
      }
      router.refresh();
    },
    [setSelectedAgeGroupId, router],
  );

  const setGlobal = useCallback(() => {
    setSelectedAgeGroupId(null);
    router.refresh();
  }, [setSelectedAgeGroupId, router]);

  const setTeam = useCallback(
    (teamId: string) => {
      setSelectedAgeGroupId(teamId);
      router.refresh();
    },
    [setSelectedAgeGroupId, router],
  );

  const availableTeams = useMemo(
    () => ageGroups.map((g) => ({ id: g.id, name: g.name })),
    [ageGroups],
  );

  return {
    active,
    setScope,
    setGlobal,
    setTeam,
    availableTeams,
    canToggle: showAgeGroupSelector,
  };
}
