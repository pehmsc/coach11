import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isBetaAllowed,
  isSuperCoordinatorEmail,
  markBetaInviteAccepted,
} from "@/lib/auth/beta-access";
import { NextResponse } from "next/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export async function POST() {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const betaAccess = await isBetaAllowed(
      {
        profileId: user.id,
        email: user.email ?? null,
      },
      admin,
    );

    if (!betaAccess.allowed) {
      return NextResponse.json(
        { error: "Acesso beta por convite obrigatório." },
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
    const normalizedEmail = typeof user.email === "string"
      ? user.email.trim().toLowerCase()
      : null;
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
          return NextResponse.json(
            { error: "Não foi possível atualizar o perfil." },
            { status: 500 },
          );
        }
      }
    }

    if (activeBetaInvite) {
      await markBetaInviteAccepted(normalizedEmail, admin);
    }

    return NextResponse.json({
      success: true,
      betaAllowed: true,
      reason: betaAccess.reason,
      inviteType: activeBetaInvite?.invite_type ?? null,
    });
  } catch (error) {
    return respondInternalError("api.auth.ensure-profile.post", error);
  }
}
