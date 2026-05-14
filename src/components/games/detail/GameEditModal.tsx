"use client";

import { AlertCircle, Loader2, X } from "lucide-react";
import { EMPTY_LOCATION_FIELDS } from "@/lib/location";
import { normalizeManualShortName } from "@/lib/football/short-name";
import { LocationFields } from "@/components/maps/LocationFields";
import { NotesEditor } from "@/components/forms/NotesEditor";
import { EventImagePicker } from "@/components/media/EventImagePicker";
import { OpponentTypeahead } from "@/components/opponents/OpponentTypeahead";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";
import type { Game } from "@/types/database";
import type { GameEditorState } from "@/lib/hooks/useGameEditor";

interface GameEditModalProps {
  game: Game;
  error: string | null;
  editor: GameEditorState;
}

export function GameEditModal({ game, error, editor }: GameEditModalProps) {
  const onClose = () => editor.setEditingGame(false);
  const isEditingCompletedGame = game.status === "completed";
  const { football_format: footballFormat } = useAgeGroupMeta(
    game.age_group_id ?? null,
  );

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center px-4 pt-4 pb-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+0.75rem)] md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="min-w-0 overflow-x-hidden bg-white rounded-2xl w-full max-w-md shadow-xl h-[calc(100dvh-var(--mobile-footer-height)-env(safe-area-inset-bottom)-1rem)] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-slate-900">
            {isEditingCompletedGame ? "Editar jogo (concluído)" : "Editar jogo"}
          </h3>
          <button onClick={onClose}>
            <X size={20} className="text-slate-400" />
          </button>
        </div>
        <form onSubmit={editor.handleSaveGameEdit} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-4 [overflow-wrap:anywhere]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {isEditingCompletedGame && (
              <div
                className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                role="alert"
              >
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">A editar jogo concluído</p>
                  <p className="mt-0.5 text-amber-800">
                    As alterações ficam registadas para auditoria. As estatísticas e o resultado não são afectados por esta edição.
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Jornada / Título
              </label>
              <input
                type="text"
                value={editor.editTitle}
                onChange={(e) => editor.setEditTitle(e.target.value)}
                placeholder="ex: Jornada 3, Taça, Final"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Adversário *
              </label>
              {game.age_group_id ? (
                <OpponentTypeahead
                  ageGroupId={game.age_group_id}
                  footballFormat={footballFormat}
                  value={editor.editOpponentSelection}
                  onChange={editor.setEditOpponentFromTypeahead}
                  initialLegacyName={
                    !editor.editOpponentSelection && editor.editOpponent
                      ? editor.editOpponent
                      : null
                  }
                />
              ) : (
                <input
                  type="text"
                  value={editor.editOpponent}
                  onChange={(e) => editor.setEditOpponent(e.target.value)}
                  placeholder="Nome do adversário"
                  required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Sigla adversário
              </label>
              <input
                type="text"
                value={editor.editOpponentShortName}
                onChange={(e) =>
                  editor.setEditOpponentShortName(
                    normalizeManualShortName(e.target.value, 5) || "",
                  )
                }
                placeholder="ex: SCP"
                maxLength={5}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Data *
                </label>
                <input
                  type="date"
                  value={editor.editDate}
                  onChange={(event) => editor.setEditDate(event.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Início *
                </label>
                <input
                  type="time"
                  value={editor.editStartTime}
                  onChange={(event) => editor.setEditStartTime(event.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Fim
              </label>
              <input
                type="time"
                value={editor.editEndTime}
                onChange={(event) => editor.setEditEndTime(event.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Competição
              </label>
              <select
                value={editor.editCompetitionId}
                onChange={(e) => editor.setEditCompetitionId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Nenhuma (amigável)</option>
                {editor.competitionOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                    {opt.season ? ` · ${opt.season}` : ""}
                    {opt.team_label ? ` · Equipa ${opt.team_label}` : ""}
                    {opt.inactive ? " · Fechada" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Casa ou Fora?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => editor.setEditIsHome(true)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium border-2 transition-colors ${
                    editor.editIsHome
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 text-slate-500"
                  }`}
                >
                  Casa
                </button>
                <button
                  type="button"
                  onClick={() => editor.setEditIsHome(false)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium border-2 transition-colors ${
                    !editor.editIsHome
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-500"
                  }`}
                >
                  Fora
                </button>
              </div>
            </div>
            <LocationFields
              value={{
                ...EMPTY_LOCATION_FIELDS,
                location: editor.editLocation,
                formatted_address: editor.editFormattedAddress,
                latitude: editor.editLatitude,
                longitude: editor.editLongitude,
                osm_place_id: editor.editOsmPlaceId,
                location_source: editor.editLocationSource,
              }}
              onChange={(nextValue) => {
                editor.setEditLocation(nextValue.location);
                editor.setEditFormattedAddress(nextValue.formatted_address);
                editor.setEditLatitude(nextValue.latitude);
                editor.setEditLongitude(nextValue.longitude);
                editor.setEditOsmPlaceId(nextValue.osm_place_id);
                editor.setEditLocationSource(nextValue.location_source);
              }}
              locationLabel="Local"
              locationPlaceholder="Nome do campo ou local"
              accent="blue"
            />
            <EventImagePicker
              ageGroupId={game.age_group_id ?? null}
              value={editor.editImageUrl}
              onChange={editor.setEditImageUrl}
              accent="blue"
            />
            <NotesEditor
              value={editor.editNotes}
              onChange={editor.setEditNotes}
              accent="blue"
              rows={7}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex gap-2 border-t bg-white p-5 pt-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="submit"
              disabled={editor.savingGameEdit}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {editor.savingGameEdit ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                "Guardar"
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 border border-slate-200 rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
