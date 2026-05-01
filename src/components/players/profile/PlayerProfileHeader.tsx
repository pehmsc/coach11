"use client";

import { useState } from "react";
import { User, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Player } from "@/types/database";
import { PLAYER_STATUS_CONFIG } from "./status-config";
import { PlayerEditModal } from "./PlayerEditModal";

interface PlayerProfileHeaderProps {
  player: Player;
  canEdit: boolean;
  onSaved?: (updated: Player) => void;
}

export function PlayerProfileHeader({
  player,
  canEdit,
  onSaved,
}: PlayerProfileHeaderProps) {
  const [editOpen, setEditOpen] = useState(false);
  const statusConfig =
    PLAYER_STATUS_CONFIG[player.status] ?? PLAYER_STATUS_CONFIG.active;
  const fullName = `${player.first_name} ${player.last_name}`.trim();

  return (
    <>
      <div className="rounded-2xl border border-slate-100 bg-white p-4 md:p-5">
        <div className="flex items-start gap-4">
          {/* Placeholder visual no lugar da foto (PR 3 substitui). */}
          <div
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 md:h-20 md:w-20"
            aria-hidden="true"
          >
            <User size={32} />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-slate-900 md:text-xl">
              {fullName}
            </h1>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              {player.preferred_position && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {player.preferred_position}
                </span>
              )}
              {typeof player.jersey_number === "number" && (
                <span className="text-xs font-medium text-slate-500">
                  #{player.jersey_number}
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusConfig.color}`}
              >
                {statusConfig.label}
              </span>
            </div>
          </div>

          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              className="flex-shrink-0"
            >
              <Pencil size={14} className="mr-1.5" />
              Editar
            </Button>
          )}
        </div>
      </div>

      <PlayerEditModal
        player={player}
        mode={canEdit ? "edit" : "readonly"}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onSaved}
      />
    </>
  );
}
