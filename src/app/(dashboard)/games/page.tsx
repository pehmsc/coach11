"use client";

import { ScopeToggle } from "@/components/navigation/ScopeToggle";
import { GamesSection } from "@/components/team-hub/GamesSection";

export default function GamesPage() {
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Jogos</h1>
      </div>

      <ScopeToggle variant="inline" className="mb-4" />

      <GamesSection returnToKey="games" />
    </div>
  );
}
