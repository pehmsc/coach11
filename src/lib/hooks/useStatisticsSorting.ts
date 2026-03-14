"use client";

import { useMemo, useState } from "react";
import type {
  AttendanceSortKey,
  AttendanceStats,
  GameSortKey,
  GameStats,
  SortDir,
} from "@/components/statistics/types";
import {
  compareNullableNumber,
  comparePlayersByFirstName,
  defaultSortDirForAttendance,
  defaultSortDirForGame,
} from "@/components/statistics/utils";

export function useStatisticsSorting(
  attendanceStats: AttendanceStats[],
  gameStats: GameStats[],
) {
  const [attendanceSort, setAttendanceSort] = useState<{
    key: AttendanceSortKey;
    dir: SortDir;
  }>({ key: "player", dir: "asc" });
  const [gameSort, setGameSort] = useState<{
    key: GameSortKey;
    dir: SortDir;
  }>({ key: "player", dir: "asc" });

  function toggleAttendanceSort(key: AttendanceSortKey) {
    setAttendanceSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultSortDirForAttendance(key) },
    );
  }

  function toggleGameSort(key: GameSortKey) {
    setGameSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultSortDirForGame(key) },
    );
  }

  const sortedGameStats = useMemo(
    () => {
      const dir = gameSort.dir;
      return [...gameStats].sort((a, b) => {
        switch (gameSort.key) {
          case "player":
            return comparePlayersByFirstName(a.player, b.player);
          case "golos":
            return (dir === "asc" ? a.golos - b.golos : b.golos - a.golos) ||
              comparePlayersByFirstName(a.player, b.player);
          case "gs":
            return (dir === "asc" ? a.gs - b.gs : b.gs - a.gs) ||
              comparePlayersByFirstName(a.player, b.player);
          case "assistencias":
            return (dir === "asc"
              ? a.assistencias - b.assistencias
              : b.assistencias - a.assistencias) ||
              comparePlayersByFirstName(a.player, b.player);
          case "minutos":
            return (dir === "asc" ? a.minutos - b.minutos : b.minutos - a.minutos) ||
              comparePlayersByFirstName(a.player, b.player);
          case "titular":
            return (dir === "asc" ? a.titular - b.titular : b.titular - a.titular) ||
              comparePlayersByFirstName(a.player, b.player);
          case "suplente":
            return (dir === "asc" ? a.suplente - b.suplente : b.suplente - a.suplente) ||
              comparePlayersByFirstName(a.player, b.player);
          case "convocatorias":
            return (dir === "asc"
              ? a.convocatorias - b.convocatorias
              : b.convocatorias - a.convocatorias) ||
              comparePlayersByFirstName(a.player, b.player);
          case "mvp":
            return (dir === "asc" ? a.mvp - b.mvp : b.mvp - a.mvp) ||
              comparePlayersByFirstName(a.player, b.player);
          case "mediaMVP":
            return compareNullableNumber(
              a.totalJogos > 0 ? a.mvp / a.totalJogos : null,
              b.totalJogos > 0 ? b.mvp / b.totalJogos : null,
              dir,
            ) || comparePlayersByFirstName(a.player, b.player);
          case "mediaNota":
            return compareNullableNumber(
              a.mediaNotaCount > 0 ? a.mediaNotaSum / a.mediaNotaCount : null,
              b.mediaNotaCount > 0 ? b.mediaNotaSum / b.mediaNotaCount : null,
              dir,
            ) || comparePlayersByFirstName(a.player, b.player);
          case "mediaMin":
            return compareNullableNumber(
              a.totalJogos > 0 ? a.minutos / a.totalJogos : null,
              b.totalJogos > 0 ? b.minutos / b.totalJogos : null,
              dir,
            ) || comparePlayersByFirstName(a.player, b.player);
          case "amarelos":
            return (dir === "asc" ? a.amarelos - b.amarelos : b.amarelos - a.amarelos) ||
              comparePlayersByFirstName(a.player, b.player);
          case "vermelhos":
            return (dir === "asc" ? a.vermelhos - b.vermelhos : b.vermelhos - a.vermelhos) ||
              comparePlayersByFirstName(a.player, b.player);
          default:
            return 0;
        }
      });
    },
    [gameStats, gameSort],
  );

  const sortedAttendance = useMemo(
    () => {
      const dir = attendanceSort.dir;
      return [...attendanceStats].sort((a, b) => {
        switch (attendanceSort.key) {
          case "player":
            return comparePlayersByFirstName(a.player, b.player);
          case "minutos":
            return (dir === "asc" ? a.minutos - b.minutos : b.minutos - a.minutos) ||
              comparePlayersByFirstName(a.player, b.player);
          case "presencas":
            return (dir === "asc" ? a.presencas - b.presencas : b.presencas - a.presencas) ||
              comparePlayersByFirstName(a.player, b.player);
          case "atrasados":
            return (dir === "asc" ? a.atrasados - b.atrasados : b.atrasados - a.atrasados) ||
              comparePlayersByFirstName(a.player, b.player);
          case "ausencias":
            return (dir === "asc" ? a.ausencias - b.ausencias : b.ausencias - a.ausencias) ||
              comparePlayersByFirstName(a.player, b.player);
          case "lesionados":
            return (dir === "asc" ? a.lesionados - b.lesionados : b.lesionados - a.lesionados) ||
              comparePlayersByFirstName(a.player, b.player);
          default:
            return 0;
        }
      });
    },
    [attendanceStats, attendanceSort],
  );

  return {
    attendanceSort,
    gameSort,
    toggleAttendanceSort,
    toggleGameSort,
    sortedAttendance,
    sortedGameStats,
  };
}
