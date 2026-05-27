"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, Loader2 } from "lucide-react";
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

type Filter = "all" | "open" | "paid";

export function CoordinatorInvoicesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/club/invoices`, { cache: "no-store" });
      const json = (await res.json()) as
        | { success: true; invoices: Invoice[] }
        | { error: string };
      if (!res.ok || !("invoices" in json)) {
        throw new Error("error" in json ? json.error : "Erro a carregar.");
      }
      setInvoices(json.invoices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro a carregar facturas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (filter === "open") return inv.status === "issued";
      if (filter === "paid") return inv.status === "paid";
      return true;
    });
  }, [invoices, filter]);

  const counts = useMemo(() => {
    return {
      all: invoices.length,
      open: invoices.filter((i) => i.status === "issued").length,
      paid: invoices.filter((i) => i.status === "paid").length,
    };
  }, [invoices]);

  const overdueInvoices = useMemo(() => {
    const today = new Date();
    return invoices.filter((i) => isOverdue(i, today));
  }, [invoices]);

  const totalOpenCents = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "issued")
        .reduce((sum, i) => sum + i.amount_cents, 0),
    [invoices],
  );

  async function downloadPdf(inv: Invoice) {
    setDownloadingId(inv.id);
    try {
      const res = await fetch(`/api/club/invoices/${inv.id}/pdf`);
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Erro a gerar link.");
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro a descarregar.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Facturação</h2>
          <p className="text-sm text-slate-500">
            Histórico das facturas Coach11 do clube.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Em aberto</p>
          <p className="text-lg font-bold text-amber-600">
            {formatCents(totalOpenCents)}
          </p>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {overdueInvoices.length > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-lg">
              ⚠️
            </span>
            <div className="flex-1 text-sm">
              <p className="font-semibold text-rose-900">
                {overdueInvoices.length === 1
                  ? "Tens 1 factura em atraso"
                  : `Tens ${overdueInvoices.length} facturas em atraso`}
              </p>
              <p className="mt-1 text-rose-800">
                Regulariza para evitar restrições. Em caso de dúvida contacta
                <a
                  href="mailto:billing@coach11.app"
                  className="ml-1 underline"
                >
                  billing@coach11.app
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="Todas"
          count={counts.all}
        />
        <FilterChip
          active={filter === "open"}
          onClick={() => setFilter("open")}
          label="Em aberto"
          count={counts.open}
        />
        <FilterChip
          active={filter === "paid"}
          onClick={() => setFilter("paid")}
          label="Pagas"
          count={counts.paid}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Sem facturas neste filtro.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-3 text-left">N.º</th>
                <th className="px-3 py-3 text-left">Período</th>
                <th className="px-3 py-3 text-left">Vencimento</th>
                <th className="px-3 py-3 text-right">Valor</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((inv) => (
                <CoordinatorInvoiceRow
                  key={inv.id}
                  invoice={inv}
                  onDownload={() => downloadPdf(inv)}
                  downloading={downloadingId === inv.id}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Para questões sobre facturação:{" "}
        <a
          href="mailto:billing@coach11.app"
          className="text-emerald-600 hover:underline"
        >
          billing@coach11.app
        </a>
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label} ({count})
    </button>
  );
}

function CoordinatorInvoiceRow({
  invoice,
  onDownload,
  downloading,
}: {
  invoice: Invoice;
  onDownload: () => void;
  downloading: boolean;
}) {
  const today = new Date();
  const overdue = isOverdue(invoice, today);
  const period = formatPeriod(invoice.period_start, invoice.period_end);
  const label = statusLabel(invoice, today);
  const badgeClass =
    invoice.status === "paid"
      ? "bg-emerald-100 text-emerald-700"
      : invoice.status === "cancelled"
        ? "bg-slate-200 text-slate-600"
        : overdue
          ? "bg-rose-100 text-rose-700"
          : "bg-amber-100 text-amber-700";

  return (
    <tr className={overdue ? "bg-rose-50/40" : ""}>
      <td className="px-3 py-3 font-mono text-xs">{invoice.invoice_number}</td>
      <td className="px-3 py-3 text-slate-700">{period ?? "—"}</td>
      <td
        className={`px-3 py-3 ${overdue ? "text-rose-700" : "text-slate-600"}`}
      >
        {formatShortDate(invoice.due_date)}
        {overdue ? (
          <span className="ml-1 text-xs">
            (+{daysOverdue(invoice, today)}d)
          </span>
        ) : null}
      </td>
      <td className="px-3 py-3 text-right font-semibold">
        {formatCents(invoice.amount_cents, invoice.currency)}
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}
        >
          {label}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        {invoice.status === "cancelled" ? null : (
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Download size={12} />
            )}
            PDF
          </button>
        )}
      </td>
    </tr>
  );
}
