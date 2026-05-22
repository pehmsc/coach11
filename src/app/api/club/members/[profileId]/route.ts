import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { ALL_PERMISSION_AREAS } from "@/lib/auth/permissions-shared";
import { z } from "zod";

export const runtime = "nodejs";

const CLUB_COORDINATOR_ROLES = new Set(["coordinator", "club_coordinator", "owner", "admin"]);

type RouteContext = {
  params: Promise<{ profileId: string }>;
};

async function assertClubCoordinator(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<{ clubId: string } | NextResponse> {
  const { data: membership } = await admin
    .from("club_memberships")
    .select("club_id, role")
    .eq("profile_id", userId)
    .in("role", [...CLUB_COORDINATOR_ROLES])
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "Apenas o coordenador de clube pode gerir membros." },
      { status: 403 },
    );
  }

  return { clubId: membership.club_id };
}

// GET /api/club/members/[profileId] — dados do membro para o dialog de edição
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { profileId } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const admin = createAdminClient();
    const authResult = await assertClubCoordinator(admin, user.id);
    if (authResult instanceof NextResponse) return authResult;
    const { clubId } = authResult;

    const [profileRes, ageGroupStaffRes] = await Promise.all([
      admin.from("profiles").select("id, full_name, email, phone").eq("id", profileId).maybeSingle(),
      admin
        .from("age_group_staff")
        .select("id, age_group_id, role, club_id")
        .eq("profile_id", profileId)
        .eq("club_id", clubId),
    ]);

    if (!profileRes.data) {
      return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });
    }

    const staffEntries = ageGroupStaffRes.data ?? [];
    const primaryEntry = staffEntries[0];
    const ageGroupIds = staffEntries.map((s) => s.age_group_id).filter(Boolean) as string[];

    // Buscar permissões do staff principal
    let permissions: Array<{
      area: string;
      can_read: boolean;
      can_write: boolean;
      can_edit: boolean;
      can_delete: boolean;
    }> = [];

    if (primaryEntry) {
      const { data: permsData } = await admin
        .from("staff_permissions")
        .select("area, can_read, can_write, can_edit, can_delete")
        .eq("staff_id", primaryEntry.id);

      if (permsData) {
        permissions = permsData as typeof permissions;
      }
    }

    return NextResponse.json({
      profile_id: profileRes.data.id,
      full_name: profileRes.data.full_name,
      email: profileRes.data.email,
      phone: profileRes.data.phone,
      role: primaryEntry?.role ?? null,
      ageGroupIds,
      permissions,
    });
  } catch (error) {
    return respondInternalError("api.club.members.profileId.get", error);
  }
}

const PatchBodySchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  phone: z.string().max(30).nullable().optional(),
  role: z.string().min(1).max(50).optional(),
  ageGroupIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  permissions: z
    .array(
      z.object({
        area: z.string().max(50),
        can_read: z.boolean(),
        can_write: z.boolean(),
        can_edit: z.boolean(),
        can_delete: z.boolean(),
      }),
    )
    .max(20)
    .optional(),
});

// PATCH /api/club/members/[profileId] — editar nome, telefone, role, escalões, permissões
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { profileId } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const admin = createAdminClient();
    const authResult = await assertClubCoordinator(admin, user.id);
    if (authResult instanceof NextResponse) return authResult;
    const { clubId } = authResult;

    const body = await request.json().catch(() => null);
    const parsed = PatchBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { fullName, phone, role, ageGroupIds, permissions } = parsed.data;

    // Verificar que o membro pertence ao clube
    const { data: existingStaff } = await admin
      .from("age_group_staff")
      .select("id, age_group_id, role, club_id")
      .eq("profile_id", profileId)
      .eq("club_id", clubId);

    if (!existingStaff || existingStaff.length === 0) {
      return NextResponse.json({ error: "Membro não encontrado neste clube." }, { status: 404 });
    }

    // 1. Actualizar nome e telefone no perfil
    if (fullName !== undefined || phone !== undefined) {
      const profileUpdate: Record<string, unknown> = {};
      if (fullName !== undefined) profileUpdate.full_name = fullName;
      if (phone !== undefined) profileUpdate.phone = phone;
      await admin.from("profiles").update(profileUpdate).eq("id", profileId);
    }

    // 2. Actualizar role em todas as entradas age_group_staff
    if (role !== undefined) {
      await admin
        .from("age_group_staff")
        .update({ role })
        .eq("profile_id", profileId)
        .eq("club_id", clubId);
    }

    // 3. Actualizar escalões (DELETE removidos, INSERT novos)
    if (ageGroupIds !== undefined) {
      const existingIds = new Set(existingStaff.map((s) => s.age_group_id as string).filter(Boolean));
      const requestedIds = new Set(ageGroupIds);

      const toRemove = [...existingIds].filter((id) => !requestedIds.has(id));
      const toAdd = [...requestedIds].filter((id) => !existingIds.has(id));

      if (toRemove.length > 0) {
        await admin
          .from("age_group_staff")
          .delete()
          .eq("profile_id", profileId)
          .eq("club_id", clubId)
          .in("age_group_id", toRemove);
      }

      if (toAdd.length > 0) {
        const effectiveRole = role ?? existingStaff[0]?.role ?? "assistant_coach";
        const inserts = toAdd.map((ageGroupId) => ({
          age_group_id: ageGroupId,
          club_id: clubId,
          profile_id: profileId,
          role: effectiveRole,
        }));
        await admin.from("age_group_staff").insert(inserts);
      }
    }

    // 4. Actualizar permissões para todos os staff_ids do membro
    if (permissions !== undefined && permissions.length > 0) {
      const { data: refreshedStaff } = await admin
        .from("age_group_staff")
        .select("id")
        .eq("profile_id", profileId)
        .eq("club_id", clubId);

      if (refreshedStaff && refreshedStaff.length > 0) {
        const upserts = refreshedStaff.flatMap((s) =>
          ALL_PERMISSION_AREAS.map((area) => {
            const perm = permissions.find((p) => p.area === area);
            return {
              staff_id: s.id,
              area,
              can_read: perm?.can_read ?? true,
              can_write: perm?.can_write ?? false,
              can_edit: perm?.can_edit ?? false,
              can_delete: perm?.can_delete ?? false,
            };
          }),
        );
        await admin
          .from("staff_permissions")
          .upsert(upserts, { onConflict: "staff_id,area" });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.club.members.profileId.patch", error);
  }
}

// DELETE /api/club/members/[profileId] — eliminar conta do membro por completo
// Apaga auth.users -> CASCADE para profiles, club_memberships, age_group_staff,
// staff_permissions, team_staff, staff_invites.invited_by. Conteudo de autoria
// (exercicios, microciclos, observacoes, etc.) preserva-se com created_by NULL
// via FKs ON DELETE SET NULL (migration 20260522222107).
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { profileId } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    if (profileId === user.id) {
      return NextResponse.json({ error: "Não podes remover-te a ti próprio." }, { status: 400 });
    }

    const admin = createAdminClient();
    const authResult = await assertClubCoordinator(admin, user.id);
    if (authResult instanceof NextResponse) return authResult;
    const { clubId } = authResult;

    // Confirmar que o membro pertence a este clube antes de apagar a conta.
    const { data: targetMembership } = await admin
      .from("club_memberships")
      .select("profile_id")
      .eq("profile_id", profileId)
      .eq("club_id", clubId)
      .maybeSingle();

    if (!targetMembership) {
      return NextResponse.json({ error: "Membro não encontrado neste clube." }, { status: 404 });
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(profileId);
    if (deleteError) {
      console.error("[api.club.members.delete] auth.admin.deleteUser falhou", {
        profileId,
        clubId,
        error: deleteError.message,
      });
      return NextResponse.json(
        { error: `Não foi possível eliminar a conta: ${deleteError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.club.members.profileId.delete", error);
  }
}
