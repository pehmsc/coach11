import { NextResponse } from "next/server";
import { z } from "zod";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { parseBody } from "@/lib/http/validate";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const ActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("mark_paid"),
      paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Data invalida"),
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel"),
      reason: z.string().trim().max(500).optional(),
    })
    .strict(),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; invoiceId: string }> },
) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const { id: clubId, invoiceId } = await context.params;

    const parsed = await parseBody(request, ActionSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const { data: invoice, error: fetchErr } = await access.admin
      .from("invoices")
      .select("id, status, notes")
      .eq("id", invoiceId)
      .eq("club_id", clubId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        { error: `Erro a carregar factura: ${fetchErr.message}` },
        { status: 500 },
      );
    }
    if (!invoice) {
      return NextResponse.json(
        { error: "Factura nao encontrada." },
        { status: 404 },
      );
    }

    if (body.action === "mark_paid") {
      if (invoice.status !== "issued") {
        return NextResponse.json(
          { error: "So facturas em aberto podem ser marcadas como pagas." },
          { status: 409 },
        );
      }
      const { error: updErr } = await access.admin
        .from("invoices")
        .update({ status: "paid", paid_at: body.paid_at })
        .eq("id", invoiceId);
      if (updErr) {
        return NextResponse.json(
          { error: `Erro a actualizar: ${updErr.message}` },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true });
    }

    // action === cancel
    if (invoice.status === "cancelled") {
      return NextResponse.json(
        { error: "Factura ja esta cancelada." },
        { status: 409 },
      );
    }
    if (invoice.status === "paid") {
      return NextResponse.json(
        { error: "Nao e possivel cancelar uma factura ja paga." },
        { status: 409 },
      );
    }

    // Concatena reason as notas (audit trail leve)
    const cancelNote = body.reason
      ? `[Cancelada] ${body.reason}`
      : "[Cancelada]";
    const notes = invoice.notes
      ? `${invoice.notes}\n${cancelNote}`
      : cancelNote;

    const { error: updErr } = await access.admin
      .from("invoices")
      .update({ status: "cancelled", notes })
      .eq("id", invoiceId);
    if (updErr) {
      return NextResponse.json(
        { error: `Erro a cancelar: ${updErr.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.admin.clubs.invoices.patch", error);
  }
}
