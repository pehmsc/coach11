"use client";

import { StickyBackLink } from "@/components/navigation/StickyBackLink";

interface CorrectionBannerProps {
  gameId: string;
  correctionReason: string;
  setCorrectionReason: (v: string) => void;
}

export function CorrectionBanner({
  gameId,
  correctionReason,
  setCorrectionReason,
}: CorrectionBannerProps) {
  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-amber-800">
            Correção controlada
          </p>
          <p className="text-sm text-amber-900">
            Indica o motivo da correção. Todas as alterações ficam auditadas.
          </p>
        </div>
        <StickyBackLink
          href={`/games/${gameId}/summary`}
          label="Voltar ao sumário"
          sticky={false}
          wrapperClassName="bg-transparent px-0 py-0"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-amber-900">
          Motivo da correção
        </label>
        <input
          type="text"
          value={correctionReason}
          onChange={(event) => setCorrectionReason(event.target.value)}
          placeholder="Ex: corrigir convocados finais após validação interna"
          className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
    </div>
  );
}
