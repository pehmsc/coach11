"use client";

import { MobileFooterNav } from "@/components/layout/MobileFooterNav";
import type { NavProfile } from "@/components/layout/nav-config";

export function BottomNav({
  profile,
  avatarUrl,
}: {
  profile: NavProfile;
  avatarUrl?: string | null;
}) {
  return <MobileFooterNav profile={profile} avatarUrl={avatarUrl} />;
}
