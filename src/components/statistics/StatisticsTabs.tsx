"use client";

import { Users, Trophy } from "lucide-react";
import type { Tab } from "./types";

interface StatisticsTabsProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export function StatisticsTabs({ activeTab, setActiveTab }: StatisticsTabsProps) {
  return (
    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
      <button
        onClick={() => setActiveTab("attendance")}
        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
          activeTab === "attendance"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <Users size={15} /> Mapa de Presenças
      </button>
      <button
        onClick={() => setActiveTab("game")}
        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
          activeTab === "game"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <Trophy size={15} /> Estatísticas de Jogo
      </button>
    </div>
  );
}
