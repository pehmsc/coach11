-- Sprint 4: Club-first hierarchy
-- Phase 2 of architectural evolution: Club > AgeGroupCategory > AgeGroup
--
-- This migration adds the multi-club data model while maintaining
-- backward compatibility with the existing age_group-first approach.

-- ─── Clubs table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  logo_url text,
  city text,
  district text,
  country text DEFAULT 'PT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

-- ─── Age Group Categories (e.g., Sub-15, Sub-17, Seniores) ──────────────
CREATE TABLE IF NOT EXISTS public.age_group_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.age_group_categories ENABLE ROW LEVEL SECURITY;

-- ─── Club Memberships (who belongs to which club) ────────────────────────
CREATE TABLE IF NOT EXISTS public.club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'coordinator', 'coach', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, profile_id)
);

ALTER TABLE public.club_memberships ENABLE ROW LEVEL SECURITY;

-- ─── Link age_groups to clubs (backward-compatible) ──────────────────────
-- Add club_id to age_groups if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'age_groups' AND column_name = 'club_id'
  ) THEN
    ALTER TABLE public.age_groups ADD COLUMN club_id uuid REFERENCES public.clubs(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'age_groups' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE public.age_groups ADD COLUMN category_id uuid REFERENCES public.age_group_categories(id);
  END IF;
END $$;

-- ─── RLS Policies ────────────────────────────────────────────────────────

-- Clubs: members can read their own club
CREATE POLICY "club_members_can_read" ON public.clubs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.club_memberships
      WHERE club_memberships.club_id = clubs.id
        AND club_memberships.profile_id = auth.uid()
    )
  );

-- Club admins can update their club
CREATE POLICY "club_admins_can_update" ON public.clubs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.club_memberships
      WHERE club_memberships.club_id = clubs.id
        AND club_memberships.profile_id = auth.uid()
        AND club_memberships.role = 'admin'
    )
  );

-- Age group categories: visible to club members
CREATE POLICY "club_members_can_read_categories" ON public.age_group_categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.club_memberships
      WHERE club_memberships.club_id = age_group_categories.club_id
        AND club_memberships.profile_id = auth.uid()
    )
  );

-- Club memberships: members can see other members of their club
CREATE POLICY "club_members_can_read_memberships" ON public.club_memberships
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.club_memberships AS cm
      WHERE cm.club_id = club_memberships.club_id
        AND cm.profile_id = auth.uid()
    )
  );

-- Club admins can manage memberships
CREATE POLICY "club_admins_can_manage_memberships" ON public.club_memberships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.club_memberships AS cm
      WHERE cm.club_id = club_memberships.club_id
        AND cm.profile_id = auth.uid()
        AND cm.role = 'admin'
    )
  );

-- ─── Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_club_memberships_profile ON public.club_memberships(profile_id);
CREATE INDEX IF NOT EXISTS idx_club_memberships_club ON public.club_memberships(club_id);
CREATE INDEX IF NOT EXISTS idx_age_group_categories_club ON public.age_group_categories(club_id);
CREATE INDEX IF NOT EXISTS idx_age_groups_club ON public.age_groups(club_id);
CREATE INDEX IF NOT EXISTS idx_age_groups_category ON public.age_groups(category_id);
