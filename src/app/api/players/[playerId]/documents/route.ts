import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ playerId: string }>;
};

const DOC_TYPES = [
  "id_card",
  "birth_certificate",
  "sports_insurance",
  "medical_exam",
  "authorization",
  "photo",
  "other",
] as const;

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { playerId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("player_documents")
      .select("*")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Erro ao carregar documentos" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, documents: data ?? [] });
  } catch (error) {
    return respondInternalError("api.players.playerId.documents.get", error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { playerId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = formData.get("doc_type") as string;
    const notes = formData.get("notes") as string | null;
    const validFrom = formData.get("valid_from") as string | null;
    const validUntil = formData.get("valid_until") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Ficheiro obrigatório" },
        { status: 400 },
      );
    }

    if (!DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) {
      return NextResponse.json(
        { error: "Tipo de documento inválido" },
        { status: 400 },
      );
    }

    // Upload file to storage
    const ext = file.name.split(".").pop() || "bin";
    const filePath = `player-documents/${playerId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "Erro ao fazer upload: " + uploadError.message },
        { status: 500 },
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("uploads").getPublicUrl(filePath);

    const { data: doc, error: insertError } = await supabase
      .from("player_documents")
      .insert({
        player_id: playerId,
        doc_type: docType,
        file_url: publicUrl,
        file_name: file.name,
        notes: notes || null,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
        uploaded_by: user.id,
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Erro ao guardar documento: " + insertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, document: doc });
  } catch (error) {
    return respondInternalError("api.players.playerId.documents.post", error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { playerId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const docId = (body as { id?: string } | null)?.id;

    if (!docId) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    const { error } = await supabase
      .from("player_documents")
      .delete()
      .eq("id", docId)
      .eq("player_id", playerId);

    if (error) {
      return NextResponse.json(
        { error: "Erro ao apagar documento" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.players.playerId.documents.delete", error);
  }
}
