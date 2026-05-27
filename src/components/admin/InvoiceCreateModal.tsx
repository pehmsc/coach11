"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  clubId: string;
  onClose: () => void;
  onCreated: (warning: string | undefined) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function InvoiceCreateModal({ clubId, onClose, onCreated }: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState(todayIso());
  const [dueDate, setDueDate] = useState(addDays(todayIso(), 30));
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function parseAmountToCents(value: string): number | null {
    const normalized = value.replace(",", ".").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    return Math.round(parseFloat(normalized) * 100);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!invoiceNumber.trim()) {
      toast.error("Numero de factura obrigatorio.");
      return;
    }
    const amount_cents = parseAmountToCents(amount);
    if (amount_cents === null) {
      toast.error("Valor invalido. Usa formato 150,00 ou 150.00.");
      return;
    }
    if (!pdf) {
      toast.error("PDF da factura obrigatorio.");
      return;
    }
    if (dueDate < issuedAt) {
      toast.error("Vencimento nao pode ser anterior a emissao.");
      return;
    }

    const metadata = {
      invoice_number: invoiceNumber.trim(),
      issued_at: issuedAt,
      due_date: dueDate,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      amount_cents,
      currency: "EUR",
      notes: notes.trim() || null,
    };

    const formData = new FormData();
    formData.append("metadata", JSON.stringify(metadata));
    formData.append("pdf", pdf);

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/clubs/${clubId}/invoices`, {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        emailWarning?: string;
      };
      if (!res.ok) throw new Error(json.error || "Erro a criar factura.");
      onCreated(json.emailWarning);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro a criar factura.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="m-4 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Nova factura</h3>
            <p className="mt-1 text-xs text-slate-500">
              Regista uma factura ja emitida fora da plataforma.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="invoice_number">
                N.º factura <span className="text-emerald-600">*</span>
              </Label>
              <Input
                id="invoice_number"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="FT-2026/001"
                required
              />
              <p className="mt-1 text-xs text-slate-400">
                Referencia do software de facturacao fiscal
              </p>
            </div>
            <div>
              <Label htmlFor="amount">
                Valor (€) <span className="text-emerald-600">*</span>
              </Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="150,00"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="period_start">Período · início</Label>
              <Input
                id="period_start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="period_end">Período · fim</Label>
              <Input
                id="period_end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="issued_at">
                Emissão <span className="text-emerald-600">*</span>
              </Label>
              <Input
                id="issued_at"
                type="date"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="due_date">
                Vencimento <span className="text-emerald-600">*</span>
              </Label>
              <Input
                id="due_date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="pdf">
              PDF da factura <span className="text-emerald-600">*</span>
            </Label>
            <input
              id="pdf"
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
              required
              className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              Máximo 10 MB · será descarregável pelo coordenador do clube.
            </p>
          </div>

          <div>
            <Label htmlFor="notes">Notas internas (não visíveis ao cliente)</Label>
            <textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="block w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-500"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                A criar...
              </>
            ) : (
              "Criar factura"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
