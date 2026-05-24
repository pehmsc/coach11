"use client";

import { MobileFooterNav } from "@/components/layout/MobileFooterNav";
import type { NavProfile, PlanType } from "@/components/layout/nav-config";

export function BottomNav({
  profile,
  avatarUrl,
  source,
  teamRole,
  planType = "club",
}: {
  profile: NavProfile;
  avatarUrl?: string | null;
  source?: string | null;
  teamRole?: string | null;
  planType?: PlanType;
}) {
  return (
    <MobileFooterNav
      profile={profile}
      avatarUrl={avatarUrl}
      source={source}
      teamRole={teamRole}
      planType={planType}
    />
  );
}
