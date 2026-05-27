"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Mail,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  daysOverdue,
  formatCents,
  formatPeriod,
  formatShortDate,
  isOverdue,
  statusLabel,
} from "@/lib/billing/invoice-helpers";
import type { Invoice } from "@/types/database";

interface Props {
  clubId: string;
  invoiceId: string;
  onClose: () => void;
  onMarkPaid: (inv: Invoice) => void;
  onCancel: (inv: Invoice) => void;
  // Trigger reload do parent quando uma accao muta o estado
  refreshKey: number;
}

export function InvoiceDetailDrawer({
  clubId,
  invoiceId,
  onClose,
  onMarkPaid,
  onCancel,
  refreshKey,
}: Props) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Iframe usa endpoint same-origin com ?stream=1 (proxia o PDF) porque a CDN
  // do Supabase serve com X-Frame-Options: DENY e o iframe ficaria bloqueado.
  const pdfStreamUrl = `/api/admin/clubs/${clubId}/invoices/${invoiceId}/pdf?stream=1`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/clubs/${clubId}/invoices/${invoiceId}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as
        | { invoice: Invoice }
        | { error: string };
      if (!res.ok || !("invoice" in json)) {
        throw new Error("error" in json ? json.error : "Erro a carregar.");
      }
      setInvoice(json.invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro a carregar factura.");
    } finally {
      setLoading(false);
    }
  }, [clubId, invoiceId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleResend() {
    if (!invoice) return;
    setResending(true);
    try {
      const res = await fetch(
        `/api/admin/clubs/${clubId}/invoices/${invoice.id}/resend`,
        { method: "POST" },
      );
      const json = (await res.json()) as { sentTo?: string; error?: string };
      if (!res.ok) throw new Error(json.error || "Erro a reenviar email.");
      toast.success(`Email reenviado para ${json.sentTo}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro a reenviar.");
    } finally {
      setResending(false);
    }
  }

  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/admin/clubs/${clubId}/invoices/${invoiceId}/pdf`,
      );
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Erro a gerar link.");
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro a descarregar.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {invoice?.invoice_number ?? "Detalhe da factura"}
            </h2>
            {invoice ? (
              <p className="mt-0.5 text-xs text-slate-500">
                Criada {formatShortDate(invoice.created_at.slice(0, 10))}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-emerald-500" />
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : invoice ? (
            <div className="space-y-6">
              <StatusBadge invoice={invoice} />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <Meta label="Período">
                  {formatPeriod(invoice.period_start, invoice.period_end) ??
                    "—"}
                </Meta>
                <Meta label="Emissão">
                  {formatShortDate(invoice.issued_at)}
                </Meta>
                <Meta label="Vencimento">
                  {formatShortDate(invoice.due_date)}
                </Meta>
                <Meta label="Valor">
                  <span className="text-base font-bold">
                    {formatCents(invoice.amount_cents, invoice.currency)}
                  </span>
                </Meta>
                {invoice.paid_at ? (
                  <Meta label="Pago em">
                    {formatShortDate(invoice.paid_at)}
                  </Meta>
                ) : null}
              </div>

              {/* PDF preview (same-origin proxy para contornar X-Frame-Options da CDN) */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  PDF
                </h3>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <iframe
                    src={pdfStreamUrl}
                    className="block h-96 w-full"
                    title={`PDF factura ${invoice.invoice_number}`}
                  />
                </div>
              </section>

              {/* Notas internas */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Notas internas
                </h3>
                {invoice.notes ? (
                  <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {invoice.notes}
                  </pre>
                ) : (
                  <p className="text-xs text-slate-400">Sem notas.</p>
                )}
              </section>
            </div>
          ) : null}
        </div>

        {/* Footer / actions */}
        {invoice ? (
          <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadPdf}
              disabled={downloading}
            >
              <Download size={14} className="mr-1.5" />
              Descarregar PDF
            </Button>

            {invoice.status !== "cancelled" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResend}
                disabled={resending}
              >
                {resending ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <Mail size={14} className="mr-1.5" />
                )}
                Reenviar email
              </Button>
            ) : null}

            <div className="ml-auto flex gap-2">
              {invoice.status === "issued" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onMarkPaid(invoice)}
                    className="bg-emerald-600 hover:bg-emerald-500"
                  >
                    <CheckCircle2 size={14} className="mr-1.5" />
                    Marcar paga
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onCancel(invoice)}
                    className="border-rose-200 text-rose-700 hover:bg-rose-50"
                  >
                    Cancelar
                  </Button>
                </>
              ) : null}
            </div>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-slate-900">{children}</p>
    </div>
  );
}

function StatusBadge({ invoice }: { invoice: Invoice }) {
  const today = new Date();
  const overdue = isOverdue(invoice, today);
  const label = statusLabel(invoice, today);
  const cls =
    invoice.status === "paid"
      ? "bg-emerald-100 text-emerald-700"
      : invoice.status === "cancelled"
        ? "bg-slate-200 text-slate-600"
        : overdue
          ? "bg-rose-100 text-rose-700"
          : "bg-amber-100 text-amber-700";
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${cls}`}
      >
        {label}
      </span>
      {overdue ? (
        <span className="text-xs text-rose-600">
          ({daysOverdue(invoice, today)} dia(s) de atraso)
        </span>
      ) : null}
    </div>
  );
}
