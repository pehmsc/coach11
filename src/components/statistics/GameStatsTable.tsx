"use client";

import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GameSortKey, GameStats, SortDir } from "./types";
import { isGoalkeeper } from "./utils";
import { SortIcon } from "./SortIcon";

interface GameStatsTableProps {
  sortedGameStats: GameStats[];
  gameSort: { key: GameSortKey; dir: SortDir };
  toggleGameSort: (key: GameSortKey) => void;
  allCurrentTabSelected: boolean;
  toggleSelectAllCurrentTab: () => void;
  selectedPlayerIds: Set<string>;
  toggleSelectedPlayer: (playerId: string) => void;
  /**
   * Quando true (modo "Todos os escaloes"), mostra nome do escalao como
   * subtitulo abaixo do nome do atleta. Em modo escalao unico, omitir.
   */
  showAgeGroupSubtitle?: boolean;
  /** Lookup nome de escalao por id (usado so quando showAgeGroupSubtitle). */
  ageGroupNameById?: Map<string, string>;
}

export function GameStatsTable({
  sortedGameStats,
  gameSort,
  toggleGameSort,
  allCurrentTabSelected,
  toggleSelectAllCurrentTab,
  selectedPlayerIds,
  toggleSelectedPlayer,
  showAgeGroupSubtitle,
  ageGroupNameById,
}: GameStatsTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy size={16} className="text-amber-500" /> Plantel completo
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100">
              <th className="pb-2 pr-2 text-center font-medium">
                <input
                  type="checkbox"
                  checked={allCurrentTabSelected}
                  onChange={toggleSelectAllCurrentTab}
                  aria-label="Selecionar todos os atletas das estatísticas de jogo"
                  className="h-4 w-4 rounded border-slate-300 text-slate-900"
                />
              </th>
              <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap w-12">
                Nº
              </th>
              <th className="text-left pb-2 font-medium text-sm">
                <button
                  type="button"
                  onClick={() => toggleGameSort("player")}
                  className="inline-flex items-center gap-1"
                >
                  Jogador
                  <SortIcon active={gameSort.key === "player"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap">
                Posição
              </th>
              <th className="text-center pb-2 font-medium px-1.5" title="Golos">
                <button
                  type="button"
                  onClick={() => toggleGameSort("golos")}
                  className="inline-flex items-center gap-1"
                >
                  ⚽
                  <SortIcon active={gameSort.key === "golos"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5" title="Golos Sofridos">
                <button
                  type="button"
                  onClick={() => toggleGameSort("gs")}
                  className="inline-flex items-center gap-1"
                >
                  GS
                  <SortIcon active={gameSort.key === "gs"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5" title="Assistências">
                <button
                  type="button"
                  onClick={() => toggleGameSort("assistencias")}
                  className="inline-flex items-center gap-1"
                >
                  🅰️
                  <SortIcon active={gameSort.key === "assistencias"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Minutos totais">
                <button
                  type="button"
                  onClick={() => toggleGameSort("minutos")}
                  className="inline-flex items-center gap-1"
                >
                  Min
                  <SortIcon active={gameSort.key === "minutos"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5" title="Jogos como titular">
                <button
                  type="button"
                  onClick={() => toggleGameSort("titular")}
                  className="inline-flex items-center gap-1"
                >
                  T
                  <SortIcon active={gameSort.key === "titular"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5" title="Jogos como suplente">
                <button
                  type="button"
                  onClick={() => toggleGameSort("suplente")}
                  className="inline-flex items-center gap-1"
                >
                  S
                  <SortIcon active={gameSort.key === "suplente"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5" title="Convocatórias">
                <button
                  type="button"
                  onClick={() => toggleGameSort("convocatorias")}
                  className="inline-flex items-center gap-1"
                >
                  Conv
                  <SortIcon active={gameSort.key === "convocatorias"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5" title="MVP">
                <button
                  type="button"
                  onClick={() => toggleGameSort("mvp")}
                  className="inline-flex items-center gap-1"
                >
                  ⭐
                  <SortIcon active={gameSort.key === "mvp"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Média MVP">
                <button
                  type="button"
                  onClick={() => toggleGameSort("mediaMVP")}
                  className="inline-flex items-center gap-1"
                >
                  %MVP
                  <SortIcon active={gameSort.key === "mediaMVP"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Média Nota">
                <button
                  type="button"
                  onClick={() => toggleGameSort("mediaNota")}
                  className="inline-flex items-center gap-1"
                >
                  Nota
                  <SortIcon active={gameSort.key === "mediaNota"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Média minutos/jogo">
                <button
                  type="button"
                  onClick={() => toggleGameSort("mediaMin")}
                  className="inline-flex items-center gap-1"
                >
                  Min/J
                  <SortIcon active={gameSort.key === "mediaMin"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5" title="Cartões Amarelos">
                <button
                  type="button"
                  onClick={() => toggleGameSort("amarelos")}
                  className="inline-flex items-center gap-1"
                >
                  🟨
                  <SortIcon active={gameSort.key === "amarelos"} dir={gameSort.dir} />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-1.5" title="Cartões Vermelhos">
                <button
                  type="button"
                  onClick={() => toggleGameSort("vermelhos")}
                  className="inline-flex items-center gap-1"
                >
                  🟥
                  <SortIcon active={gameSort.key === "vermelhos"} dir={gameSort.dir} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedGameStats.map((s) => {
              const mediaMVP =
                s.totalJogos > 0
                  ? ((s.mvp / s.totalJogos) * 100).toFixed(0)
                  : "—";
              const mediaNota =
                s.mediaNotaCount > 0
                  ? (s.mediaNotaSum / s.mediaNotaCount).toFixed(1)
                  : "—";
              const mediaMin =
                s.totalJogos > 0
                  ? (s.minutos / s.totalJogos).toFixed(0)
                  : "—";

              return (
                <tr
                  key={s.player.id}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="py-2 pr-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedPlayerIds.has(s.player.id)}
                      onChange={() => toggleSelectedPlayer(s.player.id)}
                      aria-label={`Selecionar ${s.player.first_name} ${s.player.last_name}`}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                  </td>
                  <td className="py-2 px-1.5 text-center font-mono text-xs text-slate-500 whitespace-nowrap">
                    {typeof s.player.jersey_number === "number"
                      ? s.player.jersey_number
                      : "—"}
                  </td>
                  <td className="py-2 font-medium text-slate-800 text-sm">
                    <span className="block truncate max-w-[100px]">
                      {s.player.first_name} {s.player.last_name}
                    </span>
                    {showAgeGroupSubtitle && s.player.age_group_id ? (
                      <span className="block text-[10px] text-slate-400 truncate">
                        {ageGroupNameById?.get(s.player.age_group_id) ?? "—"}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 px-1.5 text-center text-xs text-slate-500 whitespace-nowrap">
                    {s.player.preferred_position ?? "—"}
                  </td>
                  <td className="py-2 text-center font-bold text-slate-900 px-1.5">
                    {s.golos || "—"}
                  </td>
                  <td className="py-2 text-center px-1.5">
                    {isGoalkeeper(s.player) ? (
                      <span className={s.gs > 0 ? "font-semibold text-rose-600" : "text-slate-400"}>
                        {s.gs || "0"}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2 text-center text-slate-600 px-1.5">
                    {s.assistencias || "—"}
                  </td>
                  <td className="py-2 text-center text-slate-500 px-1.5 font-mono">
                    {s.minutos || "—"}
                  </td>
                  <td className="py-2 text-center text-emerald-600 px-1.5">
                    {s.titular || "—"}
                  </td>
                  <td className="py-2 text-center text-slate-500 px-1.5">
                    {s.suplente || "—"}
                  </td>
                  <td className="py-2 text-center text-slate-500 px-1.5">
                    {s.convocatorias || "—"}
                  </td>
                  <td className="py-2 text-center text-amber-500 px-1.5">
                    {s.mvp || "—"}
                  </td>
                  <td className="py-2 text-center text-slate-500 px-1.5">
                    {mediaMVP === "—" ? "—" : `${mediaMVP}%`}
                  </td>
                  <td className="py-2 text-center px-1.5">
                    <span
                      className={
                        mediaNota !== "—" && parseFloat(mediaNota) >= 7
                          ? "font-bold text-emerald-600"
                          : mediaNota !== "—" && parseFloat(mediaNota) < 5
                            ? "text-red-500"
                            : "text-slate-600"
                      }
                    >
                      {mediaNota}
                    </span>
                  </td>
                  <td className="py-2 text-center text-slate-500 px-1.5 font-mono">
                    {mediaMin}
                  </td>
                  <td
                    className={`py-2 text-center px-1.5 ${
                      s.amarelos >= 3 ? "font-bold text-amber-600" : "text-slate-500"
                    }`}
                  >
                    {s.amarelos || "—"}
                  </td>
                  <td className="py-2 text-center text-red-600 px-1.5">
                    {s.vermelhos || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
