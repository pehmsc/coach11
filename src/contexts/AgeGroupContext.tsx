"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

const LOCAL_STORAGE_KEY = "coach11_selected_age_group_id";

type AgeGroupEntry = { id: string; name: string };

type AgeGroupContextValue = {
  /** Escalões acessíveis ao utilizador. */
  ageGroups: AgeGroupEntry[];
  /** ID do escalão actualmente seleccionado (null = usar default do servidor). */
  selectedAgeGroupId: string | null;
  /** Altera o escalão seleccionado e persiste em localStorage. */
  setSelectedAgeGroupId: (id: string) => void;
  /** True quando o utilizador é club_coordinator e tem mais do que um escalão. */
  showAgeGroupSelector: boolean;
};

const AgeGroupContext = createContext<AgeGroupContextValue>({
  ageGroups: [],
  selectedAgeGroupId: null,
  setSelectedAgeGroupId: () => {},
  showAgeGroupSelector: false,
});

interface AgeGroupProviderProps {
  children: ReactNode;
  /** Lista de escalões vinda do servidor (allAgeGroups do me/context). */
  ageGroups: AgeGroupEntry[];
  /** Source do utilizador — selector apenas visível para club_coordinator. */
  source: string | null;
  /** ID do escalão default resolvido pelo servidor. */
  defaultAgeGroupId: string | null;
}

export function AgeGroupProvider({
  children,
  ageGroups,
  source,
  defaultAgeGroupId,
}: AgeGroupProviderProps) {
  const isClubCoordinator = source === "club_coordinator";
  const showAgeGroupSelector = isClubCoordinator && ageGroups.length > 1;

  const [selectedAgeGroupId, setSelectedAgeGroupIdState] = useState<string | null>(() => {
    // Inicializar a partir de localStorage (só client-side)
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored && ageGroups.some((ag) => ag.id === stored)) {
        return stored;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const setSelectedAgeGroupId = useCallback((id: string) => {
    setSelectedAgeGroupIdState(id);
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  // Escalão efectivo: seleccionado (se ainda acessível) > default do servidor
  const validSelectedId =
    selectedAgeGroupId && ageGroups.some((ag) => ag.id === selectedAgeGroupId)
      ? selectedAgeGroupId
      : null;
  const effectiveSelectedId = validSelectedId ?? defaultAgeGroupId;

  const value = useMemo<AgeGroupContextValue>(
    () => ({
      ageGroups,
      selectedAgeGroupId: effectiveSelectedId,
      setSelectedAgeGroupId,
      showAgeGroupSelector,
    }),
    [ageGroups, effectiveSelectedId, setSelectedAgeGroupId, showAgeGroupSelector],
  );

  return <AgeGroupContext.Provider value={value}>{children}</AgeGroupContext.Provider>;
}

export function useAgeGroup(): AgeGroupContextValue {
  return useContext(AgeGroupContext);
}
