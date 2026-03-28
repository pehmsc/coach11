"use client";

import { MobileFooterNav } from "@/components/layout/MobileFooterNav";
import type { NavProfile } from "@/components/layout/nav-config";

export function BottomNav({
  profile,
  avatarUrl,
  source,
  teamRole,
}: {
  profile: NavProfile;
  avatarUrl?: string | null;
  source?: string | null;
  teamRole?: string | null;
}) {
  return <MobileFooterNav profile={profile} avatarUrl={avatarUrl} source={source} teamRole={teamRole} />;
}
