"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Loader2, Palette, ChevronDown, ChevronUp } from "lucide-react";
import type { KitNumber, KitPiece, PlayerType, PieceType } from "@/components/team/setup/types";
import {
  KIT_NUMBERS,
  KIT_LABELS,
  PIECE_TYPES,
  PIECE_LABELS,
  PLAYER_TYPES,
  PLAYER_TYPE_LABELS,
  normalizeColorHex,
} from "@/components/team/setup/types";

interface KitsSectionProps {
  kitStatusMessage: string | null;
  kitsExpanded: boolean;
  setKitsExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
  kitColors: Record<string, string>;
  setKitColors: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  savingKit: string | null;
  kitSaveTimers: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>;
  getKitPiece: (kitNum: KitNumber, playerType: PlayerType, pieceType: PieceType) => KitPiece | undefined;
  handleKitColorChange: (kitNum: KitNumber, playerType: PlayerType, pieceType: PieceType, colorHex: string) => void;
}

export function KitsSection({
  kitStatusMessage,
  kitsExpanded,
  setKitsExpanded,
  kitColors,
  setKitColors,
  savingKit,
  kitSaveTimers,
  getKitPiece,
  handleKitColorChange,
}: KitsSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette size={16} /> Kits da Equipa
            </CardTitle>
            <CardDescription>
              Define as cores de cada kit (campo e guarda-redes)
            </CardDescription>
            {kitStatusMessage && (
              <p className="text-xs text-emerald-600 mt-1">{kitStatusMessage}</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setKitsExpanded((v: boolean) => !v)}
          >
            {kitsExpanded ? (
              <>
                <ChevronUp size={14} className="mr-1" /> Recolher
              </>
            ) : (
              <>
                <ChevronDown size={14} className="mr-1" /> Expandir
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {kitsExpanded && (
        <CardContent className="space-y-6">
          {KIT_NUMBERS.map((kitNum) => (
            <div key={kitNum}>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">
                {KIT_LABELS[kitNum]}
              </h4>
              <div className="space-y-4">
                {PLAYER_TYPES.map((playerType) => (
                  <div key={playerType}>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                      {PLAYER_TYPE_LABELS[playerType]}
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {PIECE_TYPES.map((pieceType) => {
                        const piece = getKitPiece(kitNum, playerType, pieceType);
                        const key = `${kitNum}-${playerType}-${pieceType}`;
                        const displayColor = kitColors[key] ?? normalizeColorHex(piece?.color_hex);
                        return (
                          <div key={pieceType} className="space-y-1">
                            <Label className="text-xs text-slate-500">
                              {PIECE_LABELS[pieceType]}
                            </Label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={displayColor}
                                onChange={(e) => {
                                  const newColor = e.target.value;
                                  setKitColors((prev: Record<string, string>) => ({ ...prev, [key]: newColor }));
                                  // Debounce: cancel any pending save and schedule a new one
                                  const existing = kitSaveTimers.current.get(key);
                                  if (existing) clearTimeout(existing);
                                  const timer = setTimeout(() => {
                                    void handleKitColorChange(kitNum, playerType, pieceType, newColor);
                                    kitSaveTimers.current.delete(key);
                                  }, 600);
                                  kitSaveTimers.current.set(key, timer);
                                }}
                                onBlur={(e) => {
                                  // Cancel debounce and save immediately on blur
                                  const existing = kitSaveTimers.current.get(key);
                                  if (existing) {
                                    clearTimeout(existing);
                                    kitSaveTimers.current.delete(key);
                                  }
                                  void handleKitColorChange(kitNum, playerType, pieceType, e.target.value);
                                }}
                                className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                                title={`${KIT_LABELS[kitNum]} · ${PLAYER_TYPE_LABELS[playerType]} · ${PIECE_LABELS[pieceType]}`}
                              />
                              <span className="text-xs text-slate-400 font-mono">
                                {savingKit === key ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  displayColor.toUpperCase()
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {kitNum < 3 && <hr className="mt-4 border-slate-100" />}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
