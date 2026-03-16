/**
 * Export PDF da Unidade de Treino — layout EMJOGO com imagens.
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
  diagramUrl?: string | null;
  notes?: string | null;
};

export type TrainingUnitPdfData = {
  clubName?: string;
  clubLogoUrl?: string | null;
  teamName?: string;
  season?: string;
  utNumber?: number | null;
  title?: string;
  sessionDate: string;
  startTime?: string;
  endTime?: string | null;
  location?: string;
  fieldArea?: string | null;
  mesocycle?: number | null;
  microcycle?: number | null;
  periodType?: string | null;
  focus?: string | null;
  intensity?: string | null;
  objective?: string | null;
  complementaryObjectives?: string | null;
  initialInstruction?: string | null;
  material?: string | null;
  notes?: string | null;
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
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  return { doc, autoTable };
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

function lbl(val: string | null | undefined, map: Record<string, string>): string {
  if (!val) return "—";
  return map[val] ?? val;
}

function autoTableY(doc: unknown, fallback: number): number {
  return (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback;
}

async function urlToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportTrainingUnitPDF(data: TrainingUnitPdfData) {
  const { doc, autoTable } = await createPdfDocument();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mg = 14;
  const cw = pageW - mg * 2;
  let y = 14;

  // ─── Pre-load images ───
  const imageCache = new Map<string, string>();

  // Logo
  if (data.clubLogoUrl) {
    const logoB64 = await urlToBase64(data.clubLogoUrl);
    if (logoB64) imageCache.set("__logo__", logoB64);
  }

  // Exercise diagrams
  for (const phase of data.phases) {
    for (const ex of phase.exercises) {
      if (ex.diagramUrl && !imageCache.has(ex.diagramUrl)) {
        const b64 = await urlToBase64(ex.diagramUrl);
        if (b64) imageCache.set(ex.diagramUrl, b64);
      }
    }
  }

  // ─── Header with logo ───
  const logoB64 = imageCache.get("__logo__");
  let headerTextX = mg;
  if (logoB64) {
    try {
      doc.addImage(logoB64, "PNG", mg, y - 6, 20, 20);
      headerTextX = mg + 24;
    } catch {
      // ignore failed image
    }
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(data.clubName || "", headerTextX, y);

  const utLabel = data.utNumber ? `Treino ${data.utNumber}` : (data.title ?? "Unidade de Treino");
  doc.text(utLabel, pageW - mg, y, { align: "right" });

  y += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  if (data.teamName) {
    doc.text(data.teamName, headerTextX, y);
  }
  if (data.season) {
    doc.text(`Época ${data.season}`, pageW - mg, y, { align: "right" });
  }
  y += 8;

  // ─── Metadata table ───
  const totalDuration = data.phases.reduce(
    (sum, ph) => sum + ph.exercises.reduce((s, ex) => s + (ex.duration ?? 0), 0),
    0,
  );

  const metaRows: string[][] = [];

  const r1: string[] = [];
  if (data.mesocycle != null) r1.push(`Mesociclo: ${data.mesocycle}`);
  if (data.microcycle != null) r1.push(`Microciclo: ${data.microcycle}`);
  r1.push(`Período: ${lbl(data.periodType, PERIOD_LABELS)}`);
  if (r1.length) metaRows.push([r1.join("    ")]);

  const r2: string[] = [];
  r2.push(`Data: ${fmtDate(data.sessionDate)}`);
  if (data.startTime) {
    const time = data.startTime.substring(0, 5) + (data.endTime ? `–${data.endTime.substring(0, 5)}` : "");
    r2.push(`Hora: ${time}`);
  }
  if (totalDuration > 0) r2.push(`Duração: ${totalDuration}'`);
  metaRows.push([r2.join("    ")]);

  const r3: string[] = [];
  if (data.location) r3.push(`Local: ${data.location}`);
  if (data.fieldArea) r3.push(`Área de treino: ${data.fieldArea}`);
  if (data.material) r3.push(`Material: ${data.material}`);
  if (r3.length) metaRows.push([r3.join("    ")]);

  const r4: string[] = [];
  r4.push(`Foco: ${lbl(data.focus, FOCUS_LABELS)}`);
  r4.push(`Intensidade: ${lbl(data.intensity, INTENSITY_LABELS)}`);
  if (r4.length) metaRows.push([r4.join("    ")]);

  if (data.objective) metaRows.push([`Objectivo: ${data.objective}`]);
  if (data.complementaryObjectives) metaRows.push([`Obj. Complementares: ${data.complementaryObjectives}`]);
  if (data.initialInstruction) metaRows.push([`Instrução Inicial: ${data.initialInstruction}`]);

  autoTable(doc, {
    startY: y,
    margin: { left: mg, right: mg },
    body: metaRows,
    theme: "plain",
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: [71, 85, 105] },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.2,
  });
  y = autoTableY(doc, y) + 6;

  // ─── Phases with exercises ───
  let globalTA = 0;

  for (const phase of data.phases) {
    if (y > pageH - 40) { doc.addPage(); y = 14; }

    // Phase header bar
    doc.setFillColor(241, 245, 249);
    doc.rect(mg, y - 3, cw, 7, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    const phaseName = phase.phase_type === "custom"
      ? (phase.phase_name || "Fase Personalizada")
      : (PHASE_LABELS[phase.phase_type] || phase.phase_type);
    doc.text(phaseName, mg + 2, y + 1.5);
    y += 8;

    for (const ex of phase.exercises) {
      globalTA += ex.duration ?? 0;

      if (y > pageH - 70) { doc.addPage(); y = 14; }

      const exStartY = y;
      const imgB64 = ex.diagramUrl ? imageCache.get(ex.diagramUrl) : null;
      const imgW = 75;
      const imgH = 56;
      const textX = imgB64 ? mg + imgW + 4 : mg;
      const textW = imgB64 ? cw - imgW - 4 - 25 : cw - 25; // reserve 25mm for right metadata

      // Draw image
      if (imgB64) {
        try {
          doc.addImage(imgB64, "JPEG", mg, y, imgW, imgH);
        } catch {
          // ignore failed image
        }
      }

      // Exercise name
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(ex.name, textX, y + 4);

      // Right-side metadata
      const metaX = pageW - mg;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      let metaY = y + 4;
      if (ex.duration) { doc.text(`${ex.duration}'`, metaX, metaY, { align: "right" }); metaY += 3.5; }
      if (ex.numPlayers) { doc.text(`Atletas: ${ex.numPlayers}`, metaX, metaY, { align: "right" }); metaY += 3.5; }
      if (ex.fieldDimensions) { doc.text(`Espaço: ${ex.fieldDimensions}`, metaX, metaY, { align: "right" }); metaY += 3.5; }

      // Description + objectives
      let descY = y + 8;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);

      if (ex.description) {
        const descLines = doc.splitTextToSize(ex.description, textW);
        const showLines = descLines.slice(0, 8);
        doc.text(showLines, textX, descY);
        descY += showLines.length * 3.2;
      }

      if (ex.objectives) {
        descY += 1;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("Objectivos:", textX, descY);
        descY += 3.2;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        const objLines = doc.splitTextToSize(ex.objectives, textW);
        const showObjLines = objLines.slice(0, 5);
        doc.text(showObjLines, textX, descY);
        descY += showObjLines.length * 3.2;
      }

      // TA in bottom-right
      const blockHeight = Math.max(imgB64 ? imgH : 0, descY - exStartY, 20);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129);
      doc.text(`TA: ${formatTA(globalTA)}`, metaX, exStartY + blockHeight - 1, { align: "right" });

      // Bottom border
      y = exStartY + blockHeight + 3;
      doc.setDrawColor(226, 232, 240);
      doc.line(mg, y - 1, pageW - mg, y - 1);
    }

    if (phase.exercises.length === 0) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(148, 163, 184);
      doc.text("Sem exercícios nesta fase.", mg + 2, y);
      y += 5;
    }

    y += 3;
  }

  // ─── Notes section ───
  if (data.notes?.trim()) {
    if (y > pageH - 30) { doc.addPage(); y = 14; }
    doc.setFillColor(241, 245, 249);
    doc.rect(mg, y - 3, cw, 7, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Observações", mg + 2, y + 1.5);
    y += 8;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    const noteLines = doc.splitTextToSize(data.notes.trim(), cw);
    doc.text(noteLines, mg, y);
    y += noteLines.length * 3.5;
  }

  // ─── Footer ───
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`Coach11 · Página ${p} de ${pageCount}`, mg, pageH - 8);
  }

  // ─── Save ───
  const dateStr = fmtDate(data.sessionDate).replace(/\//g, "-");
  doc.save(`UT${data.utNumber ?? ""}_${dateStr}.pdf`);
}
