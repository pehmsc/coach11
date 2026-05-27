"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { formatCents, formatShortDate } from "@/lib/billing/invoice-helpers";
import type { OverdueInvoiceRow } from "@/app/api/admin/invoices/overdue/route";

interface Summary {
  total_count: number;
  total_amount_cents: number;
  clubs_affected: number;
  buckets: {
    "0-7": number;
    "8-15": number;
    "16-30": number;
    "30+": number;
  };
}

type Bucket = "all" | "0-7" | "8-15" | "16-30" | "30+";

export function OverdueInvoicesView() {
  const [rows, setRows] = useState<OverdueInvoiceRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invoices/overdue", {
        cache: "no-store",
      });
      const json = (await res.json()) as
        | { rows: OverdueInvoiceRow[]; summary: Summary }
        | { error: string };
      if (!res.ok || !("rows" in json)) {
        throw new Error("error" in json ? json.error : "Erro a carregar.");
      }
      setRows(json.rows);
      setSummary(json.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro a carregar atrasos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      switch (bucket) {
        case "0-7":
          return r.days_overdue <= 7;
        case "8-15":
          return r.days_overdue > 7 && r.days_overdue <= 15;
        case "16-30":
          return r.days_overdue > 15 && r.days_overdue <= 30;
        case "30+":
          return r.days_overdue > 30;
        case "all":
        default:
          return true;
      }
    });
  }, [rows, bucket]);

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
          href="/admin/clubs"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft size={16} /> Voltar à lista de clubes
        </Link>

        <div className="mt-4">
          <h1 className="text-2xl font-bold text-slate-900">Facturas em atraso</h1>
          <p className="text-sm text-slate-500">
            Vista cross-club de tudo o que está vencido e por pagar.
          </p>
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Summary */}
        {summary ? (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard
              label="Total em atraso"
              value={formatCents(summary.total_amount_cents)}
              tone="rose"
            />
            <SummaryCard
              label="Facturas"
              value={String(summary.total_count)}
              tone="rose"
            />
            <SummaryCard
              label="Clubes afectados"
              value={String(summary.clubs_affected)}
              tone="amber"
            />
            <SummaryCard
              label="Vencidas > 30d"
              value={String(summary.buckets["30+"])}
              tone="rose"
            />
          </div>
        ) : null}

        {/* Bucket filters */}
        {summary ? (
          <div className="mt-6 flex flex-wrap gap-2">
            <BucketChip
              active={bucket === "all"}
              onClick={() => setBucket("all")}
              label="Todas"
              count={summary.total_count}
            />
            <BucketChip
              active={bucket === "0-7"}
              onClick={() => setBucket("0-7")}
              label="0–7 dias"
              count={summary.buckets["0-7"]}
            />
            <BucketChip
              active={bucket === "8-15"}
              onClick={() => setBucket("8-15")}
              label="8–15 dias"
              count={summary.buckets["8-15"]}
              tone="amber"
            />
            <BucketChip
              active={bucket === "16-30"}
              onClick={() => setBucket("16-30")}
              label="16–30 dias"
              count={summary.buckets["16-30"]}
              tone="rose"
            />
            <BucketChip
              active={bucket === "30+"}
              onClick={() => setBucket("30+")}
              label="+30 dias"
              count={summary.buckets["30+"]}
              tone="rose"
            />
          </div>
        ) : null}

        {/* Table */}
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-slate-500">
              Nenhuma factura em atraso neste filtro. 🎉
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Clube</th>
                  <th className="px-4 py-3 text-left">N.º</th>
                  <th className="px-4 py-3 text-left">Vencimento</th>
                  <th className="px-4 py-3 text-right">Atraso</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => (
                  <OverdueRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "rose" | "amber";
}) {
  const tones = {
    rose: "text-rose-700",
    amber: "text-amber-700",
  } as const;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function BucketChip({
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
  tone?: "default" | "amber" | "rose";
}) {
  const activeCls =
    tone === "rose"
      ? "bg-rose-100 text-rose-700"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active ? activeCls : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label} ({count})
    </button>
  );
}

function OverdueRow({ row }: { row: OverdueInvoiceRow }) {
  const bucketCls =
    row.days_overdue > 30
      ? "bg-rose-100 text-rose-700"
      : row.days_overdue > 15
        ? "bg-rose-50 text-rose-600"
        : row.days_overdue > 7
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-600";
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <Link
          href={`/admin/clubs/${row.club_id}/billing`}
          className="font-medium text-slate-900 hover:text-emerald-600 hover:underline"
        >
          {row.club_name}
        </Link>
        <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-400">
          {row.club_tier}
        </p>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-700">
        {row.invoice_number}
      </td>
      <td className="px-4 py-3 text-slate-700">
        {formatShortDate(row.due_date)}
      </td>
      <td className="px-4 py-3 text-right">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${bucketCls}`}
        >
          +{row.days_overdue}d
        </span>
      </td>
      <td className="px-4 py-3 text-right font-semibold">
        {formatCents(row.amount_cents, row.currency)}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/admin/clubs/${row.club_id}/billing`}
          className="inline-flex items-center text-xs text-emerald-600 hover:underline"
        >
          Ver clube <ChevronRight size={14} />
        </Link>
      </td>
    </tr>
  );
}
