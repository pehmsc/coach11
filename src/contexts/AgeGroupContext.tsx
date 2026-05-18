"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

const LOCAL_STORAGE_KEY = "coach11_selected_age_group_id";
// Valor sentinela guardado no localStorage para representar "Todos os escalões"
const ALL_SENTINEL = "__all__";

// Cookie espelho do localStorage para server components (e.g. /dashboard)
// poderem ler o escalao activo. localStorage continua a ser fonte de verdade
// no client; cookie e cache server-readable.
const COOKIE_KEY = "coach11_active_age_group";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 ano

function writeAgeGroupCookie(value: string | null) {
  if (typeof document === "undefined") return;
  const cookieValue = value ?? "";
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(cookieValue)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

type AgeGroupEntry = { id: string; name: string };

type AgeGroupContextValue = {
  /** Escalões acessíveis ao utilizador. */
  ageGroups: AgeGroupEntry[];
  /**
   * ID do escalão actualmente seleccionado.
   * `null` significa "Todos os escalões acessíveis".
   */
  selectedAgeGroupId: string | null;
  /**
   * Altera o escalão seleccionado e persiste em localStorage.
   * Passar `null` selecciona "Todos os escalões".
   */
  setSelectedAgeGroupId: (id: string | null) => void;
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

  /**
   * Estado interno:
   * - `undefined` → não foi escolhido explicitamente → usar `defaultAgeGroupId`
   * - `null`      → utilizador escolheu "Todos os escalões"
   * - `"uuid"`    → utilizador escolheu um escalão específico
   */
  const [storedSelection, setStoredSelection] = useState<string | null | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    try {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored === ALL_SENTINEL) return null;
      if (stored && ageGroups.some((ag) => ag.id === stored)) return stored;
    } catch {
      // ignore
    }
    return undefined;
  });

  const setSelectedAgeGroupId = useCallback((id: string | null) => {
    setStoredSelection(id);
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, id === null ? ALL_SENTINEL : id);
    } catch {
      // ignore
    }
    writeAgeGroupCookie(id);
  }, []);

  // Escalão efectivo exposto ao contexto
  const effectiveSelectedId: string | null =
    storedSelection === undefined
      ? defaultAgeGroupId  // sem escolha explícita → default do servidor
      : storedSelection;   // null (Todos) ou uuid específico

  // Espelhar o estado efectivo no cookie sempre que mudar (incluindo
  // primeira hidratacao a partir do localStorage). Server components
  // como /dashboard leem este cookie para filtrar a vista por escalao.
  useEffect(() => {
    writeAgeGroupCookie(effectiveSelectedId);
  }, [effectiveSelectedId]);

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
