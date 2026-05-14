"use client";

import { useSearchParams } from "next/navigation";
import { ScopeToggle } from "@/components/navigation/ScopeToggle";
import { PlayersSection } from "@/components/team-hub/PlayersSection";

export default function PlayersPage() {
  const searchParams = useSearchParams();
  const ageGroupIdFromUrl = searchParams.get("ageGroupId");

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Plantel</h1>
      </div>

      <ScopeToggle variant="inline" className="mb-4" />

      <PlayersSection ageGroupId={ageGroupIdFromUrl} returnToKey="players" />
    </div>
  );
}
