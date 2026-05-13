"use client";

import { ChevronDown } from "lucide-react";
import { useActiveScope } from "@/hooks/useActiveScope";
import { cn } from "@/lib/utils";

export type ScopeToggleVariant = "sidebar" | "inline";

type Props = {
  /**
   * Visual variant:
   * - 'sidebar' — dropdown vertical (Sidebar desktop + MobileSideNavDrawer)
   * - 'inline'  — pills horizontais (topo de listas em PR #151+)
   */
  variant?: ScopeToggleVariant;
  className?: string;
  /**
   * Se true, esconde-se quando canToggle === false (single team).
   * Default: true.
   */
  hideWhenSingle?: boolean;
};

/**
 * Selector de scope (Todos os escalões vs escalão específico).
 *
 * Auto-conectado ao useActiveScope (sem props value/onChange).
 * Single source of truth no AgeGroupContext, persistência em localStorage.
 */
export function ScopeToggle({
  variant = "sidebar",
  className,
  hideWhenSingle = true,
}: Props) {
  const { active, availableTeams, canToggle, setGlobal, setTeam } =
    useActiveScope();

  if (hideWhenSingle && !canToggle) {
    return null;
  }

  if (variant === "sidebar") {
    const currentValue = active.scope === "global" ? "" : active.teamId;

    return (
      <div className={cn("px-4 py-3 border-b border-slate-800", className)}>
        <p className="text-slate-500 text-[11px] uppercase tracking-wide mb-1.5">
          Escalão
        </p>
        <div className="relative">
          <select
            aria-label="Selecionar escalão activo"
            value={currentValue}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "") {
                setGlobal();
              } else {
                setTeam(val);
              }
            }}
            className="w-full appearance-none bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 pr-8 border border-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="">Todos os escalões</option>
            {availableTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
        </div>
      </div>
    );
  }

  // variant === "inline"
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1",
        className,
      )}
      role="tablist"
      aria-label="Filtrar por escalão"
    >
      <button
        type="button"
        role="tab"
        aria-selected={active.scope === "global"}
        onClick={setGlobal}
        className={cn(
          "rounded-md px-3 py-1 text-xs font-medium transition-colors",
          active.scope === "global"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-600 hover:text-slate-900",
        )}
      >
        Todos
      </button>
      {availableTeams.map((team) => (
        <button
          key={team.id}
          type="button"
          role="tab"
          aria-selected={active.scope === "team" && active.teamId === team.id}
          onClick={() => setTeam(team.id)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            active.scope === "team" && active.teamId === team.id
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          {team.name}
        </button>
      ))}
    </div>
  );
}
