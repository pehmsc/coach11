"use client";

import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type KitPieceRow,
  type KitSelection,
  UI_PIECE_TYPES,
  PIECE_LABEL,
  getKitColor,
} from "@/components/games/detail/types";

interface KitEditorSectionProps {
  kitEditorOpen: boolean;
  kitSelection: KitSelection;
  kitDraftSelection: KitSelection;
  kitById: Map<string, KitPieceRow>;
  savingKitSelection: boolean;
  hasKitDraftChanges: boolean;
  canEditKit: boolean;
  onOpenEditor: () => void;
  onCloseEditor: () => void;
  onDraftChange: (field: keyof KitSelection, value: string) => void;
  onSave: () => void;
  getKitOptions: (
    playerType: "field" | "goalkeeper",
    pieceType: (typeof UI_PIECE_TYPES)[number],
    preferredId?: string | null,
  ) => KitPieceRow[];
}

export function KitEditorSection({
  kitEditorOpen,
  kitSelection,
  kitDraftSelection,
  kitById,
  savingKitSelection,
  hasKitDraftChanges,
  canEditKit,
  onOpenEditor,
  onCloseEditor,
  onDraftChange,
  onSave,
  getKitOptions,
}: KitEditorSectionProps) {
  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">Equipamento do jogo</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Seleciona camisola, calções e meias de forma independente.
          </p>
        </div>
        {kitEditorOpen ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCloseEditor}
            disabled={savingKitSelection}
          >
            Fechar
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenEditor}
            disabled={!canEditKit}
          >
            Editar kit
          </Button>
        )}
      </div>

      {!kitEditorOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              title: "Jogadores de campo",
              prefix: "fp" as const,
            },
            {
              title: "Guarda-redes",
              prefix: "gk" as const,
            },
          ].map((section) => (
            <div
              key={section.prefix}
              className="rounded-lg border border-slate-100 bg-slate-50 p-3"
            >
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {section.title}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {UI_PIECE_TYPES.map((pieceType) => {
                  const field =
                    `${section.prefix}_${pieceType === "shirt" ? "jersey" : pieceType}_kit_id` as keyof KitSelection;
                  const selectedPiece = kitById.get(
                    kitSelection[field] || "",
                  );

                  return (
                    <span
                      key={`${section.prefix}-${pieceType}`}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-600"
                    >
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-slate-300"
                        style={{
                          backgroundColor: getKitColor(selectedPiece),
                        }}
                      />
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {kitEditorOpen &&
        [
          {
            title: "Jogadores de campo",
            playerType: "field" as const,
            prefix: "fp" as const,
          },
          {
            title: "Guarda-redes",
            playerType: "goalkeeper" as const,
            prefix: "gk" as const,
          },
        ].map((section) => (
          <div key={section.prefix} className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {section.title}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {UI_PIECE_TYPES.map((pieceType) => {
                const field =
                  `${section.prefix}_${pieceType === "shirt" ? "jersey" : pieceType}_kit_id` as keyof KitSelection;
                const selectedValue = kitDraftSelection[field];
                const options = getKitOptions(
                  section.playerType,
                  pieceType,
                  selectedValue,
                );
                const hasSelectedOption = !selectedValue
                  ? true
                  : options.some((option) => option.id === selectedValue);

                return (
                  <div key={pieceType} className="space-y-1">
                    <label className="text-xs text-slate-500">
                      {PIECE_LABEL[pieceType]}
                    </label>
                    <Select
                      value={selectedValue ?? "__none__"}
                      onValueChange={(value) =>
                        onDraftChange(field, value)
                      }
                      disabled={savingKitSelection}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Sem seleção" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem seleção</SelectItem>
                        {!hasSelectedOption && selectedValue && (
                          <SelectItem value={selectedValue}>
                            Seleção atual (indisponível)
                          </SelectItem>
                        )}
                        {options.map((piece) => (
                          <SelectItem key={piece.id} value={piece.id}>
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="inline-block h-3 w-3 rounded-full border border-slate-300"
                                style={{
                                  backgroundColor: getKitColor(piece),
                                }}
                              />
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {kitEditorOpen && (
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            className="bg-slate-900 hover:bg-slate-800"
            onClick={onSave}
            disabled={savingKitSelection || !hasKitDraftChanges}
          >
            {savingKitSelection ? (
              <Loader2 size={15} className="mr-2 animate-spin" />
            ) : (
              <Check size={15} className="mr-2" />
            )}
            Guardar equipamento
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCloseEditor}
            disabled={savingKitSelection}
          >
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
