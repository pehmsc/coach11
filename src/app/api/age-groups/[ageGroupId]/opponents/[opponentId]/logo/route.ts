import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const BUCKET = "opponent-logos";
const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB pre-resize (cliente faz resize para ~200KB)

type RouteContext = {
  params: Promise<{ ageGroupId: string; opponentId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { ageGroupId, opponentId } = await params;
    if (!ageGroupId || !opponentId) {
      return NextResponse.json({ error: "Parametros invalidos." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    const context = await resolveUserTeamContext(supabase, user.id);
    if (!context.accessibleAgeGroupIds.includes(ageGroupId)) {
      return NextResponse.json(
        { error: "Sem permissoes para este escalao." },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Ficheiro em falta." }, { status: 400 });
    }

    if (!ACCEPTED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: "Tipo invalido. PNG, JPEG ou WebP." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Ficheiro acima de 5MB." },
        { status: 400 },
      );
    }

    const ext = file.type === "image/png"
      ? "png"
      : file.type === "image/jpeg"
        ? "jpg"
        : "webp";
    const filePath = `${ageGroupId}/${opponentId}.${ext}`;
    const buffer = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      return respondInternalError(
        "api.age-groups.opponents.logo.post.upload",
        uploadError,
        { request, userId: user.id, ageGroupId },
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    // Cache-bust query param
    const logoUrl = `${publicUrl}?v=${Date.now()}`;

    const { data: updated, error: updateError } = await supabase
      .from("opponents")
      .update({ logo_url: logoUrl })
      .eq("id", opponentId)
      .eq("age_group_id", ageGroupId)
      .select("id, logo_url")
      .maybeSingle();

    if (updateError) {
      return respondInternalError(
        "api.age-groups.opponents.logo.post.update",
        updateError,
        { request, userId: user.id, ageGroupId },
      );
    }
    if (!updated) {
      return NextResponse.json(
        { error: "Adversario nao encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, logo_url: updated.logo_url });
  } catch (error) {
    return respondInternalError(
      "api.age-groups.opponents.logo.post",
      error,
      { request },
    );
  }
}
