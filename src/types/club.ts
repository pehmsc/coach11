/**
 * Sprint 4: Multi-club data model types.
 * Phase 2 of architectural evolution: Club > AgeGroupCategory > AgeGroup
 */

export type ClubRole = "admin" | "coordinator" | "coach" | "member";

export type Club = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  city: string | null;
  district: string | null;
  country: string;
  created_at: string;
  updated_at: string;
};

export type AgeGroupCategory = {
  id: string;
  club_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type ClubMembership = {
  id: string;
  club_id: string;
  profile_id: string;
  role: ClubRole;
  created_at: string;
};

export type ClubWithMembership = Club & {
  membership: ClubMembership;
};

export type ClubDashboardSummary = {
  club: Club;
  ageGroupCategories: AgeGroupCategory[];
  ageGroupCount: number;
  memberCount: number;
  role: ClubRole;
};
