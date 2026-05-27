/**
 * Helpers para facturacao (B1). Sem dependencias de cliente / DB —
 * apenas formatacao e calculos sobre objectos invoice.
 */

export type InvoiceStatus = "issued" | "paid" | "cancelled";

export interface InvoiceLike {
  status: InvoiceStatus;
  due_date: string; // ISO date (YYYY-MM-DD)
  paid_at: string | null;
}

/** Formata centimos em string localizada (ex: 15000, "EUR" -> "150,00 €"). */
export function formatCents(amount_cents: number, currency = "EUR"): string {
  const value = amount_cents / 100;
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** True se factura esta emitida e a data de vencimento ja passou. */
export function isOverdue(
  invoice: InvoiceLike,
  today: Date = new Date(),
): boolean {
  if (invoice.status !== "issued") return false;
  const due = parseIsoDate(invoice.due_date);
  return due.getTime() < toUtcMidnight(today).getTime();
}

/** Numero de dias de atraso (>= 0). 0 se nao esta em atraso. */
export function daysOverdue(
  invoice: InvoiceLike,
  today: Date = new Date(),
): number {
  if (!isOverdue(invoice, today)) return 0;
  const due = parseIsoDate(invoice.due_date);
  const t = toUtcMidnight(today);
  const diffMs = t.getTime() - due.getTime();
  return Math.floor(diffMs / 86_400_000);
}

/**
 * Devolve label para mostrar no status badge.
 * - "Paga · 14 Abr" se paga
 * - "Em atraso · +8d" se issued + overdue
 * - "Em aberto" se issued
 * - "Cancelada" se cancelled
 */
export function statusLabel(
  invoice: InvoiceLike,
  today: Date = new Date(),
): string {
  if (invoice.status === "paid") {
    const date = invoice.paid_at
      ? formatShortDate(invoice.paid_at)
      : "";
    return date ? `Paga · ${date}` : "Paga";
  }
  if (invoice.status === "cancelled") return "Cancelada";
  if (isOverdue(invoice, today)) {
    return `Em atraso · +${daysOverdue(invoice, today)}d`;
  }
  return "Em aberto";
}

/** Formata data ISO curta: "2026-04-14" -> "14 Abr 2026" (PT). */
export function formatShortDate(iso: string): string {
  const d = parseIsoDate(iso);
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Formata periodo (start..end) como label curto. */
export function formatPeriod(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null;
  if (start && end) {
    // Se mesmo mes/ano, mostra so 1: "Abr 2026"
    const s = parseIsoDate(start);
    const e = parseIsoDate(end);
    if (
      s.getUTCFullYear() === e.getUTCFullYear() &&
      s.getUTCMonth() === e.getUTCMonth()
    ) {
      return new Intl.DateTimeFormat("pt-PT", {
        month: "short",
        year: "numeric",
      }).format(s);
    }
    return `${formatShortDate(start)} — ${formatShortDate(end)}`;
  }
  return start ? formatShortDate(start) : end ? formatShortDate(end) : null;
}

// ============================================================================
// Internas
// ============================================================================

function parseIsoDate(iso: string): Date {
  // Forca interpretacao UTC para evitar timezone skew em pt-PT
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(`${iso}T00:00:00.000Z`);
  }
  return new Date(iso);
}

function toUtcMidnight(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
