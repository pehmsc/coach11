"use client";

import { useMemo } from "react";
import type { Tab } from "@/components/statistics/types";
import { useListStateSync } from "@/hooks/useListStateSync";
import {
  StatisticsLoadingSkeleton,
  StatisticsEmptyState,
} from "@/components/statistics/StatisticsEmptyState";
import { YellowCardAlert } from "@/components/statistics/YellowCardAlert";
import { StatisticsTabs } from "@/components/statistics/StatisticsTabs";
import { PdfExportCard } from "@/components/statistics/PdfExportCard";
import { GameStatsSummaryCards } from "@/components/statistics/GameStatsSummaryCards";
import { GameStatsTable } from "@/components/statistics/GameStatsTable";
import { AttendanceTable } from "@/components/statistics/AttendanceTable";
import { AttendanceHeatmap } from "@/components/statistics/AttendanceHeatmap";
import { useStatisticsData } from "@/lib/hooks/useStatisticsData";
import { exportGameStatsCsv } from "@/lib/csv/statistics";
import { useStatisticsSorting } from "@/lib/hooks/useStatisticsSorting";
import { usePlayerSelection } from "@/lib/hooks/usePlayerSelection";
import { useStatisticsExport } from "@/lib/hooks/useStatisticsExport";
import { ScopeToggle } from "@/components/navigation/ScopeToggle";

export default function StatisticsPage() {
  const [activeTab, setActiveTab] = useListStateSync<Tab>("tab", "attendance");

  const {
    ageGroupId,
    ageGroupName,
    players,
    attendanceStats,
    gameStats,
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

  const { exportingPdf, handleExportActiveTabPdf } = useStatisticsExport(
    ageGroupId,
    ageGroupName,
  );

  if (loading) {
    return <StatisticsLoadingSkeleton />;
  }

  if (!ageGroupId || players.length === 0) {
    return <StatisticsEmptyState />;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-5">
      <ScopeToggle variant="inline" />
      <h1 className="text-2xl font-bold text-slate-900">Estatísticas</h1>

      {activeTab === "game" && <YellowCardAlert yellowAlerts={yellowAlerts} />}

      <StatisticsTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* ── TAB: MAPA DE PRESENÇAS ── */}
      {activeTab === "attendance" && (
        <>
          <AttendanceHeatmap ageGroupId={ageGroupId} />
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
          <GameStatsSummaryCards gameStats={gameStats} />

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
                [],
                sortedGameStats,
              )
            }
            onClearSelection={clearSelectedPlayers}
            onExportCsv={() => exportGameStatsCsv(sortedGameStats, ageGroupName)}
          />

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
