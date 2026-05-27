import { NextResponse } from "next/server";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
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
      .select("id, pdf_path")
      .eq("id", invoiceId)
      .eq("club_id", clubId)
      .maybeSingle();
    if (error || !invoice) {
      return NextResponse.json(
        { error: "Factura nao encontrada." },
        { status: 404 },
      );
    }

    const { data: signed, error: signErr } = await access.admin.storage
      .from("invoices")
      .createSignedUrl(invoice.pdf_path, 60); // 60s

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
