"use client";

import { use } from "react";
import { Breadcrumb } from "@/components/navigation/Breadcrumb";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { SettingsSection } from "@/components/team-hub/SettingsSection";
import { useAgeGroupName } from "@/hooks/useAgeGroupName";

type PageParams = { ageGroupId: string };

export default function TeamSettingsPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { ageGroupId } = use(params);
  const ageGroupName = useAgeGroupName(ageGroupId);

  return (
    <div className="min-h-screen bg-slate-50">
      <StickyBackLink
        href={`/teams/${ageGroupId}`}
        label="Voltar ao escalão"
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
            { label: "Configurações", shortLabel: "Config." },
          ]}
        />
      </StickyBackLink>

      <div className="max-w-5xl mx-auto px-4 py-5">
        <h1 className="text-xl font-bold text-slate-900 mb-4">Configurações</h1>
        <SettingsSection ageGroupId={ageGroupId} />
      </div>
    </div>
  );
}
