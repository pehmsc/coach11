"use client";

import { useMemo } from "react";
import {
  Users,
  Shield,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConvocatedRow } from "@/components/games/detail/ConvocatedRow";
import {
  type PlayerWithStatus,
  FORMATIONS_BY_FORMAT,
  getPlayerCardMeta,
  isGkPlayer,
} from "@/components/games/detail/types";
import { sortSquadForReport } from "@/lib/games/sort-squad-for-report";

interface ConvocationSectionProps {
  players: PlayerWithStatus[];
  lineupStatuses: Record<string, "on_field" | "substitute">;
  footballFormat: string | null;
  tacticalSystem: string | null;
  saving: string | null;
  savingLineupPlayer: string | null;
  savingTactical: boolean;
  convocatedCount: number;
  effectiveConvocationStatus: "draft" | "published";
  isEditingConfirmedConvocation: boolean;
  canEditConvocationContent: boolean;
  canReopenConfirmedConvocation: boolean;
  convocationEditable: boolean;
  isCompetition: boolean;
  error: string | null;
  onTogglePlayer: (player: PlayerWithStatus) => void;
  onToggleLineup: (playerId: string) => void;
  onTacticalChange: (formation: string) => void;
  onReopenConvocation: () => void;
  onShowExternalPlayerModal: () => void;
}

export function ConvocationSection({
  players,
  lineupStatuses,
  footballFormat,
  tacticalSystem,
  saving,
  savingLineupPlayer,
  savingTactical,
  convocatedCount,
  effectiveConvocationStatus,
  isEditingConfirmedConvocation,
  canEditConvocationContent,
  canReopenConfirmedConvocation,
  convocationEditable,
  isCompetition,
  error,
  onTogglePlayer,
  onToggleLineup,
  onTacticalChange,
  onReopenConvocation,
  onShowExternalPlayerModal,
}: ConvocationSectionProps) {
  const convocatedPlayers = players.filter((p) => p.isConvocated);

  // Ordenacao consistente com <PreMatchLineup> e PDF (sortSquadForReport):
  // 1) GR no topo de cada grupo
  // 2) jersey_number ASC (null/undefined no fim)
  // 3) Fallback alfabetico por nome
  // O lineupLabel e fixo dentro de cada array — a separacao Titular/Banco
  // ja foi feita pelos filters acima.
  const starters = useMemo(
    () =>
      sortSquadForReport(
        convocatedPlayers
          .filter((p) => lineupStatuses[p.id] === "on_field")
          .map((p) => ({
            ...p,
            lineupLabel: "Titular",
            name: `${p.first_name} ${p.last_name}`.trim(),
          })),
      ),
    [convocatedPlayers, lineupStatuses],
  );

  const subs = useMemo(
    () =>
      sortSquadForReport(
        convocatedPlayers
          .filter(
            (p) =>
              lineupStatuses[p.id] === "substitute" || !lineupStatuses[p.id],
          )
          .map((p) => ({
            ...p,
            lineupLabel: "Banco",
            name: `${p.first_name} ${p.last_name}`.trim(),
          })),
      ),
    [convocatedPlayers, lineupStatuses],
  );

  const notConvocated = players.filter((p) => !p.isConvocated);

  const showGkWarning =
    starters.length > 0 && !starters.some((p) => isGkPlayer(p));

  return (
    <>
      {/* Convocatória */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-slate-600" />
          <h2 className="font-bold text-slate-900">Convocatória</h2>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="text-left sm:text-right">
            <span className="text-sm text-slate-500 block">
              {convocatedCount} convocado{convocatedCount !== 1 ? "s" : ""}
            </span>
            <span
              className={`text-[11px] font-semibold ${
                effectiveConvocationStatus === "published"
                  ? "text-emerald-600"
                  : "text-amber-600"
              }`}
            >
              {effectiveConvocationStatus === "published"
                ? "Guardada"
                : isEditingConfirmedConvocation
                  ? "A editar"
                  : "Rascunho"}
            </span>
          </div>
          {canReopenConfirmedConvocation && (
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full sm:w-auto"
              size="sm"
              onClick={onReopenConvocation}
            >
              Editar convocatória
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-3 border border-red-200">
          {error}
        </div>
      )}

      {players.length === 0 ? (
        <div className="text-center py-10">
          <Users size={36} className="text-slate-200 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">
            Sem jogadores ativos no escalão.
          </p>
        </div>
      ) : (
        <>
          {/* Titulares */}
          {starters.length > 0 && (
            <div className="mb-1">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide px-1 mb-2">
                Titulares · {starters.length}
                {footballFormat ? `/${footballFormat}` : ""}
              </p>
              {starters.map((player) => (
                <ConvocatedRow
                  key={player.id}
                  player={player}
                  isGk={isGkPlayer(player)}
                  isStarter={true}
                  onToggleLineup={() => void onToggleLineup(player.id)}
                  onRemove={() => void onTogglePlayer(player)}
                  savingToggle={saving === player.id}
                  savingLineup={savingLineupPlayer === player.id}
                  disabled={!canEditConvocationContent}
                />
              ))}
            </div>
          )}

          {/* GK warning */}
          {showGkWarning && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-medium">
                Nenhum GR no onze inicial
              </p>
            </div>
          )}

          {/* Suplentes */}
          {subs.length > 0 && (
            <div className="mb-1 mt-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 mb-2">
                Suplentes · {subs.length}
              </p>
              {subs.map((player) => (
                <ConvocatedRow
                  key={player.id}
                  player={player}
                  isGk={false}
                  isStarter={false}
                  onToggleLineup={() => void onToggleLineup(player.id)}
                  onRemove={() => void onTogglePlayer(player)}
                  savingToggle={saving === player.id}
                  savingLineup={savingLineupPlayer === player.id}
                  disabled={!canEditConvocationContent}
                />
              ))}
            </div>
          )}

          {/* Sistema Táctico (only when there are starters) */}
          {starters.length > 0 &&
            footballFormat &&
            (FORMATIONS_BY_FORMAT[footballFormat] ?? []).length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Sistema Táctico · Futebol {footballFormat}
                </p>
                <Select
                  value={tacticalSystem ?? "__none__"}
                  onValueChange={(v) =>
                    void onTacticalChange(v === "__none__" ? "" : v)
                  }
                  disabled={savingTactical || !canEditConvocationContent}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleciona a formação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      Sem formação definida
                    </SelectItem>
                    {(FORMATIONS_BY_FORMAT[footballFormat] ?? []).map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

          {/* Disponíveis (not yet convocated) */}
          {(notConvocated.length > 0 || convocationEditable) && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide px-1 mb-2">
                Disponíveis · {notConvocated.length}
              </p>
              <button
                type="button"
                onClick={onShowExternalPlayerModal}
                disabled={!canEditConvocationContent}
                className={`w-full flex items-center gap-3 p-3 rounded-xl mb-1.5 text-left border-2 transition-colors ${
                  canEditConvocationContent
                    ? "border-emerald-200 bg-emerald-50 hover:border-emerald-300 hover:bg-emerald-100"
                    : "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-base font-bold flex-shrink-0">
                  +
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700">Adicionar jogador</p>
                  <p className="text-xs text-slate-500">
                    Atleta de outro escalão ou externo sem registo
                  </p>
                </div>
                <div className="w-6 h-6 rounded-full border-2 border-emerald-300 bg-white/80 flex-shrink-0" />
              </button>
              {notConvocated.map((player) => (
                <button
                  key={player.id}
                  onClick={() => void onTogglePlayer(player)}
                  disabled={
                    saving === player.id ||
                    player.isBlocked ||
                    !canEditConvocationContent
                  }
                  className={`w-full flex items-center gap-3 p-3 rounded-xl mb-1.5 text-left border-2 transition-colors ${
                    player.isBlocked
                      ? "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
                      : "border-slate-100 bg-white hover:border-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {player.jersey_number || "—"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-600 truncate">
                      {player.first_name} {player.last_name}
                    </p>
                    {getPlayerCardMeta(player) && (
                      <p className="text-xs text-slate-400">
                        {getPlayerCardMeta(player)}
                      </p>
                    )}
                    {player.sameDayConflictLabel ? (
                      <p className="text-xs text-red-600">
                        {player.sameDayConflictLabel}
                      </p>
                    ) : player.sameDayInfoLabel ? (
                      <p className="text-xs text-amber-600">
                        {player.sameDayInfoLabel}
                      </p>
                    ) : null}
                  </div>
                  {saving === player.id ? (
                    <Loader2
                      size={16}
                      className="text-slate-400 animate-spin flex-shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-slate-200 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {isCompetition && (
            <p className="text-xs text-slate-400 text-center mt-4">
              Jogadores com jogo de competição no mesmo dia não podem ser
              convocados.
            </p>
          )}
        </>
      )}
    </>
  );
}
