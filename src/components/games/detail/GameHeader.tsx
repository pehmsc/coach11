"use client";

import { Clock, MapPin, Pencil, Trash2 } from "lucide-react";
import { formatFixtureOpponentLabel } from "@/lib/games/display";
import type { Game } from "@/types/database";

interface GameHeaderProps {
  game: Game;
  gameDate: string;
  gameLocationLabel: string | null;
  canEditCompleted: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function GameHeader({
  game,
  gameDate,
  gameLocationLabel,
  canEditCompleted,
  onEdit,
  onDelete,
}: GameHeaderProps) {
  const isCompetition = !!game.competition_id;

  return (
    <div className="rounded-2xl bg-blue-600 text-white p-5 mb-5 relative">
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {game.status !== "completed" && (
          <button
            onClick={onEdit}
            className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            title="Editar jogo"
          >
            <Pencil size={14} />
          </button>
        )}
        {game.status !== "completed" && canEditCompleted && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors"
            title="Apagar jogo"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
          {game.is_home ? "Casa" : "Fora"}
        </span>
        {isCompetition && (
          <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
            Competição
          </span>
        )}
        {!isCompetition && (
          <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
            Amigável
          </span>
        )}
        {game.title && (
          <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
            {game.title}
          </span>
        )}
      </div>
      <h1 className="text-xl font-bold mt-1">
        {game.opponent_name
          ? formatFixtureOpponentLabel({
              isHome: game.is_home,
              opponentName: game.opponent_name,
              opponentShortName: game.opponent_short_name,
            })
          : "Jogo"}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-blue-100">
        <span className="flex items-center gap-1">
          <Clock size={13} /> <span className="capitalize">{gameDate}</span>
        </span>
        {gameLocationLabel && (
          <span className="flex items-center gap-1">
            <MapPin size={13} /> {gameLocationLabel}
          </span>
        )}
      </div>
      {game.location_address && game.location_address !== gameLocationLabel && (
        <p className="mt-2 text-sm text-blue-100/90">{game.location_address}</p>
      )}
    </div>
  );
}
