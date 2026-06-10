"use client";

import { Loader2, X } from "lucide-react";
import { type PlayerWithStatus, getPlayerCardMeta } from "@/components/games/detail/types";
import { useAgeGroup } from "@/contexts/AgeGroupContext";

interface ConvocatedRowProps {
  player: PlayerWithStatus;
  isGk: boolean;
  isStarter: boolean;
  onToggleLineup: () => void;
  onRemove: () => void;
  savingToggle: boolean;
  savingLineup: boolean;
  disabled: boolean;
}

export function ConvocatedRow({
  player,
  isGk,
  isStarter,
  onToggleLineup,
  onRemove,
  savingToggle,
  savingLineup,
  disabled,
}: ConvocatedRowProps) {
  const badgeLabel = isGk ? "GR" : isStarter ? "Titular" : "Suplente";
  const playerMeta = getPlayerCardMeta(player);

  // Distincao visual: cross-age (atleta de outro escalao do clube) tem badge
  // com nome do escalao de origem; externo (free-text sem registo) mantem
  // tag "(externo)" actual. Atletas do escalao actual sem badge.
  const { ageGroups } = useAgeGroup();
  const sourceAgeGroupName =
    player.sourceAgeGroupId && !player.isExternal
      ? (ageGroups.find((ag) => ag.id === player.sourceAgeGroupId)?.name ?? null)
      : null;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl mb-1.5 border-2 ${
        isStarter ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-white"
      }`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          isGk
            ? "bg-yellow-500 text-white"
            : isStarter
              ? "bg-blue-500 text-white"
              : "bg-slate-200 text-slate-500"
        }`}
      >
        {player.jersey_number || "—"}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`font-medium text-sm truncate ${isStarter ? "text-blue-900" : "text-slate-700"}`}
        >
          {player.first_name} {player.last_name}
          {sourceAgeGroupName && (
            <span className="ml-1.5 align-middle text-[10px] font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
              {sourceAgeGroupName}
            </span>
          )}
          {player.isExternal && (
            <span className="ml-1.5 align-middle text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
              Externo
            </span>
          )}
        </p>
        {playerMeta && <p className="text-xs text-slate-400">{playerMeta}</p>}
        {player.sameDayConflictLabel ? (
          <p className="text-xs text-red-600">{player.sameDayConflictLabel}</p>
        ) : player.sameDayInfoLabel ? (
          <p className="text-xs text-amber-600">{player.sameDayInfoLabel}</p>
        ) : null}
      </div>
      {/* Toggle lineup badge — hit area 44px de altura via before:-inset-y (pill 26px + 9px por lado) */}
      <button
        onClick={onToggleLineup}
        disabled={savingLineup || disabled}
        className={`relative text-xs font-semibold px-2.5 py-1 min-w-11 rounded-full flex-shrink-0 transition-colors before:absolute before:-inset-y-[9px] before:inset-x-0 before:content-[''] ${
          isGk
            ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
            : isStarter
              ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        }`}
      >
        {savingLineup ? "..." : badgeLabel}
      </button>
      {/* Remove from convocatória — accao de campo, alvo 44x44 (margem negativa para nao crescer a linha) */}
      <button
        onClick={onRemove}
        disabled={savingToggle || disabled}
        className="flex h-11 w-11 -my-2 items-center justify-center hover:bg-red-50 rounded-lg group flex-shrink-0"
        title="Remover da convocatória"
      >
        {savingToggle ? (
          <Loader2 size={14} className="text-slate-300 animate-spin" />
        ) : (
          <X
            size={14}
            className="text-slate-200 group-hover:text-red-400 transition-colors"
          />
        )}
      </button>
    </div>
  );
}
