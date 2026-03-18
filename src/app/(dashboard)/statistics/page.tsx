"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Tab } from "@/components/statistics/types";
import {
  StatisticsLoadingSkeleton,
  StatisticsEmptyState,
} from "@/components/statistics/StatisticsEmptyState";
import { YellowCardAlert } from "@/components/statistics/YellowCardAlert";
import { StatisticsTabs } from "@/components/statistics/StatisticsTabs";
import { PdfExportCard } from "@/components/statistics/PdfExportCard";
import { AttendanceTable } from "@/components/statistics/AttendanceTable";
import { AttendanceHeatmap } from "@/components/statistics/AttendanceHeatmap";
import { GameStatsSummaryCards } from "@/components/statistics/GameStatsSummaryCards";
import { GameStatsTable } from "@/components/statistics/GameStatsTable";
import { useStatisticsData } from "@/lib/hooks/useStatisticsData";
import { useStatisticsSorting } from "@/lib/hooks/useStatisticsSorting";
import { usePlayerSelection } from "@/lib/hooks/usePlayerSelection";
import { useStatisticsExport } from "@/lib/hooks/useStatisticsExport";
import { apiFetch } from "@/lib/http/apiFetch";
import { queryKeys } from "@/lib/query/keys";

// ── Component ────────────────────────────────────────────────────────────────

export default function StatisticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("attendance");

  const {
    ageGroupId,
    ageGroupName,
    players,
    attendanceStats,
    gameStats,
    rawFinalStats,
    loading,
    yellowAlerts,
  } = useStatisticsData();

  const {
    attendanceSort,
    gameSort,
    toggleAttendanceSort,
    toggleGameSort,
    sortedAttendance,
    sortedGameStats,
  } = useStatisticsSorting(attendanceStats, gameStats);

  const sortedAttendanceIds = useMemo(
    () => sortedAttendance.map((row) => row.player.id),
    [sortedAttendance],
  );
  const sortedGameStatsIds = useMemo(
    () => sortedGameStats.map((row) => row.player.id),
    [sortedGameStats],
  );

  const {
    selectedPlayerIds,
    currentTabPlayerIds,
    allCurrentTabSelected,
    toggleSelectedPlayer,
    toggleSelectAllCurrentTab,
    clearSelectedPlayers,
  } = usePlayerSelection(players, activeTab, sortedAttendanceIds, sortedGameStatsIds);

  const { exportingPdf, handleExportActiveTabPdf, handleExportActiveTabCsv } =
    useStatisticsExport(ageGroupId, ageGroupName);

  // Heatmap data
  const heatmapQuery = useQuery({
    queryKey: ageGroupId
      ? queryKeys.statistics.attendanceDaily(ageGroupId)
      : ["statistics", "attendance-daily", "none"],
    queryFn: () =>
      apiFetch<{ daily: Array<{ date: string; present: number; late: number; absent: number; injured: number; total: number }> }>(
        `/api/statistics/attendance-daily?ageGroupId=${ageGroupId}`,
      ),
    enabled: Boolean(ageGroupId),
  });

  const dailyData = useMemo(
    () => heatmapQuery.data?.daily ?? [],
    [heatmapQuery.data?.daily],
  );

  // ── Render ──

  if (loading) {
    return <StatisticsLoadingSkeleton />;
  }

  if (!ageGroupId || players.length === 0) {
    return <StatisticsEmptyState />;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Estatísticas</h1>
      </div>

      {/* Yellow card alert — only shown in game tab */}
      {activeTab === "game" && <YellowCardAlert yellowAlerts={yellowAlerts} />}

      {/* Tabs */}
      <StatisticsTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      <PdfExportCard
        activeTab={activeTab}
        selectedPlayerIds={selectedPlayerIds}
        currentTabPlayerIds={currentTabPlayerIds}
        exportingPdf={exportingPdf}
        onExport={() =>
          void handleExportActiveTabPdf(
            activeTab,
            selectedPlayerIds,
            currentTabPlayerIds,
            sortedAttendance,
            sortedGameStats,
          )
        }
        onExportCsv={() =>
          handleExportActiveTabCsv(
            activeTab,
            selectedPlayerIds,
            currentTabPlayerIds,
            sortedAttendance,
            sortedGameStats,
          )
        }
        onClearSelection={clearSelectedPlayers}
      />

      {/* ── TAB: MAPA DE PRESENÇAS ── */}
      {activeTab === "attendance" && (
        <>
          <AttendanceHeatmap dailyData={dailyData} />
          <AttendanceTable
            sortedAttendance={sortedAttendance}
            attendanceSort={attendanceSort}
            toggleAttendanceSort={toggleAttendanceSort}
            allCurrentTabSelected={allCurrentTabSelected}
            toggleSelectAllCurrentTab={toggleSelectAllCurrentTab}
            selectedPlayerIds={selectedPlayerIds}
            toggleSelectedPlayer={toggleSelectedPlayer}
          />
        </>
      )}

      {/* ── TAB: ESTATÍSTICAS DE JOGO ── */}
      {activeTab === "game" && (
        <>
          <GameStatsSummaryCards gameStats={gameStats} finalStats={rawFinalStats} />
          <GameStatsTable
            sortedGameStats={sortedGameStats}
            gameSort={gameSort}
            toggleGameSort={toggleGameSort}
            allCurrentTabSelected={allCurrentTabSelected}
            toggleSelectAllCurrentTab={toggleSelectAllCurrentTab}
            selectedPlayerIds={selectedPlayerIds}
            toggleSelectedPlayer={toggleSelectedPlayer}
          />
        </>
      )}
    </div>
  );
}
