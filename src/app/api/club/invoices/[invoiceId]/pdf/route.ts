import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const { invoiceId } = await context.params;

    // RLS confirma que o user tem acesso a factura
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, pdf_path")
      .eq("id", invoiceId)
      .maybeSingle();
    if (error || !invoice) {
      return NextResponse.json(
        { error: "Factura nao encontrada." },
        { status: 404 },
      );
    }

    // Storage exception: usar admin para gerar signed URL (Pedro autorizou
    // boundary porque storage RLS valida bucket+path; createSignedUrl precisa
    // de service role para emitir token).
    const admin = createAdminClient();
    const { data: signed, error: signErr } = await admin.storage
      .from("invoices")
      .createSignedUrl(invoice.pdf_path, 60);

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: `Erro a gerar link: ${signErr?.message ?? "desconhecido"}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, url: signed.signedUrl });
  } catch (error) {
    return respondInternalError("api.club.invoices.pdf.get", error);
  }
}
