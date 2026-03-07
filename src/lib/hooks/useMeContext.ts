"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/apiFetch";
import { queryKeys } from "@/lib/query/keys";

export type MeContextResponse = {
  success?: boolean;
  linked?: boolean;
  source?: string | null;
  teamId?: string | null;
  teamRole?: string | null;
  canManageStaff?: boolean;
  ageGroup?: {
    id: string;
    name?: string;
    club_name?: string;
  } | null;
  accessibleTeamIds?: string[];
  technicalStaffUsage?: {
    coordinatorId?: string | null;
    coordinatorIsSuperCoordinator?: boolean;
    limit?: number | null;
    limitEnforced?: boolean;
    activeTechnicalStaffCount?: number;
    pendingTechnicalInviteCount?: number;
    totalUsed?: number;
    remainingSlots?: number | null;
    overLimit?: boolean;
  } | null;
  profile?: {
    id?: string;
    full_name?: string;
    role?: string;
    email?: string;
    phone?: string;
    avatar_url?: string | null;
    is_super_coordinator?: boolean;
  } | null;
  error?: string;
};

export function useMeContext() {
  return useQuery({
    queryKey: queryKeys.meContext(),
    queryFn: () => apiFetch<MeContextResponse>("/api/me/context"),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}
