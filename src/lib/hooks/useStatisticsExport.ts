"use client";

import { useState } from "react";
import { toast } from "sonner";
import { captureClientProductEvent } from "@/lib/observability/posthog-client";
import {
  exportAttendanceStatisticsPDF,
  exportGameStatisticsPDF,
} from "@/lib/pdf/statistics";
import {
  exportAttendanceCsv,
  exportGameStatsCsv,
} from "@/lib/csv/statistics";
import type { AttendanceStats, GameStats, Tab } from "@/components/statistics/types";
import { isGoalkeeper } from "@/components/statistics/utils";

export function useStatisticsExport(
  ageGroupId: string | null,
  ageGroupName: string,
) {
  const [exportingPdf, setExportingPdf] = useState<Tab | null>(null);

  async function handleExportActiveTabPdf(
    activeTab: Tab,
    selectedPlayerIds: Set<string>,
    currentTabPlayerIds: string[],
    sortedAttendance: AttendanceStats[],
    sortedGameStats: GameStats[],
  ) {
    const selectedIds =
      selectedPlayerIds.size > 0
        ? selectedPlayerIds
        : new Set(currentTabPlayerIds);

    if (activeTab === "attendance") {
      const rows = sortedAttendance
        .filter((row) => selectedIds.has(row.player.id))
        .map((row) => ({
          name: `${row.player.first_name} ${row.player.last_name}`.trim(),
          position: row.player.preferred_position ?? null,
          minutes: row.minutos,
          presences: row.presencas,
          late: row.atrasados,
          absent: row.ausencias,
          injured: row.lesionados,
        }));

      setExportingPdf("attendance");
      try {
        await exportAttendanceStatisticsPDF({
          ageGroupName,
          selectedCount: rows.length,
          totalCount: sortedAttendance.length,
          rows,
        });
        captureClientProductEvent("pdf_generated", {
          age_group_id: ageGroupId,
          source:
            selectedPlayerIds.size > 0
              ? "statistics_attendance_selected"
              : "statistics_attendance_full",
          players_count: rows.length,
        });
        toast.success("Mapa de presenças exportado em PDF.");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Erro ao exportar mapa de presenças.";
        toast.error(message);
      } finally {
        setExportingPdf(null);
      }
      return;
    }

    const rows = sortedGameStats
      .filter((row) => selectedIds.has(row.player.id))
      .map((row) => ({
        name: `${row.player.first_name} ${row.player.last_name}`.trim(),
        position: row.player.preferred_position ?? null,
        goals: row.golos,
        conceded: isGoalkeeper(row.player) ? row.gs : null,
        assists: row.assistencias,
        minutes: row.minutos,
        starters: row.titular,
        substitutes: row.suplente,
        convocations: row.convocatorias,
        mvp: row.mvp,
        mvpRate: row.totalJogos > 0 ? (row.mvp / row.totalJogos) * 100 : null,
        averageRating:
          row.mediaNotaCount > 0 ? row.mediaNotaSum / row.mediaNotaCount : null,
        averageMinutes: row.totalJogos > 0 ? row.minutos / row.totalJogos : null,
        yellowCards: row.amarelos,
        redCards: row.vermelhos,
      }));

    setExportingPdf("game");
    try {
      await exportGameStatisticsPDF({
        ageGroupName,
        selectedCount: rows.length,
        totalCount: sortedGameStats.length,
        rows,
      });
      captureClientProductEvent("pdf_generated", {
        age_group_id: ageGroupId,
        source:
          selectedPlayerIds.size > 0
            ? "statistics_game_selected"
            : "statistics_game_full",
        players_count: rows.length,
      });
      toast.success("Estatísticas de jogo exportadas em PDF.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao exportar estatísticas de jogo.";
      toast.error(message);
    } finally {
      setExportingPdf(null);
    }
  }

  function handleExportActiveTabCsv(
    activeTab: Tab,
    selectedPlayerIds: Set<string>,
    currentTabPlayerIds: string[],
    sortedAttendance: AttendanceStats[],
    sortedGameStats: GameStats[],
  ) {
    const selectedIds =
      selectedPlayerIds.size > 0
        ? selectedPlayerIds
        : new Set(currentTabPlayerIds);

    if (activeTab === "attendance") {
      const rows = sortedAttendance
        .filter((row) => selectedIds.has(row.player.id))
        .map((row) => ({
          name: `${row.player.first_name} ${row.player.last_name}`.trim(),
          position: row.player.preferred_position ?? null,
          minutes: row.minutos,
          presences: row.presencas,
          late: row.atrasados,
          absent: row.ausencias,
          injured: row.lesionados,
        }));
      exportAttendanceCsv(ageGroupName, rows);
      captureClientProductEvent("pdf_generated", {
        age_group_id: ageGroupId,
        source: "statistics_attendance",
        players_count: rows.length,
      });
      toast.success("Mapa de presenças exportado em CSV.");
      return;
    }

    const rows = sortedGameStats
      .filter((row) => selectedIds.has(row.player.id))
      .map((row) => ({
        name: `${row.player.first_name} ${row.player.last_name}`.trim(),
        position: row.player.preferred_position ?? null,
        convocations: row.convocatorias,
        starters: row.titular,
        substitutes: row.suplente,
        minutes: row.minutos,
        goals: row.golos,
        assists: row.assistencias,
        yellowCards: row.amarelos,
        redCards: row.vermelhos,
        mvp: row.mvp,
        averageRating:
          row.mediaNotaCount > 0 ? row.mediaNotaSum / row.mediaNotaCount : null,
      }));
    exportGameStatsCsv(ageGroupName, rows);
    captureClientProductEvent("pdf_generated", {
      age_group_id: ageGroupId,
      source: "statistics_game",
      players_count: rows.length,
    });
    toast.success("Estatísticas de jogo exportadas em CSV.");
  }

  return {
    exportingPdf,
    handleExportActiveTabPdf,
    handleExportActiveTabCsv,
  };
}
