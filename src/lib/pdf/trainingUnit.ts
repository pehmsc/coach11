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
  rest?: number | null;
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
  phases: PhaseData[];
};

const PHASE_LABELS: Record<string, string> = {
  initial: "Fase Inicial",
  main: "Fase Fundamental",
  final: "Fase Final",
  custom: "Fase Personalizada",
};

const PERIOD_LABELS: Record<string, string> = { pre_season: "Pré-Época", competitive: "Competitivo", transition: "Transição" };
const FOCUS_LABELS: Record<string, string> = { tactical: "Tática", technical: "Técnica", physical: "Física", mixed: "Misto" };
const INTENSITY_LABELS: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto", very_high: "Muito Alto" };
const FIELD_AREA_LABELS: Record<string, string> = { complete: "Campo Inteiro", half: "Meio Campo", third: "1/3 Campo", quarter: "1/4 Campo" };

type PdfDoc = {
  setFontSize: (s: number) => void;
  setFont: (f: string, s: string) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  text: (t: string | string[], x: number, y: number, opts?: { align?: string }) => void;
  getTextWidth: (t: string) => number;
  splitTextToSize: (t: string, w: number) => string[];
  setFillColor: (r: number, g: number, b: number) => void;
  setDrawColor: (r: number, g?: number, b?: number) => void;
  rect: (x: number, y: number, w: number, h: number, s: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addImage: (d: string, f: string, x: number, y: number, w: number, h: number) => void;
  addPage: () => void;
  setPage: (p: number) => void;
  getNumberOfPages: () => number;
  save: (f: string) => void;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
};

async function createPdfDocument() {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  return { doc: doc as unknown as PdfDoc, autoTable };
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

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .trim();
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

async function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 400, height: 300 });
    img.src = base64;
  });
}

function fitImage(imgW: number, imgH: number, maxW: number, maxH: number): { w: number; h: number } {
  const ratio = imgW / imgH;
  let w = maxW;
  let h = maxW / ratio;
  if (h > maxH) { h = maxH; w = maxH * ratio; }
  return { w, h };
}

/** Draw bold label + normal value, return X position after */
function drawLV(doc: PdfDoc, x: number, y: number, label: string, value: string): number {
  doc.setFont("helvetica", "bold");
  doc.text(label, x, y);
  const lw = doc.getTextWidth(label);
  doc.setFont("helvetica", "normal");
  const v = value || "—";
  doc.text(v, x + lw + 1, y);
  return x + lw + 1 + doc.getTextWidth(v);
}

export async function exportTrainingUnitPDF(data: TrainingUnitPdfData) {
  const { doc } = await createPdfDocument();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mg = 15;
  const cw = pageW - mg * 2;
  let y = 16;

  // ─── Pre-load images ───
  const imageCache = new Map<string, string>();
  if (data.clubLogoUrl) {
    const b64 = await urlToBase64(data.clubLogoUrl);
    if (b64) imageCache.set("__logo__", b64);
  }
  for (const phase of data.phases) {
    for (const ex of phase.exercises) {
      if (ex.diagramUrl && !imageCache.has(ex.diagramUrl)) {
        const b64 = await urlToBase64(ex.diagramUrl);
        if (b64) imageCache.set(ex.diagramUrl, b64);
      }
    }
  }

  // ─── Header: logo + club name + UT number ───
  const logoB64 = imageCache.get("__logo__");
  let hx = mg;
  if (logoB64) {
    try {
      const dims = await getImageDimensions(logoB64);
      const fit = fitImage(dims.width, dims.height, 20, 20);
      doc.addImage(logoB64, "PNG", mg, y - 6, fit.w, fit.h);
      hx = mg + fit.w + 4;
    } catch { /* ignore */ }
  }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(data.clubName || "", hx, y);
  const utLabel = data.utNumber ? `Treino ${data.utNumber}` : (data.title ?? "Unidade de Treino");
  doc.text(utLabel, pageW - mg, y, { align: "right" });
  y += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  if (data.teamName) doc.text(data.teamName, hx, y);
  if (data.season) doc.text(`Época ${data.season}`, pageW - mg, y, { align: "right" });
  y += 6;

  // Separator
  doc.setDrawColor(200, 200, 200);
  doc.line(mg, y, pageW - mg, y);
  y += 5;

  // ─── Metadata with bold labels ───
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const sp = 8;

  // Line 1: Mesociclo, Microciclo, Período
  let x = mg;
  x = drawLV(doc, x, y, "Mesociclo: ", String(data.mesocycle ?? "—"));
  x = drawLV(doc, x + sp, y, "Microciclo: ", String(data.microcycle ?? "—"));
  drawLV(doc, x + sp, y, "Período: ", lbl(data.periodType, PERIOD_LABELS));
  y += 5;

  // Line 2: Data, Hora, Duração
  const totalDur = data.phases.reduce((s, p) => s + p.exercises.reduce((s2, e) => s2 + (e.duration ?? 0) + (e.rest ?? 0), 0), 0);
  x = mg;
  x = drawLV(doc, x, y, "Data: ", fmtDate(data.sessionDate));
  if (data.startTime) {
    const time = data.startTime.substring(0, 5) + (data.endTime ? `–${data.endTime.substring(0, 5)}` : "");
    x = drawLV(doc, x + sp, y, "Hora: ", time);
  }
  if (totalDur > 0) drawLV(doc, x + sp, y, "Duração: ", `${totalDur}'`);
  y += 5;

  // Line 3: Local, Área de treino
  x = mg;
  x = drawLV(doc, x, y, "Local: ", data.location || "—");
  drawLV(doc, x + sp, y, "Área de treino: ", lbl(data.fieldArea, FIELD_AREA_LABELS));
  y += 5;

  // Line 4: Material
  drawLV(doc, mg, y, "Material: ", data.material || "—");
  y += 5;

  // Line 5: Foco, Intensidade
  x = mg;
  x = drawLV(doc, x, y, "Foco: ", lbl(data.focus, FOCUS_LABELS));
  drawLV(doc, x + sp, y, "Intensidade: ", lbl(data.intensity, INTENSITY_LABELS));
  y += 7;

  // Objectives
  drawLV(doc, mg, y, "Objectivo: ", stripMarkdown(data.objective || "—"));
  y += 5;
  drawLV(doc, mg, y, "Obj. Complementares: ", stripMarkdown(data.complementaryObjectives || "—"));
  y += 5;
  drawLV(doc, mg, y, "Instrução Inicial: ", stripMarkdown(data.initialInstruction || "—"));
  y += 6;

  // Separator
  doc.setDrawColor(200, 200, 200);
  doc.line(mg, y, pageW - mg, y);
  y += 6;

  // ─── Phases ───
  let globalTA = 0;

  for (const phase of data.phases) {
    if (y > pageH - 40) { doc.addPage(); y = 16; }

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
      const exTR = (ex.duration ?? 0) + (ex.rest ?? 0);
      globalTA += exTR;

      if (y > pageH - 70) { doc.addPage(); y = 16; }

      const exStartY = y;
      const imgB64 = ex.diagramUrl ? imageCache.get(ex.diagramUrl) : null;
      let drawImgW = 0;
      let drawImgH = 0;

      if (imgB64) {
        const dims = await getImageDimensions(imgB64);
        const fitted = fitImage(dims.width, dims.height, 75, 56);
        drawImgW = fitted.w;
        drawImgH = fitted.h;
        try { doc.addImage(imgB64, "JPEG", mg, y, drawImgW, drawImgH); } catch { drawImgW = 0; drawImgH = 0; }
      }

      const hasImg = drawImgW > 0;
      const textX = hasImg ? mg + drawImgW + 4 : mg;
      const metaColW = 25;
      const textW = hasImg ? cw - drawImgW - 4 - metaColW : cw - metaColW;
      const metaX = pageW - mg;

      // Name
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(stripMarkdown(ex.name), textX, y + 4);

      // Right metadata
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      let my = y + 4;
      if (ex.duration) { doc.text(`${ex.duration}'`, metaX, my, { align: "right" }); my += 3.5; }
      if (ex.numPlayers) { doc.text(`Atletas: ${ex.numPlayers}`, metaX, my, { align: "right" }); my += 3.5; }
      if (ex.fieldDimensions) { doc.text(`Espaço: ${stripMarkdown(ex.fieldDimensions)}`, metaX, my, { align: "right" }); my += 3.5; }

      // Description + objectives (full text, stripped of markdown)
      let dy = y + 8;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);

      if (ex.description) {
        const lines = doc.splitTextToSize(stripMarkdown(ex.description), textW);
        doc.text(lines, textX, dy);
        dy += lines.length * 3.2;
      }

      if (ex.objectives) {
        dy += 1;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("Objectivos:", textX, dy);
        dy += 3.2;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        const lines = doc.splitTextToSize(stripMarkdown(ex.objectives), textW);
        doc.text(lines, textX, dy);
        dy += lines.length * 3.2;
      }

      // TA bottom-right
      const blockH = Math.max(drawImgH, dy - exStartY, 20);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129);
      doc.text(`TA: ${formatTA(globalTA)}`, metaX, exStartY + blockH - 1, { align: "right" });

      y = exStartY + blockH + 3;
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

  // ─── Footer (no "Observações" section) ───
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`Coach11 · Página ${p} de ${pageCount}`, mg, pageH - 8);
  }

  const dateStr = fmtDate(data.sessionDate).replace(/\//g, "-");
  doc.save(`UT${data.utNumber ?? ""}_${dateStr}.pdf`);
}
