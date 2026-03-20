import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

type RouteParams = { params: Promise<{ id: string; phaseId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const check = await checkPermission("trainings", "delete");
    if (!check.allowed) return check.response;

    const { phaseId } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from("training_phases")
      .delete()
      .eq("id", phaseId);

    if (error) {
      return NextResponse.json(
        { error: "Erro ao apagar fase." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.trainings.id.phases.phaseId.delete", error);
  }
}
