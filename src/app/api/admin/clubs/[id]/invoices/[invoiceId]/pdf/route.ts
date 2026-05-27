import { NextResponse } from "next/server";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

/**
 * GET .../pdf            → devolve JSON com signed URL (60s), para download.
 * GET .../pdf?stream=1   → devolve o PDF binario inline (same-origin), para
 *                          usar em <iframe>/<embed>. Necessario porque a CDN
 *                          do Supabase serve PDFs com X-Frame-Options: DENY
 *                          que bloqueia embedding directo.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; invoiceId: string }> },
) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const { id: clubId, invoiceId } = await context.params;

    const { data: invoice, error } = await access.admin
      .from("invoices")
      .select("id, pdf_path, invoice_number")
      .eq("id", invoiceId)
      .eq("club_id", clubId)
      .maybeSingle();
    if (error || !invoice) {
      return NextResponse.json(
        { error: "Factura nao encontrada." },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(request.url);
    const inline = searchParams.get("stream") === "1";

    if (inline) {
      const { data: blob, error: dlErr } = await access.admin.storage
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

    const { data: signed, error: signErr } = await access.admin.storage
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
    return respondInternalError("api.admin.clubs.invoices.pdf.get", error);
  }
}
