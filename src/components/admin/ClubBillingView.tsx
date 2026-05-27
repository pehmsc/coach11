"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Plus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  daysOverdue,
  formatCents,
  formatPeriod,
  formatShortDate,
  isOverdue,
  statusLabel,
} from "@/lib/billing/invoice-helpers";
import type { Invoice } from "@/types/database";
import { InvoiceCreateModal } from "./InvoiceCreateModal";
import { InvoiceDetailDrawer } from "./InvoiceDetailDrawer";

interface Props {
  clubId: string;
}

type Filter = "all" | "open" | "overdue" | "paid" | "cancelled";

export function ClubBillingView({ clubId }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [drawerRefreshKey, setDrawerRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clubs/${clubId}/invoices`, {
        cache: "no-store",
      });
      const json = (await res.json()) as
        | { success: true; invoices: Invoice[] }
        | { success?: false; error: string };
      if (!res.ok || !("invoices" in json)) {
        throw new Error("error" in json ? json.error : "Erro a carregar.");
      }
      setInvoices(json.invoices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro a carregar facturas.");
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const today = new Date();
    return invoices.filter((inv) => {
      switch (filter) {
        case "open":
          return inv.status === "issued" && !isOverdue(inv, today);
        case "overdue":
          return isOverdue(inv, today);
        case "paid":
          return inv.status === "paid";
        case "cancelled":
          return inv.status === "cancelled";
        case "all":
        default:
          return true;
      }
    });
  }, [invoices, filter]);

  const counts = useMemo(() => {
    const today = new Date();
    const c = { all: invoices.length, open: 0, overdue: 0, paid: 0, cancelled: 0 };
    for (const inv of invoices) {
      if (inv.status === "paid") c.paid += 1;
      else if (inv.status === "cancelled") c.cancelled += 1;
      else if (isOverdue(inv, today)) c.overdue += 1;
      else c.open += 1;
    }
    return c;
  }, [invoices]);

  const summary = useMemo(() => {
    const today = new Date();
    let openCents = 0;
    let overdueCents = 0;
    let paidYearCents = 0;
    const year = today.getUTCFullYear();
    for (const inv of invoices) {
      if (inv.status === "issued") {
        if (isOverdue(inv, today)) overdueCents += inv.amount_cents;
        else openCents += inv.amount_cents;
      } else if (inv.status === "paid" && inv.paid_at) {
        const paidYear = parseInt(inv.paid_at.slice(0, 4), 10);
        if (paidYear === year) paidYearCents += inv.amount_cents;
      }
    }
    return { openCents, overdueCents, paidYearCents };
  }, [invoices]);

  async function downloadPdf(inv: Invoice) {
    try {
      const res = await fetch(
        `/api/admin/clubs/${clubId}/invoices/${inv.id}/pdf`,
      );
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Erro a gerar link.");
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro a descarregar.");
    }
  }

  async function markPaid(inv: Invoice) {
    const today = new Date().toISOString().slice(0, 10);
    const paidAt = window.prompt(
      "Data do pagamento (YYYY-MM-DD)",
      today,
    );
    if (!paidAt) return;
    setPendingAction(inv.id);
    try {
      const res = await fetch(
        `/api/admin/clubs/${clubId}/invoices/${inv.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_paid", paid_at: paidAt }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Erro a marcar paga.");
      toast.success("Factura marcada como paga.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro a marcar paga.");
    } finally {
      setPendingAction(null);
    }
  }

  async function cancelInvoice(inv: Invoice) {
    const reason = window.prompt(
      `Cancelar factura ${inv.invoice_number}?\n\nRazao (opcional):`,
    );
    if (reason === null) return;
    setPendingAction(inv.id);
    try {
      const res = await fetch(
        `/api/admin/clubs/${clubId}/invoices/${inv.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cancel",
            reason: reason.trim() || undefined,
          }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Erro a cancelar.");
      toast.success("Factura cancelada.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro a cancelar.");
    } finally {
      setPendingAction(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="size-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Link
          href={`/admin/clubs/${clubId}/snapshot`}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft size={16} /> Voltar ao clube
        </Link>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Facturação</h1>
            <p className="text-sm text-slate-500">
              Tracking de facturas emitidas fora da plataforma.
            </p>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            className="bg-emerald-600 hover:bg-emerald-500"
          >
            <Plus size={16} className="mr-1" /> Nova factura
          </Button>
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Summary cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
          <SummaryCard
            label="Em aberto"
            valueCents={summary.openCents}
            count={counts.open}
            tone="amber"
          />
          <SummaryCard
            label="Em atraso"
            valueCents={summary.overdueCents}
            count={counts.overdue}
            tone="rose"
          />
          <SummaryCard
            label="Pago este ano"
            valueCents={summary.paidYearCents}
            count={counts.paid}
            tone="emerald"
          />
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap gap-2">
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
            active={filter === "overdue"}
            onClick={() => setFilter("overdue")}
            label="Em atraso"
            count={counts.overdue}
            tone="rose"
          />
          <FilterChip
            active={filter === "paid"}
            onClick={() => setFilter("paid")}
            label="Pagas"
            count={counts.paid}
          />
          <FilterChip
            active={filter === "cancelled"}
            onClick={() => setFilter("cancelled")}
            label="Canceladas"
            count={counts.cancelled}
          />
        </div>

        {/* Table */}
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Sem facturas neste filtro.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">N.º</th>
                  <th className="px-4 py-3 text-left">Período</th>
                  <th className="px-4 py-3 text-left">Vencimento</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Acções</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    onOpen={() => setOpenInvoiceId(inv.id)}
                    onDownload={() => downloadPdf(inv)}
                    onMarkPaid={() => markPaid(inv)}
                    onCancel={() => cancelInvoice(inv)}
                    pending={pendingAction === inv.id}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate ? (
        <InvoiceCreateModal
          clubId={clubId}
          onClose={() => setShowCreate(false)}
          onCreated={(warning) => {
            setShowCreate(false);
            void load();
            if (warning) toast.warning(warning);
            else toast.success("Factura criada e email enviado.");
          }}
        />
      ) : null}

      {openInvoiceId ? (
        <InvoiceDetailDrawer
          clubId={clubId}
          invoiceId={openInvoiceId}
          refreshKey={drawerRefreshKey}
          onClose={() => setOpenInvoiceId(null)}
          onMarkPaid={(inv) => {
            void (async () => {
              await markPaid(inv);
              setDrawerRefreshKey((k) => k + 1);
            })();
          }}
          onCancel={(inv) => {
            void (async () => {
              await cancelInvoice(inv);
              setDrawerRefreshKey((k) => k + 1);
            })();
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  valueCents,
  count,
  tone,
}: {
  label: string;
  valueCents: number;
  count: number;
  tone: "amber" | "rose" | "emerald";
}) {
  const tones = {
    amber: "text-amber-700",
    rose: "text-rose-700",
    emerald: "text-emerald-700",
  } as const;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tones[tone]}`}>
        {formatCents(valueCents)}
      </p>
      <p className="mt-0.5 text-xs text-slate-400">
        {count} {count === 1 ? "factura" : "facturas"}
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: "default" | "rose";
}) {
  const activeClass =
    tone === "rose"
      ? "bg-rose-100 text-rose-700"
      : "bg-emerald-100 text-emerald-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active ? activeClass : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label} ({count})
    </button>
  );
}

function InvoiceRow({
  invoice,
  onOpen,
  onDownload,
  onMarkPaid,
  onCancel,
  pending,
}: {
  invoice: Invoice;
  onOpen: () => void;
  onDownload: () => void;
  onMarkPaid: () => void;
  onCancel: () => void;
  pending: boolean;
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
  // Stop propagation nos botões para o click na linha não competir
  const stopAndRun = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <tr
      className={`cursor-pointer transition hover:bg-slate-50 ${
        overdue ? "bg-rose-50/40 hover:bg-rose-50/70" : ""
      }`}
      onClick={onOpen}
    >
      <td className="px-4 py-3 font-mono text-xs">{invoice.invoice_number}</td>
      <td className="px-4 py-3 text-slate-700">{period ?? "—"}</td>
      <td
        className={`px-4 py-3 ${overdue ? "text-rose-700" : "text-slate-600"}`}
      >
        {formatShortDate(invoice.due_date)}
        {overdue ? (
          <span className="ml-1 text-xs">
            (+{daysOverdue(invoice, today)}d)
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right font-semibold">
        {formatCents(invoice.amount_cents, invoice.currency)}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
          {label}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {pending ? (
          <Loader2 size={14} className="ml-auto animate-spin text-slate-400" />
        ) : (
          <div className="flex justify-end gap-3 text-xs">
            <button
              type="button"
              onClick={stopAndRun(onDownload)}
              className="text-slate-600 hover:underline"
            >
              PDF
            </button>
            {invoice.status === "issued" ? (
              <>
                <button
                  type="button"
                  onClick={stopAndRun(onMarkPaid)}
                  className="font-semibold text-emerald-600 hover:underline"
                >
                  Marcar paga
                </button>
                <button
                  type="button"
                  onClick={stopAndRun(onCancel)}
                  className="text-rose-600 hover:underline"
                >
                  Cancelar
                </button>
              </>
            ) : null}
          </div>
        )}
      </td>
    </tr>
  );
}
