import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ALLOWED_TEAM_STAFF_ROLES = new Set([
  "head_coach",
  "assistant_coach",
  "coordinator",
]);

type TeamStaffRow = {
  id: string;
  team_id: string;
  profile_id: string;
  role: string | null;
};

function normalizeRole(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const role = value.trim();
  if (role === "coach") return "head_coach";
  if (ALLOWED_TEAM_STAFF_ROLES.has(role)) return role;
  return null;
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function assertCoordinatorCanManageStaff(
  admin: ReturnType<typeof createAdminClient>,
  teamStaffId: string,
  requesterId: string,
) {
  const { data: teamStaff, error: teamStaffError } = await admin
    .from("team_staff")
    .select("id, team_id, profile_id, role")
    .eq("id", teamStaffId)
    .maybeSingle();

  if (teamStaffError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Erro ao validar membro da equipa técnica." },
        { status: 500 },
      ),
    };
  }

  if (!teamStaff) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Membro da equipa técnica não encontrado." },
        { status: 404 },
      ),
    };
  }

  const row = teamStaff as TeamStaffRow;

  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("id, age_group_id")
    .eq("id", row.team_id)
    .maybeSingle();

  if (teamError || !team?.age_group_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Não foi possível validar a equipa deste membro." },
        { status: 500 },
      ),
    };
  }

  const { data: managedAgeGroup } = await admin
    .from("age_groups")
    .select("id")
    .eq("id", team.age_group_id)
    .eq("coordinator_id", requesterId)
    .maybeSingle();

  if (!managedAgeGroup) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Apenas o coordenador pode gerir a equipa técnica." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    row,
  };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id: teamStaffId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const roleInput =
      "role" in body ? normalizeRole((body as Record<string, unknown>).role) : null;
    const roleProvided = "role" in body;
    if (roleProvided && !roleInput) {
      return NextResponse.json({ error: "Cargo inválido." }, { status: 400 });
    }

    const emailProvided = "email" in body;
    const rawEmail = normalizeOptionalText((body as Record<string, unknown>).email);
    if (emailProvided && rawEmail && !isValidEmail(rawEmail)) {
      return NextResponse.json({ error: "Email inválido." }, { status: 400 });
    }

    const phoneProvided = "phone" in body;
    const normalizedPhone = normalizeOptionalText(
      (body as Record<string, unknown>).phone,
    );

    if (!roleProvided && !emailProvided && !phoneProvided) {
      return NextResponse.json(
        { error: "Sem campos para atualizar." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const access = await assertCoordinatorCanManageStaff(admin, teamStaffId, user.id);
    if (!access.ok) return access.response;

    const teamStaffUpdates: Record<string, string> = {};
    if (roleProvided && roleInput) {
      teamStaffUpdates.role = roleInput;
    }

    if (Object.keys(teamStaffUpdates).length > 0) {
      const { error: updateStaffError } = await admin
        .from("team_staff")
        .update(teamStaffUpdates)
        .eq("id", teamStaffId);

      if (updateStaffError) {
        return NextResponse.json(
          { error: "Erro ao atualizar cargo na equipa técnica." },
          { status: 500 },
        );
      }
    }

    const profileUpdates: Record<string, string | null> = {};
    if (emailProvided) profileUpdates.email = rawEmail;
    if (phoneProvided) profileUpdates.phone = normalizedPhone;

    if (Object.keys(profileUpdates).length > 0) {
      const { error: updateProfileError } = await admin
        .from("profiles")
        .update(profileUpdates)
        .eq("id", access.row.profile_id);

      if (updateProfileError) {
        return NextResponse.json(
          { error: "Erro ao atualizar dados do utilizador." },
          { status: 500 },
        );
      }
    }

    let authEmailSync: "not_requested" | "updated" | "provider_managed" | "failed" =
      "not_requested";
    let authEmailSyncMessage: string | null = null;

    if (emailProvided && rawEmail) {
      try {
        const { data: authUserData, error: authUserError } =
          await admin.auth.admin.getUserById(access.row.profile_id);

        if (authUserError) {
          authEmailSync = "failed";
          authEmailSyncMessage = "Não foi possível validar o email no Auth.";
        } else {
          const providers =
            authUserData.user?.identities
              ?.map((identity) => identity.provider)
              .filter((provider): provider is string => typeof provider === "string") || [];
          const hasEmailProvider = providers.includes("email");
          const onlyGoogleProvider =
            providers.length > 0 && providers.every((provider) => provider === "google");

          if (onlyGoogleProvider && !hasEmailProvider) {
            authEmailSync = "provider_managed";
            authEmailSyncMessage =
              "Conta com login Google: o email de autenticação é gerido pelo Google.";
          } else {
            const { error: authUpdateError } = await admin.auth.admin.updateUserById(
              access.row.profile_id,
              {
                email: rawEmail,
                email_confirm: true,
              },
            );

            if (authUpdateError) {
              authEmailSync = "failed";
              authEmailSyncMessage = "Não foi possível sincronizar o email no Auth.";
            } else {
              authEmailSync = "updated";
            }
          }
        }
      } catch {
        authEmailSync = "failed";
        authEmailSyncMessage = "Erro ao sincronizar email no Auth.";
      }
    }

    const [{ data: updatedStaff }, { data: updatedProfile }] = await Promise.all([
      admin
        .from("team_staff")
        .select("id, profile_id, role")
        .eq("id", teamStaffId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("full_name, email, phone, avatar_url")
        .eq("id", access.row.profile_id)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      success: true,
      staffMember: {
        id: updatedStaff?.id ?? teamStaffId,
        profile_id: updatedStaff?.profile_id ?? access.row.profile_id,
        role: updatedStaff?.role ?? access.row.role ?? null,
        full_name: updatedProfile?.full_name ?? null,
        email: updatedProfile?.email ?? null,
        phone: updatedProfile?.phone ?? null,
        avatar_url: updatedProfile?.avatar_url ?? null,
      },
      authEmailSync,
      authEmailSyncMessage,
    });
  } catch (error) {
    console.error("Erro ao atualizar membro da equipa técnica:", error);
    return respondInternalError("api.staff.id.patch", error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id: teamStaffId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const admin = createAdminClient();
    const access = await assertCoordinatorCanManageStaff(admin, teamStaffId, user.id);
    if (!access.ok) return access.response;

    const { error: deleteError } = await admin
      .from("team_staff")
      .delete()
      .eq("id", teamStaffId);

    if (deleteError) {
      return NextResponse.json(
        { error: "Erro ao remover membro da equipa técnica." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao remover membro da equipa técnica:", error);
    return respondInternalError("api.staff.id.delete", error);
  }
}
