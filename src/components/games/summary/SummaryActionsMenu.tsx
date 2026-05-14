"use client";

import { useRouter } from "next/navigation";
import {
  Lock,
  Pencil,
  RotateCcw,
  Settings,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type GameStatus = "scheduled" | "live" | "completed" | "cancelled";

interface SummaryActionsMenuProps {
  canEdit: boolean;
  isCoordinator: boolean;
  gameStatus: GameStatus;
  hasAnyManualRow: boolean;
  detailHref: string;
  onEditStats: () => void;
  onResetAuto: () => void;
  onCorrectLineup: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

export function SummaryActionsMenu({
  canEdit,
  isCoordinator,
  gameStatus,
  hasAnyManualRow,
  detailHref,
  onEditStats,
  onResetAuto,
  onCorrectLineup,
  onDelete,
  disabled = false,
}: SummaryActionsMenuProps) {
  const router = useRouter();

  if (!canEdit) return null;

  const statsDisabled = gameStatus === "live" || gameStatus === "scheduled";
  const resetDisabled = !hasAnyManualRow || statsDisabled;
  const showCorrectLineup = isCoordinator && gameStatus === "completed";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label="Acções do sumário"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Settings size={18} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        {isCoordinator && (
          <DropdownMenuItem
            onSelect={() => router.push(`${detailHref}?correction=1`)}
          >
            <RotateCcw size={14} />
            <span>Corrigir convocatória</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={statsDisabled}
          onSelect={(event) => {
            if (statsDisabled) {
              event.preventDefault();
              return;
            }
            onEditStats();
          }}
        >
          <Pencil size={14} />
          <span>Editar Final Stats</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={resetDisabled}
          title={
            !hasAnyManualRow
              ? "Os stats já estão em modo automático."
              : undefined
          }
          onSelect={(event) => {
            if (resetDisabled) {
              event.preventDefault();
              return;
            }
            onResetAuto();
          }}
        >
          <Undo2 size={14} />
          <span>Repor auto-cálculo</span>
        </DropdownMenuItem>
        {showCorrectLineup && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onCorrectLineup()}>
              <Lock size={14} />
              <span>Corrigir titulares</span>
            </DropdownMenuItem>
          </>
        )}
        {isCoordinator && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => onDelete()}>
              <Trash2 size={14} />
              <span>Apagar jogo</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
