"use client";

import { ArrowUpDown, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Tab } from "./types";

interface PdfExportCardProps {
  activeTab: Tab;
  selectedPlayerIds: Set<string>;
  currentTabPlayerIds: string[];
  exportingPdf: Tab | null;
  onExport: () => void;
  onClearSelection: () => void;
  onExportCsv?: () => void;
}

export function PdfExportCard({
  activeTab,
  selectedPlayerIds,
  currentTabPlayerIds,
  exportingPdf,
  onExport,
  onClearSelection,
  onExportCsv,
}: PdfExportCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Exportar dados
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Sem seleção exporta a informação geral. Se selecionares atletas,
              exporta apenas os escolhidos.
            </p>
            <p className="text-xs text-slate-600 mt-2">
              {selectedPlayerIds.size > 0
                ? `${selectedPlayerIds.size} atleta${
                    selectedPlayerIds.size === 1 ? "" : "s"
                  } selecionado${selectedPlayerIds.size === 1 ? "" : "s"}`
                : "Sem atletas selecionados"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedPlayerIds.size > 0 && (
              <Button type="button" variant="outline" onClick={onClearSelection}>
                Limpar seleção
              </Button>
            )}
            {onExportCsv && (
              <Button
                type="button"
                variant="outline"
                onClick={onExportCsv}
                disabled={currentTabPlayerIds.length === 0}
              >
                <Download size={16} className="mr-2" />
                CSV
              </Button>
            )}
            <Button
              type="button"
              onClick={onExport}
              disabled={exportingPdf !== null || currentTabPlayerIds.length === 0}
            >
              {exportingPdf === activeTab ? (
                <ArrowUpDown size={16} className="mr-2 animate-spin" />
              ) : (
                <Download size={16} className="mr-2" />
              )}
              PDF
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
