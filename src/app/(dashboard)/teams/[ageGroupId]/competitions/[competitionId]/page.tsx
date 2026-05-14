"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Breadcrumb } from "@/components/navigation/Breadcrumb";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { CompetitionDetailView } from "@/components/competitions/detail/CompetitionDetailView";
import { useAgeGroupName } from "@/hooks/useAgeGroupName";
import { createClient } from "@/lib/supabase/client";

type PageParams = { ageGroupId: string; competitionId: string };

export default function TeamCompetitionDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { ageGroupId, competitionId } = use(params);
  const ageGroupName = useAgeGroupName(ageGroupId);
  const supabase = useMemo(() => createClient(), []);
  const [competitionName, setCompetitionName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("competitions")
      .select("name")
      .eq("id", competitionId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setCompetitionName(data?.name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [competitionId, supabase]);

  return (
    <div className="min-h-screen bg-slate-50">
      <StickyBackLink
        href={`/teams/${ageGroupId}/competitions`}
        label="Voltar às competições"
        sticky={false}
        wrapperClassName="bg-slate-50 px-4 py-2 max-w-5xl mx-auto"
      >
        <Breadcrumb
          items={[
            { label: "Equipas", href: "/teams" },
            {
              label: ageGroupName ?? "Escalão",
              href: `/teams/${ageGroupId}`,
              shortLabel: ageGroupName ?? "Escalão",
            },
            {
              label: "Competições",
              href: `/teams/${ageGroupId}/competitions`,
            },
            { label: competitionName ?? "Competição" },
          ]}
        />
      </StickyBackLink>

      <div className="max-w-2xl mx-auto px-4 py-5">
        <CompetitionDetailView
          competitionId={competitionId}
          ageGroupId={ageGroupId}
        />
      </div>
    </div>
  );
}
