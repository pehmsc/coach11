import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  deleteAgeGroupCascade,
  listManagedAgeGroups,
} from "@/lib/team/delete-age-group";

export const runtime = "nodejs";

type DeleteAgeGroupPayload = {
  confirmation?: string;
  ageGroupId?: string;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const managedAgeGroups = await listManagedAgeGroups(supabase, user.id);

    return NextResponse.json({
      success: true,
      managedAgeGroups,
    });
  } catch (error) {
    return respondInternalError("api.me.age-group.get", error);
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as DeleteAgeGroupPayload | null;
    if (body?.confirmation !== "DELETE_AGE_GROUP") {
      return NextResponse.json(
        { error: "Confirmação inválida para apagar o escalão." },
        { status: 400 },
      );
    }

    const requestedAgeGroupId =
      typeof body.ageGroupId === "string" && body.ageGroupId.trim()
        ? body.ageGroupId.trim()
        : null;

    const managedAgeGroups = await listManagedAgeGroups(supabase, user.id);

    if (managedAgeGroups.length === 0) {
      return NextResponse.json(
        { error: "Não existe nenhum escalão coordenado para apagar." },
        { status: 404 },
      );
    }

    const targetAgeGroup =
      (requestedAgeGroupId
        ? managedAgeGroups.find((ageGroup) => ageGroup.id === requestedAgeGroupId)
        : managedAgeGroups[0]) || null;

    if (!targetAgeGroup) {
      return NextResponse.json(
        { error: "Escalão não encontrado ou sem permissões para apagar." },
        { status: 404 },
      );
    }

    await deleteAgeGroupCascade(supabase, targetAgeGroup.id, {
      retainClubMembershipProfileIds: [user.id],
    });

    return NextResponse.json({
      success: true,
      deletedAgeGroupId: targetAgeGroup.id,
      deletedAgeGroupName: targetAgeGroup.name || null,
    });
  } catch (error) {
    return respondInternalError("api.me.age-group.delete", error);
  }
}
