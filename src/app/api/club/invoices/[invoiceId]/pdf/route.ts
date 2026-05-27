import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

/**
 * GET .../pdf            → JSON com signed URL (60s), para download.
 * GET .../pdf?stream=1   → PDF binario inline (same-origin), para <iframe>.
 *                          CDN do Supabase serve PDFs com X-Frame-Options: DENY,
 *                          por isso temos de proxiar para preview funcionar.
 */
export async function GET(
  request: Request,
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
      .select("id, pdf_path, invoice_number")
      .eq("id", invoiceId)
      .maybeSingle();
    if (error || !invoice) {
      return NextResponse.json(
        { error: "Factura nao encontrada." },
        { status: 404 },
      );
    }

    const admin = createAdminClient();

    const { searchParams } = new URL(request.url);
    const inline = searchParams.get("stream") === "1";

    if (inline) {
      const { data: blob, error: dlErr } = await admin.storage
        .from("invoices")
        .download(invoice.pdf_path);
      if (dlErr || !blob) {
        return NextResponse.json(
          { error: `Erro a carregar PDF: ${dlErr?.message ?? "desconhecido"}` },
          { status: 500 },
        );
      }
      const buffer = Buffer.from(await blob.arrayBuffer());
      const safeName = invoice.invoice_number.replace(/[^A-Za-z0-9._-]+/g, "_");
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${safeName || "factura"}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

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
