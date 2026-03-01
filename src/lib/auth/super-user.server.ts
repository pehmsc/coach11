import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SuperUserProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_super_coordinator: boolean;
};

export type SuperUserAccessResult =
  | {
      ok: true;
      user: User;
      profile: SuperUserProfile;
      admin: SupabaseClient;
    }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
    };

export async function getSuperUserAccess(): Promise<SuperUserAccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "Não autenticado.",
    };
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, full_name, email, is_super_coordinator")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`super_user_profile_lookup_failed:${error.message}`);
  }

  if (!profile?.is_super_coordinator) {
    return {
      ok: false,
      status: 403,
      error: "Acesso reservado ao coordenador principal.",
    };
  }

  return {
    ok: true,
    user,
    profile: profile as SuperUserProfile,
    admin,
  };
}
