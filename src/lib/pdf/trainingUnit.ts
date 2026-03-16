/**
 * Export PDF da Unidade de Treino — layout EMJOGO.
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
  endTime?: string;
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
  fieldArea?: string | null;
  phases: PhaseData[];
};

const PHASE_LABELS: Record<string, string> = {
  initial: "Fase Inicial",
  main: "Fase Fundamental",
  final: "Fase Final",
  custom: "Fase Personalizada",
};

const PERIOD_LABELS: Record<string, string> = { pre_season: "Pré-Época", competitive: "Competitivo", transition: "Transição" };
const FOCUS_LABELS: Record<string, string> = { tactical: "Tática", technical: "Técnica", physical: "Física", mixed: "Mista" };
const INTENSITY_LABELS: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto", very_high: "Muito Alto" };

async function createPdfDocument() {
  const { default: jsPDF } = await import("jspdf");
  await import("jspdf-autotable");
  return new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTA(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function label(val: string | null | undefined, map: Record<string, string>): string {
  if (!val) return "—";
  return map[val] ?? val;
}

function autoTableY(doc: unknown, fallback: number): number {
  return (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback;
}

export async function exportTrainingUnitPDF(data: TrainingUnitPdfData) {
  const doc = await createPdfDocument();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 14; // margin
  const cw = pageW - m * 2;
  let y = 14;

  // ─── Title ───
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  const utLabel = data.utNumber ? `Treino ${data.utNumber}` : (data.title ?? "Unidade de Treino");
  doc.text(utLabel, m, y);
  if (data.teamName) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`${data.teamName}${data.season ? ` — ${data.season}` : ""}`, pageW - m, y, { align: "right" });
  }
  y += 8;

  // ─── Metadata table ───
  const metaRows: string[][] = [];
  const line1 = [];
  line1.push(`Data: ${fmtDate(data.sessionDate)}`);
  if (data.startTime) {
    const time = data.startTime.substring(0, 5) + (data.endTime ? `–${data.endTime.substring(0, 5)}` : "");
    line1.push(`Hora: ${time}`);
  }
  // Calculate total duration from phases
  let totalDuration = 0;
  for (const phase of data.phases) {
    for (const ex of phase.exercises) totalDuration += ex.duration ?? 0;
  }
  if (totalDuration > 0) line1.push(`Duração: ${totalDuration}'`);
  metaRows.push([line1.join("    ")]);

  const line2 = [];
  if (data.location) line2.push(`Local: ${data.location}`);
  if (data.fieldArea) line2.push(`Área: ${data.fieldArea}`);
  if (data.material) line2.push(`Material: ${data.material}`);
  if (line2.length) metaRows.push([line2.join("    ")]);

  const line3 = [];
  line3.push(`Período: ${label(data.periodType, PERIOD_LABELS)}`);
  line3.push(`Foco: ${label(data.focus, FOCUS_LABELS)}`);
  line3.push(`Intensidade: ${label(data.intensity, INTENSITY_LABELS)}`);
  metaRows.push([line3.join("    ")]);

  if (data.objective || data.complementaryObjectives) {
    const parts = [];
    if (data.objective) parts.push(`Objectivo: ${data.objective}`);
    if (data.complementaryObjectives) parts.push(`Obj. Compl.: ${data.complementaryObjectives}`);
    metaRows.push([parts.join("    ")]);
  }
  if (data.initialInstruction) metaRows.push([`Instrução Inicial: ${data.initialInstruction}`]);

  (doc as unknown as { autoTable: (opts: Record<string, unknown>) => void }).autoTable({
    startY: y,
    margin: { left: m, right: m },
    body: metaRows,
    theme: "plain",
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: [71, 85, 105] },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.2,
  });
  y = autoTableY(doc, y) + 4;

  // ─── Phases ───
  let cumulativeTA = 0;

  for (const phase of data.phases) {
    if (y > pageH - 40) { doc.addPage(); y = 14; }

    // Phase header
    doc.setFillColor(241, 245, 249);
    doc.rect(m, y - 3, cw, 7, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    const phaseName = phase.phase_type === "custom" ? (phase.phase_name || "Fase Personalizada") : (PHASE_LABELS[phase.phase_type] || phase.phase_type);
    doc.text(phaseName, m + 2, y + 1.5);
    y += 8;

    if (phase.exercises.length > 0) {
      const rows = phase.exercises.map((ex) => {
        cumulativeTA += ex.duration ?? 0;
        const detailParts: string[] = [];
        if (ex.objectives) detailParts.push(`Obj: ${ex.objectives}`);
        if (ex.gameFormat) detailParts.push(`Forma: ${ex.gameFormat}`);
        if (ex.numPlayers) detailParts.push(`Atletas: ${ex.numPlayers}`);
        if (ex.fieldDimensions) detailParts.push(`Espaço: ${ex.fieldDimensions}`);
        if (ex.material) detailParts.push(`Material: ${ex.material}`);
        return [
          ex.name,
          ex.description || "",
          detailParts.join(" | "),
          ex.duration ? `${ex.duration}'` : "",
          formatTA(cumulativeTA),
        ];
      });

      (doc as unknown as { autoTable: (opts: Record<string, unknown>) => void }).autoTable({
        startY: y,
        margin: { left: m, right: m },
        head: [["Exercício", "Descrição", "Detalhes", "Dur.", "TA"]],
        body: rows,
        styles: { fontSize: 7, cellPadding: 2, textColor: [51, 65, 85] },
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 30, fontStyle: "bold" },
          1: { cellWidth: 45 },
          2: { cellWidth: 65 },
          3: { cellWidth: 12, halign: "center" },
          4: { cellWidth: 14, halign: "center" },
        },
        theme: "grid",
      });
      y = autoTableY(doc, y) + 5;
    } else {
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(148, 163, 184);
      doc.text("Sem exercícios nesta fase.", m + 2, y);
      y += 5;
    }
  }

  // ─── Footer ───
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`Coach11 · Página ${p} de ${pageCount}`, m, pageH - 8);
  }

  // ─── Save ───
  const dateStr = fmtDate(data.sessionDate).replace(/\//g, "-");
  doc.save(`UT${data.utNumber ?? ""}_${dateStr}.pdf`);
}
