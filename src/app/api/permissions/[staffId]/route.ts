import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALL_PERMISSION_AREAS,
  PERMISSION_TEMPLATES,
  type PermissionArea,
  type AreaPermissions,
} from "@/lib/auth/permissions";
import { isSuperCoordinatorEmail } from "@/lib/auth/beta-access";
import { NextResponse } from "next/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

async function resolveStaffAccess(
  userId: string,
  userEmail: string | null | undefined,
  staffId: string,
) {
  const admin = createAdminClient();

  const { data: staffRecord } = await admin
    .from("age_group_staff")
    .select("id, age_group_id, profile_id, role, club_id")
    .eq("id", staffId)
    .maybeSingle();

  if (!staffRecord) {
    return { ok: false as const, status: 404, error: "Membro não encontrado", admin };
  }

  const { data: ageGroup } = await admin
    .from("age_groups")
    .select("id, coordinator_id")
    .eq("id", staffRecord.age_group_id)
    .maybeSingle();

  if (!ageGroup) {
    return { ok: false as const, status: 404, error: "Escalão não encontrado", admin };
  }

  const isSuperAdmin = isSuperCoordinatorEmail(userEmail ?? null);
  const isCoordinator = ageGroup.coordinator_id === userId;
  const isSelf = staffRecord.profile_id === userId;

  if (!isSuperAdmin && !isCoordinator && !isSelf) {
    return { ok: false as const, status: 403, error: "Sem permissão", admin };
  }

  return {
    ok: true as const,
    admin,
    staffRecord: staffRecord as {
      id: string;
      age_group_id: string;
      profile_id: string;
      role: string;
      club_id: string | null;
    },
    ageGroup: ageGroup as { id: string; coordinator_id: string },
    isCoordinator,
    isSuperAdmin,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ staffId: string }> },
) {
  try {
    const { staffId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const access = await resolveStaffAccess(user.id, user.email, staffId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { admin, staffRecord, isCoordinator, isSuperAdmin } = access;

    const { data: permissions } = await admin
      .from("staff_permissions")
      .select("area, can_read, can_write, can_edit, can_delete")
      .eq("staff_id", staffId);

    return NextResponse.json({
      permissions: permissions ?? [],
      staffRecord,
      canManage: isCoordinator || isSuperAdmin,
    });
  } catch (error) {
    return respondInternalError("api.permissions.staffId.get", error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ staffId: string }> },
) {
  try {
    const { staffId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const access = await resolveStaffAccess(user.id, user.email, staffId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { admin, staffRecord, isCoordinator, isSuperAdmin } = access;

    if (!isCoordinator && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Apenas o coordenador pode gerir permissões" },
        { status: 403 },
      );
    }

    // Treinador Principal tem RWED automático — não editável na tabela
    if (staffRecord.role === "coach") {
      return NextResponse.json(
        { error: "O Treinador Principal tem RWED automático em tudo" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const { permissions, template } = body as {
      permissions?: Array<{ area: PermissionArea } & AreaPermissions>;
      template?: string;
    };

    type PermRow = { staff_id: string; area: string } & AreaPermissions;
    let rows: PermRow[];

    if (template === "principal" || template === "adjunto" || template === "estagiario") {
      const tpl = PERMISSION_TEMPLATES[template];
      rows = ALL_PERMISSION_AREAS.map((area) => ({
        staff_id: staffId,
        area,
        ...tpl[area],
      }));
    } else if (Array.isArray(permissions)) {
      rows = permissions.map((p) => ({
        staff_id: staffId,
        area: p.area,
        can_read: !!p.can_read,
        can_write: !!p.can_write,
        can_edit: !!p.can_edit,
        can_delete: !!p.can_delete,
      }));
    } else {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const { error: upsertError } = await admin
      .from("staff_permissions")
      .upsert(rows, { onConflict: "staff_id,area" });

    if (upsertError) {
      console.error("Erro ao guardar permissões:", upsertError);
      return NextResponse.json({ error: "Erro ao guardar permissões" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.permissions.staffId.put", error);
  }
}
