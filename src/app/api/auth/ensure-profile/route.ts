import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBetaOnboardingState,
  markBetaInviteAccepted,
  isBetaAllowed,
  linkInviteToClubMembership,
} from "@/lib/auth/beta-access.server";
import {
  isSuperCoordinatorEmail,
  normalizeEmail,
} from "@/lib/auth/beta-access";
import { NextResponse } from "next/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

export async function POST() {
  let normalizedEmail = "";
  let profileId: string | null = null;

  function buildSuperBypassResponse() {
    return NextResponse.json({
      success: true,
      betaAllowed: true,
      reason: "super_email",
      inviteType: null,
      requiresOnboarding: false,
      redirectTo: "/dashboard",
    });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    profileId = user.id;
    normalizedEmail = normalizeEmail(user.email ?? null);
    const admin = createAdminClient();

    const betaAccess = await isBetaAllowed(
      {
        profileId: user.id,
        email: normalizedEmail,
      },
      admin,
    );

    console.error("[ensure-profile] beta access decision", {
      profileId: user.id,
      emailLower: normalizedEmail,
      reason: betaAccess.reason,
    });

    if (!betaAccess.allowed) {
      return NextResponse.json(
        { error: betaAccess.reason === "no_invite" ? "no_invite" : betaAccess.reason },
        { status: 403 },
      );
    }

    const activeBetaInvite = betaAccess.reason === "invite_ok"
      ? betaAccess.invite
      : null;

    const { data: existingProfile, error: existingProfileError } = await admin
      .from("profiles")
      .select("id, full_name, role, email, avatar_url, is_super_coordinator")
      .eq("id", user.id)
      .maybeSingle();

    if (existingProfileError) {
      if (isSuperCoordinatorEmail(normalizedEmail)) {
        console.error("[ensure-profile] super bypass after profile lookup failure", {
          profileId: user.id,
          emailLower: normalizedEmail,
          reason: "profile_lookup_failed",
        });
        return buildSuperBypassResponse();
      }
      return NextResponse.json(
        { error: "Não foi possível validar o perfil." },
        { status: 500 },
      );
    }

    const shouldBeCoordinator =
      existingProfile?.role === "coordinator" ||
      activeBetaInvite?.invite_type === "beta_coordinator" ||
      isSuperCoordinatorEmail(user.email ?? null);

    const resolvedRole: "coordinator" | "coach" = shouldBeCoordinator
      ? "coordinator"
      : "coach";

    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      existingProfile?.full_name ||
      user.email?.split("@")[0] ||
      "Utilizador";
    const avatarUrl =
      user.user_metadata?.avatar_url ||
      user.user_metadata?.picture ||
      existingProfile?.avatar_url ||
      null;
    const isSuperCoordinator = isSuperCoordinatorEmail(normalizedEmail);

    if (!existingProfile) {
      const { error: insertError } = await admin.from("profiles").insert({
        id: user.id,
        full_name: fullName,
        role: resolvedRole,
        email: normalizedEmail,
        avatar_url: avatarUrl,
        is_super_coordinator: isSuperCoordinator,
      });

      if (insertError) {
        if (isSuperCoordinatorEmail(normalizedEmail)) {
          console.error("[ensure-profile] super bypass after profile insert failure", {
            profileId: user.id,
            emailLower: normalizedEmail,
            reason: "profile_insert_failed",
          });
          return buildSuperBypassResponse();
        }
        return NextResponse.json(
          { error: "Não foi possível criar o perfil." },
          { status: 500 },
        );
      }
    } else {
      const updates: Record<string, unknown> = {};
      if (!existingProfile.full_name && fullName) updates.full_name = fullName;
      if (existingProfile.role !== resolvedRole) updates.role = resolvedRole;
      if (normalizedEmail && existingProfile.email !== normalizedEmail) {
        updates.email = normalizedEmail;
      }
      if (!existingProfile.avatar_url && avatarUrl) updates.avatar_url = avatarUrl;
      if (existingProfile.is_super_coordinator !== isSuperCoordinator) {
        updates.is_super_coordinator = isSuperCoordinator;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await admin
          .from("profiles")
          .update(updates)
          .eq("id", user.id);

        if (updateError) {
          if (isSuperCoordinatorEmail(normalizedEmail)) {
            console.error("[ensure-profile] super bypass after profile update failure", {
              profileId: user.id,
              emailLower: normalizedEmail,
              reason: "profile_update_failed",
            });
            return buildSuperBypassResponse();
          }
          return NextResponse.json(
            { error: "Não foi possível atualizar o perfil." },
            { status: 500 },
          );
        }
      }
    }

    if (activeBetaInvite) {
      await markBetaInviteAccepted(normalizedEmail, admin);
      // Liga o profile ao clube alvo se o invite veio do wizard de admin
      // (metadata.club_id presente). Idempotente.
      try {
        await linkInviteToClubMembership(user.id, normalizedEmail, admin);
      } catch (linkError) {
        console.error("[ensure-profile] link-invite-to-club failed", {
          profileId: user.id,
          emailLower: normalizedEmail,
          error:
            linkError instanceof Error
              ? linkError.message
              : String(linkError),
        });
        // Nao falha o ensure-profile — utilizador continua logado;
        // a associacao pode ser feita manualmente depois pelo operador.
      }
    }

    const onboarding = await getBetaOnboardingState(user.id, normalizedEmail, admin);

    // Verificar se precisa de onboarding:
    // - Beta coordinator sem age_group → onboarding
    // - MAS se já tem club_memberships → NÃO precisa (club-first, escalão opcional)
    let requiresOnboarding = onboarding.requiresOnboarding;
    if (!requiresOnboarding && resolvedRole === "coordinator") {
      const [{ data: existingAgeGroup }, { data: existingClubMembership }] = await Promise.all([
        admin
          .from("age_groups")
          .select("id")
          .eq("coordinator_id", user.id)
          .limit(1)
          .maybeSingle(),
        admin
          .from("club_memberships")
          .select("club_id")
          .eq("profile_id", user.id)
          .limit(1)
          .maybeSingle(),
      ]);
      // Só precisa de onboarding se não tem age_group NEM club_membership
      requiresOnboarding = !existingAgeGroup && !existingClubMembership;
    }

    return NextResponse.json({
      success: true,
      betaAllowed: true,
      reason: betaAccess.reason,
      inviteType: activeBetaInvite?.invite_type ?? null,
      requiresOnboarding,
      redirectTo: requiresOnboarding ? "/onboarding" : "/dashboard",
    });
  } catch (error) {
    if (isSuperCoordinatorEmail(normalizedEmail)) {
      console.error("[ensure-profile] super bypass after unexpected failure", {
        profileId,
        emailLower: normalizedEmail,
        message: error instanceof Error ? error.message : String(error),
      });
      return buildSuperBypassResponse();
    }
    console.error("[ensure-profile] failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return respondInternalError("api.auth.ensure-profile.post", error);
  }
}
