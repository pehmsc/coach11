/**
 * Export PDF da Unidade de Treino.
 * Usa jsPDF + jspdf-autotable (dynamic import, client-only).
 */

type PhaseData = {
  phase_type: string;
  phase_name?: string | null;
  exercises: ExerciseData[];
};

type ExerciseData = {
  name: string;
  description?: string | null;
  objectives?: string | null;
  gameFormat?: string | null;
  duration?: number | null;
  numPlayers?: number | null;
  fieldDimensions?: string | null;
  material?: string | null;
};

export type TrainingUnitPdfData = {
  utNumber?: number | null;
  title?: string;
  sessionDate: string;
  startTime?: string;
  location?: string;
  teamName?: string;
  season?: string;
  periodType?: string | null;
  focus?: string | null;
  intensity?: string | null;
  objective?: string | null;
  complementaryObjectives?: string | null;
  material?: string | null;
  initialInstruction?: string | null;
  phases: PhaseData[];
};

const PHASE_LABELS: Record<string, string> = {
  initial: "Parte Inicial",
  main: "Parte Principal",
  final: "Parte Final",
  custom: "Fase Personalizada",
};

const PERIOD_LABELS: Record<string, string> = {
  pre_season: "Pré-Época",
  competitive: "Competitivo",
  transition: "Transição",
};

const FOCUS_LABELS: Record<string, string> = {
  tactical: "Tática",
  technical: "Técnica",
  physical: "Física",
  mixed: "Mista",
};

const INTENSITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  very_high: "Muito Alta",
};

async function createPdfDocument() {
  const { default: jsPDF } = await import("jspdf");
  await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  return doc;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function exportTrainingUnitPDF(data: TrainingUnitPdfData) {
  const doc = await createPdfDocument();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  // ─── Title ─────────────────────────────────
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  const utLabel = data.utNumber ? `UT ${data.utNumber}` : "Unidade de Treino";
  doc.text(utLabel, margin, y);
  y += 6;

  if (data.teamName) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`${data.teamName}${data.season ? ` — ${data.season}` : ""}`, margin, y);
    y += 5;
  }

  // ─── Metadata grid ──────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const metaLines: string[] = [];

  const line1Parts: string[] = [];
  line1Parts.push(`Data: ${formatDate(data.sessionDate)}`);
  if (data.startTime) line1Parts.push(`Hora: ${data.startTime.substring(0, 5)}`);
  if (data.location) line1Parts.push(`Local: ${data.location}`);
  metaLines.push(line1Parts.join("    "));

  const line2Parts: string[] = [];
  if (data.periodType) line2Parts.push(`Período: ${PERIOD_LABELS[data.periodType] ?? data.periodType}`);
  if (data.focus) line2Parts.push(`Foco: ${FOCUS_LABELS[data.focus] ?? data.focus}`);
  if (data.intensity) line2Parts.push(`Intensidade: ${INTENSITY_LABELS[data.intensity] ?? data.intensity}`);
  if (line2Parts.length > 0) metaLines.push(line2Parts.join("    "));

  if (data.objective) metaLines.push(`Objectivo: ${data.objective}`);
  if (data.complementaryObjectives) metaLines.push(`Obj. Complementares: ${data.complementaryObjectives}`);
  if (data.material) metaLines.push(`Material: ${data.material}`);
  if (data.initialInstruction) metaLines.push(`Instrução Inicial: ${data.initialInstruction}`);

  for (const line of metaLines) {
    doc.text(line, margin, y);
    y += 4;
  }

  y += 3;

  // ─── Phases ─────────────────────────────────
  for (const phase of data.phases) {
    // Check page break
    if (y > 260) {
      doc.addPage();
      y = 14;
    }

    // Phase header
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, y - 3, contentWidth, 7, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    const phaseName = phase.phase_type === "custom"
      ? phase.phase_name || "Fase Personalizada"
      : PHASE_LABELS[phase.phase_type] || phase.phase_type;
    doc.text(phaseName, margin + 2, y + 1.5);
    y += 8;

    // Exercises table
    if (phase.exercises.length > 0) {
      const tableBody = phase.exercises.map((ex) => {
        const details: string[] = [];
        if (ex.objectives) details.push(`Obj: ${ex.objectives}`);
        if (ex.gameFormat) details.push(`Forma: ${ex.gameFormat}`);
        if (ex.numPlayers) details.push(`Jog: ${ex.numPlayers}`);
        if (ex.fieldDimensions) details.push(`Espaço: ${ex.fieldDimensions}`);
        if (ex.material) details.push(`Material: ${ex.material}`);

        return [
          ex.name,
          ex.description || "",
          details.join(" | "),
          ex.duration ? `${ex.duration}'` : "",
        ];
      });

      (doc as unknown as { autoTable: (options: Record<string, unknown>) => void }).autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Exercício", "Descrição", "Detalhes", "Tempo"]],
        body: tableBody,
        styles: { fontSize: 7, cellPadding: 2, textColor: [51, 65, 85] },
        headStyles: {
          fillColor: [16, 185, 129], // emerald-500
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 7,
        },
        columnStyles: {
          0: { cellWidth: 35, fontStyle: "bold" },
          1: { cellWidth: 55 },
          2: { cellWidth: 70 },
          3: { cellWidth: 15, halign: "center" },
        },
        theme: "grid",
      });

      y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 5;
    } else {
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(148, 163, 184);
      doc.text("Sem exercícios nesta fase.", margin + 2, y);
      y += 5;
    }
  }

  // ─── Footer ─────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(
      `COACH11 · Gerado em ${new Date().toLocaleDateString("pt-PT")} · Página ${p}/${pageCount}`,
      margin,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  // ─── Save ───────────────────────────────────
  const dateStr = formatDate(data.sessionDate).replace(/\//g, "-");
  const fileName = `UT${data.utNumber ?? ""}_${dateStr}.pdf`;
  doc.save(fileName);
}
