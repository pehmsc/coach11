import { NextResponse } from "next/server";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { sendInvoiceIssuedEmail } from "@/lib/email/send-invoice-email";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; invoiceId: string }> },
) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const { id: clubId, invoiceId } = await context.params;

    const { data: invoice, error: invErr } = await access.admin
      .from("invoices")
      .select(
        "id, invoice_number, amount_cents, currency, issued_at, due_date, status",
      )
      .eq("id", invoiceId)
      .eq("club_id", clubId)
      .maybeSingle();
    if (invErr || !invoice) {
      return NextResponse.json(
        { error: "Factura nao encontrada." },
        { status: 404 },
      );
    }
    if (invoice.status === "cancelled") {
      return NextResponse.json(
        { error: "Nao e possivel reenviar email de factura cancelada." },
        { status: 409 },
      );
    }

    const { data: club, error: clubErr } = await access.admin
      .from("clubs")
      .select("name, billing_email, pending_coordinator_email, pending_coordinator_name")
      .eq("id", clubId)
      .maybeSingle();
    if (clubErr || !club) {
      return NextResponse.json(
        { error: "Clube nao encontrado." },
        { status: 404 },
      );
    }

    const recipient =
      club.billing_email || club.pending_coordinator_email || null;
    if (!recipient) {
      return NextResponse.json(
        {
          error:
            "Clube nao tem email de facturacao nem coordenador pendente. Preenche um deles primeiro.",
        },
        { status: 400 },
      );
    }

    const result = await sendInvoiceIssuedEmail({
      to: recipient,
      clubName: club.name,
      recipientName: club.pending_coordinator_name,
      invoiceNumber: invoice.invoice_number,
      amountCents: invoice.amount_cents,
      currency: invoice.currency,
      issuedAt: invoice.issued_at,
      dueDate: invoice.due_date,
    });

    if (!result.sent) {
      return NextResponse.json(
        { error: result.warning || "Falha ao enviar email." },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, sentTo: recipient });
  } catch (error) {
    return respondInternalError(
      "api.admin.clubs.invoices.resend.post",
      error,
    );
  }
}
