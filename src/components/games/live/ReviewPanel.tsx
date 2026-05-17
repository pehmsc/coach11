"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info, Star } from "lucide-react";
import { TacticalSystemPicker } from "@/components/games/TacticalSystemPicker";
import type { LivePlayer } from "./types";

interface ReviewPanelProps {
  playersWhoNeedPersistentStats: LivePlayer[];
  playerRatings: Record<string, number>;
  mvpPlayerId: string | null;
  computedMinutes: Map<string, number>;
  concededGoalsByPlayer: Map<string, number>;
  setPlayerRatings: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setMvpPlayerId: React.Dispatch<React.SetStateAction<string | null>>;
  // Match sheet (Sprint 3)
  footballFormat: string | null;
  liveTacticalSystem: string;
  livePositiveAspects: string;
  liveNegativeAspects: string;
  liveAspectsToImprove: string;
  liveTeamNotes: string;
  liveCoachNotes: string;
  setLiveTacticalSystem: (v: string) => void;
  setLivePositiveAspects: (v: string) => void;
  setLiveNegativeAspects: (v: string) => void;
  setLiveAspectsToImprove: (v: string) => void;
  setLiveTeamNotes: (v: string) => void;
  setLiveCoachNotes: (v: string) => void;
}

type MatchSheetSectionProps = {
  showFichaSection: boolean;
  setShowFichaSection: React.Dispatch<React.SetStateAction<boolean>>;
  footballFormat: string | null;
  liveTacticalSystem: string;
  livePositiveAspects: string;
  liveNegativeAspects: string;
  liveAspectsToImprove: string;
  liveTeamNotes: string;
  liveCoachNotes: string;
  setLiveTacticalSystem: (v: string) => void;
  setLivePositiveAspects: (v: string) => void;
  setLiveNegativeAspects: (v: string) => void;
  setLiveAspectsToImprove: (v: string) => void;
  setLiveTeamNotes: (v: string) => void;
  setLiveCoachNotes: (v: string) => void;
};

function MatchSheetSection(props: MatchSheetSectionProps) {
  const {
    showFichaSection,
    setShowFichaSection,
    footballFormat,
    liveTacticalSystem,
    livePositiveAspects,
    liveNegativeAspects,
    liveAspectsToImprove,
    liveTeamNotes,
    liveCoachNotes,
    setLiveTacticalSystem,
    setLivePositiveAspects,
    setLiveNegativeAspects,
    setLiveAspectsToImprove,
    setLiveTeamNotes,
    setLiveCoachNotes,
  } = props;

  return (
    <div className="mb-5 rounded-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setShowFichaSection((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="text-left">
          <p className="font-bold text-slate-900 text-sm">Ficha do jogo</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Sistema táctico, observações e notas internas (Sprint 3)
          </p>
        </div>
        {showFichaSection ? (
          <ChevronUp size={18} className="text-slate-400" />
        ) : (
          <ChevronDown size={18} className="text-slate-400" />
        )}
      </button>

      {showFichaSection && (
        <div className="p-4 space-y-3 border-t border-slate-200">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            <Info size={14} className="mt-0.5 flex-shrink-0" />
            <p>
              <strong>Conteúdo interno.</strong> Guardado ao finalizar o jogo.
              Não é visível no link público partilhado com atletas e famílias.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Sistema táctico
            </label>
            <TacticalSystemPicker
              value={liveTacticalSystem}
              onChange={setLiveTacticalSystem}
              footballFormat={footballFormat}
              accent="emerald"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Aspectos positivos
            </label>
            <textarea
              value={livePositiveAspects}
              onChange={(e) => setLivePositiveAspects(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="O que funcionou bem neste jogo"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Aspectos menos positivos
            </label>
            <textarea
              value={liveNegativeAspects}
              onChange={(e) => setLiveNegativeAspects(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="O que não correu bem"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Aspectos a melhorar
            </label>
            <textarea
              value={liveAspectsToImprove}
              onChange={(e) => setLiveAspectsToImprove(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="O que trabalhar nos próximos treinos"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Notas da equipa
            </label>
            <textarea
              value={liveTeamNotes}
              onChange={(e) => setLiveTeamNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Notas tácticas e operacionais — visíveis ao staff"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Notas privadas do treinador
            </label>
            <textarea
              value={liveCoachNotes}
              onChange={(e) => setLiveCoachNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Notas pessoais sobre o jogo"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewPanel({
  playersWhoNeedPersistentStats,
  playerRatings,
  mvpPlayerId,
  computedMinutes,
  concededGoalsByPlayer,
  setPlayerRatings,
  setMvpPlayerId,
  footballFormat,
  liveTacticalSystem,
  livePositiveAspects,
  liveNegativeAspects,
  liveAspectsToImprove,
  liveTeamNotes,
  liveCoachNotes,
  setLiveTacticalSystem,
  setLivePositiveAspects,
  setLiveNegativeAspects,
  setLiveAspectsToImprove,
  setLiveTeamNotes,
  setLiveCoachNotes,
}: ReviewPanelProps) {
  const [showFichaSection, setShowFichaSection] = useState(true);

  if (playersWhoNeedPersistentStats.length === 0) {
    return (
      <>
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Este jogo só teve jogadores &quot;Outro&quot;. Os eventos e o resultado vão ser
          guardados normalmente, sem estatísticas individuais persistentes.
        </div>
        <MatchSheetSection
          showFichaSection={showFichaSection}
          setShowFichaSection={setShowFichaSection}
          footballFormat={footballFormat}
          liveTacticalSystem={liveTacticalSystem}
          livePositiveAspects={livePositiveAspects}
          liveNegativeAspects={liveNegativeAspects}
          liveAspectsToImprove={liveAspectsToImprove}
          liveTeamNotes={liveTeamNotes}
          liveCoachNotes={liveCoachNotes}
          setLiveTacticalSystem={setLiveTacticalSystem}
          setLivePositiveAspects={setLivePositiveAspects}
          setLiveNegativeAspects={setLiveNegativeAspects}
          setLiveAspectsToImprove={setLiveAspectsToImprove}
          setLiveTeamNotes={setLiveTeamNotes}
          setLiveCoachNotes={setLiveCoachNotes}
        />
      </>
    );
  }

  return (
    <>
      {/* Notas */}
      <div className="mb-5 rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <p className="font-bold text-slate-900 text-sm">Notas dos jogadores</p>
          <p className="text-xs text-slate-500">
            Obrigatório para os jogadores do plantel que participaram · {playersWhoNeedPersistentStats.filter(p => playerRatings[p.id] !== undefined).length}/{playersWhoNeedPersistentStats.length} preenchidos
          </p>
        </div>
        <div className="divide-y divide-slate-50">
          {playersWhoNeedPersistentStats.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
                {p.jersey_number || "—"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {p.first_name} {p.last_name}
                </p>
                <p className="text-xs text-slate-400">
                  {computedMinutes.get(p.id) ?? 0} min
                  {(concededGoalsByPlayer.get(p.id) ?? 0) > 0 &&
                    ` · -${concededGoalsByPlayer.get(p.id)} GS`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  placeholder="—"
                  value={playerRatings[p.id] ?? ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0 && val <= 10) {
                      setPlayerRatings((prev) => ({ ...prev, [p.id]: val }));
                    } else if (e.target.value === "") {
                      setPlayerRatings((prev) => {
                        const next = { ...prev };
                        delete next[p.id];
                        return next;
                      });
                    }
                  }}
                  className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-xs text-slate-400">/10</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MVP */}
      <div className="mb-5 rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <p className="font-bold text-slate-900 text-sm">MVP do jogo</p>
          <p className="text-xs text-slate-500">
            Seleciona o melhor jogador do plantel
          </p>
        </div>
        <div className="divide-y divide-slate-50">
          {playersWhoNeedPersistentStats.map((p) => (
            <button
              key={p.id}
              onClick={() => setMvpPlayerId((prev) => (prev === p.id ? null : p.id))}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                mvpPlayerId === p.id
                  ? "bg-amber-50 hover:bg-amber-100"
                  : "bg-white hover:bg-slate-50"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  mvpPlayerId === p.id ? "bg-amber-400 text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                {mvpPlayerId === p.id ? <Star size={14} /> : (p.jersey_number || "—")}
              </div>
              <span className="flex-1 text-sm font-medium text-slate-800 truncate">
                {p.first_name} {p.last_name}
              </span>
              {mvpPlayerId === p.id && (
                <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                  MVP
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <MatchSheetSection
        showFichaSection={showFichaSection}
        setShowFichaSection={setShowFichaSection}
        footballFormat={footballFormat}
        liveTacticalSystem={liveTacticalSystem}
        livePositiveAspects={livePositiveAspects}
        liveNegativeAspects={liveNegativeAspects}
        liveAspectsToImprove={liveAspectsToImprove}
        liveTeamNotes={liveTeamNotes}
        liveCoachNotes={liveCoachNotes}
        setLiveTacticalSystem={setLiveTacticalSystem}
        setLivePositiveAspects={setLivePositiveAspects}
        setLiveNegativeAspects={setLiveNegativeAspects}
        setLiveAspectsToImprove={setLiveAspectsToImprove}
        setLiveTeamNotes={setLiveTeamNotes}
        setLiveCoachNotes={setLiveCoachNotes}
      />
    </>
  );
}
