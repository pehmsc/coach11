import { NextResponse } from "next/server";
import { z } from "zod";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { sendInvoiceIssuedEmail } from "@/lib/email/send-invoice-email";
import type { Invoice } from "@/types/database";

export const runtime = "nodejs";

const MetadataSchema = z
  .object({
    invoice_number: z.string().trim().min(1).max(64),
    issued_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Data invalida"),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Data invalida"),
    period_start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable()
      .optional(),
    period_end: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable()
      .optional(),
    amount_cents: z.number().int().min(0).max(100_000_000),
    currency: z.string().trim().length(3).default("EUR"),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const { id: clubId } = await context.params;

    const { data, error } = await access.admin
      .from("invoices")
      .select(
        "id, club_id, invoice_number, period_start, period_end, issued_at, due_date, amount_cents, currency, status, paid_at, pdf_path, notes, created_at, created_by, updated_at",
      )
      .eq("club_id", clubId)
      .order("issued_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: `Erro ao carregar facturas: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, invoices: (data ?? []) as Invoice[] });
  } catch (error) {
    return respondInternalError("api.admin.clubs.invoices.get", error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const { id: clubId } = await context.params;

    // Multipart: campo "metadata" (JSON string) + campo "pdf" (File)
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { error: "Pedido invalido (multipart/form-data esperado)." },
        { status: 400 },
      );
    }

    const rawMetadata = form.get("metadata");
    if (typeof rawMetadata !== "string") {
      return NextResponse.json(
        { error: "Campo 'metadata' em falta." },
        { status: 400 },
      );
    }

    let metadataJson: unknown;
    try {
      metadataJson = JSON.parse(rawMetadata);
    } catch {
      return NextResponse.json(
        { error: "Metadata invalida (JSON)." },
        { status: 400 },
      );
    }

    const parsed = MetadataSchema.safeParse(metadataJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }
    const metadata = parsed.data;

    // Validacao adicional: datas coerentes
    if (metadata.due_date < metadata.issued_at) {
      return NextResponse.json(
        { error: "Vencimento nao pode ser anterior a emissao." },
        { status: 400 },
      );
    }
    if (
      metadata.period_start &&
      metadata.period_end &&
      metadata.period_end < metadata.period_start
    ) {
      return NextResponse.json(
        { error: "Fim do periodo nao pode ser anterior ao inicio." },
        { status: 400 },
      );
    }

    const pdf = form.get("pdf");
    if (!(pdf instanceof File) || pdf.size === 0) {
      return NextResponse.json(
        { error: "PDF obrigatorio." },
        { status: 400 },
      );
    }
    if (pdf.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Ficheiro deve ser PDF (application/pdf)." },
        { status: 400 },
      );
    }
    if (pdf.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "PDF demasiado grande (max 10 MB)." },
        { status: 400 },
      );
    }

    // Confirma clube existente + recolhe dados para email
    const { data: clubRow, error: clubErr } = await access.admin
      .from("clubs")
      .select("id, name, billing_email, pending_coordinator_email, pending_coordinator_name")
      .eq("id", clubId)
      .maybeSingle();
    if (clubErr || !clubRow) {
      return NextResponse.json(
        { error: "Clube nao encontrado." },
        { status: 404 },
      );
    }

    // Conflito invoice_number
    const { data: existing } = await access.admin
      .from("invoices")
      .select("id")
      .eq("club_id", clubId)
      .eq("invoice_number", metadata.invoice_number)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        {
          error: `Ja existe factura ${metadata.invoice_number} neste clube.`,
        },
        { status: 409 },
      );
    }

    // Gera UUID para invoice (para o path no storage)
    const invoiceId = crypto.randomUUID();
    const pdfPath = `${clubId}/${invoiceId}.pdf`;

    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    const { error: uploadErr } = await access.admin.storage
      .from("invoices")
      .upload(pdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json(
        { error: `Erro a guardar PDF: ${uploadErr.message}` },
        { status: 500 },
      );
    }

    const { error: insertErr } = await access.admin.from("invoices").insert({
      id: invoiceId,
      club_id: clubId,
      invoice_number: metadata.invoice_number,
      period_start: metadata.period_start ?? null,
      period_end: metadata.period_end ?? null,
      issued_at: metadata.issued_at,
      due_date: metadata.due_date,
      amount_cents: metadata.amount_cents,
      currency: metadata.currency,
      pdf_path: pdfPath,
      notes: metadata.notes ?? null,
      created_by: access.user.id,
    });

    if (insertErr) {
      // Limpa PDF orfao
      await access.admin.storage.from("invoices").remove([pdfPath]).catch(() => null);
      return NextResponse.json(
        { error: `Erro a criar factura: ${insertErr.message}` },
        { status: 500 },
      );
    }

    // Email automatico de notificacao (soft-fail — nao bloqueia a criacao)
    const recipient =
      clubRow.billing_email || clubRow.pending_coordinator_email || null;
    let emailWarning: string | undefined;
    if (recipient) {
      const emailRes = await sendInvoiceIssuedEmail({
        to: recipient,
        clubName: clubRow.name,
        recipientName: clubRow.pending_coordinator_name,
        invoiceNumber: metadata.invoice_number,
        amountCents: metadata.amount_cents,
        currency: metadata.currency,
        issuedAt: metadata.issued_at,
        dueDate: metadata.due_date,
        pdfBuffer,
      });
      if (!emailRes.sent) emailWarning = emailRes.warning;
    } else {
      emailWarning = "Sem email de facturacao no clube — notificacao omitida.";
    }

    return NextResponse.json({ success: true, id: invoiceId, emailWarning });
  } catch (error) {
    return respondInternalError("api.admin.clubs.invoices.post", error);
  }
}
