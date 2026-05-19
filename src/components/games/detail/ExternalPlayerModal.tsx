"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgeGroup } from "@/contexts/AgeGroupContext";
import { normalizeForSearch } from "@/lib/games/normalize-search";
import type { GameEditorState } from "@/lib/hooks/useGameEditor";
import type { Player } from "@/types/database";

interface ExternalPlayerModalProps {
  editor: GameEditorState;
  /** ID do escalão deste jogo — excluído do select cross-age. */
  currentAgeGroupId: string;
  /** IDs dos atletas já convocados — filtrados da lista cross-age. */
  alreadyConvocatedPlayerIds: Set<string>;
  /** Submit do form no modo "Externo (texto livre)". 1 jogador por chamada. */
  onSubmitExternalFreeText: (e: { preventDefault(): void }) => void;
  /** Click do botão "Concluído" no modo "Atleta do clube". Recebe N player_ids. */
  onSubmitClubBatch: (playerIds: string[]) => void | Promise<void>;
}

export function ExternalPlayerModal({
  editor,
  currentAgeGroupId,
  alreadyConvocatedPlayerIds,
  onSubmitExternalFreeText,
  onSubmitClubBatch,
}: ExternalPlayerModalProps) {
  const { ageGroups } = useAgeGroup();

  const otherAgeGroups = useMemo(
    () => ageGroups.filter((ag) => ag.id !== currentAgeGroupId),
    [ageGroups, currentAgeGroupId],
  );

  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  const {
    externalPlayerMode,
    crossAgeSelectedAgeGroupId,
    crossAgeSearchQuery,
    crossAgeSelectedPlayerIds,
    setCrossAgeSearchQuery,
    setCrossAgeSelectedPlayerIds,
  } = editor;

  // Carregar atletas quando o escalão muda (modo "club").
  useEffect(() => {
    if (externalPlayerMode !== "club") return;
    if (!crossAgeSelectedAgeGroupId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlayers([]);
      return;
    }
    setLoadingPlayers(true);
    fetch(`/api/players?ageGroupId=${crossAgeSelectedAgeGroupId}`)
      .then((res) => res.json())
      .then((payload) => {
        const raw = (payload?.players ?? []) as Player[];
        setPlayers(raw.filter((p) => !alreadyConvocatedPlayerIds.has(p.id)));
      })
      .catch(() => setPlayers([]))
      .finally(() => setLoadingPlayers(false));
  }, [externalPlayerMode, crossAgeSelectedAgeGroupId, alreadyConvocatedPlayerIds]);

  // Mudar escalão limpa search e selecção (decisão UX: selecção pertence
  // ao escalão escolhido — saltar para outro deve recomeçar).
  useEffect(() => {
    setCrossAgeSearchQuery("");
    setCrossAgeSelectedPlayerIds(new Set());
  }, [crossAgeSelectedAgeGroupId, setCrossAgeSearchQuery, setCrossAgeSelectedPlayerIds]);

  const filteredPlayers = useMemo(() => {
    const q = normalizeForSearch(crossAgeSearchQuery.trim());
    if (!q) return players;
    return players.filter((p) => {
      const fullName = normalizeForSearch(`${p.first_name} ${p.last_name}`);
      return fullName.includes(q);
    });
  }, [players, crossAgeSearchQuery]);

  function togglePlayerSelection(playerId: string, checked: boolean) {
    const next = new Set(crossAgeSelectedPlayerIds);
    if (checked) next.add(playerId);
    else next.delete(playerId);
    setCrossAgeSelectedPlayerIds(next);
  }

  const selectedCount = crossAgeSelectedPlayerIds.size;
  const canSubmitFreeText =
    editor.externalPlayerName.trim().length >= 2 &&
    editor.externalPlayerNumber.trim() !== "" &&
    editor.externalPlayerPosition.trim() !== "";

  function handleConcluidoClick() {
    if (selectedCount === 0 || editor.savingExternalPlayer) return;
    void onSubmitClubBatch(Array.from(crossAgeSelectedPlayerIds));
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 px-4 pt-4 pb-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+0.75rem)] md:items-center md:p-4"
      onClick={editor.closeExternalPlayerModal}
    >
      <div
        className="min-w-0 overflow-x-hidden bg-white rounded-2xl w-full max-w-md shadow-xl h-[calc(100dvh-var(--mobile-footer-height)-env(safe-area-inset-bottom)-1rem)] md:h-auto md:max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-slate-900">Adicionar jogador</h3>
          <button
            onClick={editor.closeExternalPlayerModal}
            disabled={editor.savingExternalPlayer}
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form
          onSubmit={onSubmitExternalFreeText}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div
            className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5 [overflow-wrap:anywhere]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {/* Toggle modo */}
            <div className="inline-flex w-full bg-slate-100 rounded-lg p-1 mb-4">
              <button
                type="button"
                onClick={() => editor.setExternalPlayerMode("club")}
                disabled={editor.savingExternalPlayer}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  externalPlayerMode === "club"
                    ? "bg-white text-slate-900 shadow-sm font-semibold"
                    : "text-slate-600"
                }`}
              >
                Atleta do clube
              </button>
              <button
                type="button"
                onClick={() => editor.setExternalPlayerMode("free_text")}
                disabled={editor.savingExternalPlayer}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  externalPlayerMode === "free_text"
                    ? "bg-white text-slate-900 shadow-sm font-semibold"
                    : "text-slate-600"
                }`}
              >
                Externo
              </button>
            </div>

            {externalPlayerMode === "club" && (
              <>
                {otherAgeGroups.length === 0 ? (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertCircle
                      size={16}
                      className="text-amber-600 flex-shrink-0 mt-0.5"
                    />
                    <p className="text-xs text-amber-800">
                      Não há outros escalões no clube. Para adicionar um
                      jogador sem registo, usa &quot;Externo&quot;.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1 mb-4">
                      <label className="text-sm font-medium text-slate-700">
                        Escalão
                      </label>
                      <select
                        value={crossAgeSelectedAgeGroupId ?? ""}
                        onChange={(e) =>
                          editor.setCrossAgeSelectedAgeGroupId(
                            e.target.value || null,
                          )
                        }
                        disabled={editor.savingExternalPlayer}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                      >
                        <option value="">— Escolher escalão —</option>
                        {otherAgeGroups.map((ag) => (
                          <option key={ag.id} value={ag.id}>
                            {ag.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">
                        Atletas
                      </label>
                      <div className="relative">
                        <Search
                          size={14}
                          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          value={crossAgeSearchQuery}
                          onChange={(e) =>
                            setCrossAgeSearchQuery(e.target.value)
                          }
                          onKeyDown={(e) => {
                            // Enter dentro da search dispararia o submit do form
                            // (que e o handler do modo "Externo"). Em modo "club"
                            // o submit vem do botao "Concluido", logo prevenimos.
                            if (e.key === "Enter") e.preventDefault();
                          }}
                          disabled={
                            !crossAgeSelectedAgeGroupId ||
                            editor.savingExternalPlayer
                          }
                          placeholder={
                            crossAgeSelectedAgeGroupId
                              ? "Pesquisar por nome…"
                              : "Escolhe primeiro um escalão…"
                          }
                          className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm disabled:bg-slate-50"
                        />
                      </div>

                      {crossAgeSelectedAgeGroupId && (
                        <div className="mt-2 max-h-[260px] overflow-y-auto border border-slate-200 rounded-lg bg-slate-50/50">
                          {loadingPlayers ? (
                            <div className="flex items-center justify-center gap-2 p-4 text-xs text-slate-500">
                              <Loader2 size={12} className="animate-spin" />
                              A carregar…
                            </div>
                          ) : filteredPlayers.length === 0 ? (
                            <p className="text-center p-6 text-xs text-slate-400 italic">
                              {crossAgeSearchQuery.trim()
                                ? `Nenhum atleta corresponde a "${crossAgeSearchQuery.trim()}"`
                                : "Nenhum atleta disponível neste escalão (todos já convocados ou plantel vazio)"}
                            </p>
                          ) : (
                            filteredPlayers.map((player) => {
                              const isSelected =
                                crossAgeSelectedPlayerIds.has(player.id);
                              const isInactive = player.status !== "active";
                              const statusIcon =
                                player.status === "injured"
                                  ? "🤕"
                                  : player.status === "suspended"
                                    ? "🚫"
                                    : null;
                              return (
                                <label
                                  key={player.id}
                                  className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 cursor-pointer hover:bg-slate-100/60 ${
                                    isSelected ? "bg-blue-50" : ""
                                  } ${isInactive ? "opacity-70" : ""} ${
                                    editor.savingExternalPlayer
                                      ? "cursor-not-allowed opacity-60"
                                      : ""
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) =>
                                      togglePlayerSelection(
                                        player.id,
                                        e.target.checked,
                                      )
                                    }
                                    disabled={editor.savingExternalPlayer}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                                  />
                                  <span
                                    className={`text-xs font-bold min-w-[28px] text-center px-2 py-0.5 rounded ${
                                      player.jersey_number == null
                                        ? "border border-dashed border-slate-300 text-slate-300"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {player.jersey_number ?? "—"}
                                  </span>
                                  <span className="flex-1 text-sm text-slate-900">
                                    {player.first_name} {player.last_name}
                                    {statusIcon && (
                                      <span
                                        className="ml-1"
                                        title={
                                          player.status === "injured"
                                            ? "Lesionado"
                                            : "Suspenso"
                                        }
                                      >
                                        {statusIcon}
                                      </span>
                                    )}
                                  </span>
                                  {player.preferred_position && (
                                    <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                                      {player.preferred_position}
                                    </span>
                                  )}
                                </label>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {externalPlayerMode === "free_text" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Nome *
                  </label>
                  <input
                    type="text"
                    value={editor.externalPlayerName}
                    onChange={(event) =>
                      editor.setExternalPlayerName(event.target.value)
                    }
                    placeholder="Nome do jogador"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Número *
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={editor.externalPlayerNumber}
                      onChange={(event) =>
                        editor.setExternalPlayerNumber(event.target.value)
                      }
                      placeholder="0-99"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Posição *
                    </label>
                    <input
                      type="text"
                      value={editor.externalPlayerPosition}
                      onChange={(event) =>
                        editor.setExternalPlayerPosition(event.target.value)
                      }
                      placeholder="Ex: Médio"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Este jogador fica apenas nesta convocatória e não é
                  adicionado ao plantel.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t bg-white p-5 pt-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {externalPlayerMode === "club" ? (
              <>
                <Button
                  type="button"
                  onClick={handleConcluidoClick}
                  disabled={
                    selectedCount === 0 || editor.savingExternalPlayer
                  }
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {editor.savingExternalPlayer ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    `Concluído${selectedCount > 0 ? ` (${selectedCount})` : ""}`
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={editor.closeExternalPlayerModal}
                  disabled={editor.savingExternalPlayer}
                >
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="submit"
                  disabled={!canSubmitFreeText || editor.savingExternalPlayer}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {editor.savingExternalPlayer ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Adicionar"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={editor.closeExternalPlayerModal}
                  disabled={editor.savingExternalPlayer}
                >
                  Cancelar
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
