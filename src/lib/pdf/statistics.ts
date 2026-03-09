/**
 * Exportações PDF das views agregadas da página de estatísticas.
 * Usa jsPDF + jspdf-autotable no cliente.
 */

type StatisticsPdfBaseData = {
  ageGroupName: string;
  selectedCount: number;
  totalCount: number;
};

export type AttendanceStatisticsPdfRow = {
  name: string;
  position?: string | null;
  minutes: number;
  presences: number;
  late: number;
  absent: number;
  injured: number;
};

export type GameStatisticsPdfRow = {
  name: string;
  position?: string | null;
  goals: number;
  conceded: number | null;
  assists: number;
  minutes: number;
  starters: number;
  substitutes: number;
  convocations: number;
  mvp: number;
  mvpRate: number | null;
  averageRating: number | null;
  averageMinutes: number | null;
  yellowCards: number;
  redCards: number;
};

function getSafeFileNamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase();
}

function getSelectionLabel(selectedCount: number, totalCount: number) {
  if (selectedCount > 0 && selectedCount < totalCount) {
    return `${selectedCount} atleta${selectedCount === 1 ? "" : "s"} selecionado${
      selectedCount === 1 ? "" : "s"
    }`;
  }

  return `Plantel completo · ${totalCount} atleta${totalCount === 1 ? "" : "s"}`;
}

async function createPdfDocument(orientation: "portrait" | "landscape") {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  return { doc, autoTable };
}

function renderPdfHeader(
  doc: {
    setFontSize: (size: number) => void;
    setFont: (family: string, style: string) => void;
    setTextColor: (r: number, g: number, b: number) => void;
    text: (text: string, x: number, y: number) => void;
    setDrawColor: (r: number, g: number, b: number) => void;
    setLineWidth: (width: number) => void;
    line: (x1: number, y1: number, x2: number, y2: number) => void;
  },
  title: string,
  data: StatisticsPdfBaseData,
  pageWidth: number,
) {
  const margin = 14;
  let y = margin;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(data.ageGroupName, margin, y);
  y += 6;

  doc.setTextColor(100, 116, 139);
  doc.text(getSelectionLabel(data.selectedCount, data.totalCount), margin, y);
  y += 6;

  doc.text(
    `Gerado em ${new Date().toLocaleDateString("pt-PT")} às ${new Date().toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    margin,
    y,
  );
  y += 8;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  return y + 8;
}

function renderPdfFooter(
  doc: {
    getNumberOfPages: () => number;
    setPage: (pageNumber: number) => void;
    setFontSize: (size: number) => void;
    setTextColor: (r: number, g: number, b: number) => void;
    text: (
      text: string,
      x: number,
      y: number,
      options?: { align?: "left" | "center" | "right" },
    ) => void;
  },
  pageWidth: number,
  pageHeight: number,
) {
  const pageCount = doc.getNumberOfPages();
  for (let index = 1; index <= pageCount; index += 1) {
    doc.setPage(index);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("COACH11 · Estatísticas", pageWidth / 2, pageHeight - 5, {
      align: "center",
    });
  }
}

export async function exportAttendanceStatisticsPDF(
  data: StatisticsPdfBaseData & { rows: AttendanceStatisticsPdfRow[] },
) {
  const { doc, autoTable } = await createPdfDocument("portrait");
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const startY = renderPdfHeader(doc, "MAPA DE PRESENÇAS", data, pageWidth);

  autoTable(doc, {
    startY,
    head: [["Jogador", "Posição", "Min", "Pres.", "Atr.", "Aus.", "Les."]],
    body: data.rows.map((row) => [
      row.name,
      row.position || "—",
      row.minutes,
      row.presences || "—",
      row.late || "—",
      row.absent || "—",
      row.injured || "—",
    ]),
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      2: { halign: "center", cellWidth: 18 },
      3: { halign: "center", cellWidth: 16 },
      4: { halign: "center", cellWidth: 16 },
      5: { halign: "center", cellWidth: 16 },
      6: { halign: "center", cellWidth: 16 },
    },
    margin: { left: margin, right: margin },
  });

  renderPdfFooter(doc, pageWidth, pageHeight);
  doc.save(
    `mapa_presencas_${getSafeFileNamePart(data.ageGroupName)}_${new Date()
      .toISOString()
      .split("T")[0]}.pdf`,
  );
}

export async function exportGameStatisticsPDF(
  data: StatisticsPdfBaseData & { rows: GameStatisticsPdfRow[] },
) {
  const { doc, autoTable } = await createPdfDocument("landscape");
  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 10;
  const startY = renderPdfHeader(doc, "ESTATÍSTICAS DE JOGO", data, pageWidth);

  autoTable(doc, {
    startY,
    head: [[
      "Jogador",
      "Pos.",
      "G",
      "GS",
      "A",
      "Min",
      "T",
      "S",
      "Conv",
      "MVP",
      "%MVP",
      "Nota",
      "Min/J",
      "CA",
      "CV",
    ]],
    body: data.rows.map((row) => [
      row.name,
      row.position || "—",
      row.goals || "—",
      row.conceded === null ? "—" : row.conceded,
      row.assists || "—",
      row.minutes || "—",
      row.starters || "—",
      row.substitutes || "—",
      row.convocations || "—",
      row.mvp || "—",
      row.mvpRate === null ? "—" : `${row.mvpRate.toFixed(0)}%`,
      row.averageRating === null ? "—" : row.averageRating.toFixed(1),
      row.averageMinutes === null ? "—" : row.averageMinutes.toFixed(0),
      row.yellowCards || "—",
      row.redCards || "—",
    ]),
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      1: { halign: "center", cellWidth: 18 },
      2: { halign: "center", cellWidth: 11 },
      3: { halign: "center", cellWidth: 11 },
      4: { halign: "center", cellWidth: 11 },
      5: { halign: "center", cellWidth: 13 },
      6: { halign: "center", cellWidth: 10 },
      7: { halign: "center", cellWidth: 10 },
      8: { halign: "center", cellWidth: 14 },
      9: { halign: "center", cellWidth: 11 },
      10: { halign: "center", cellWidth: 14 },
      11: { halign: "center", cellWidth: 13 },
      12: { halign: "center", cellWidth: 13 },
      13: { halign: "center", cellWidth: 10 },
      14: { halign: "center", cellWidth: 10 },
    },
    margin: { left: margin, right: margin },
  });

  renderPdfFooter(doc, pageWidth, pageHeight);
  doc.save(
    `estatisticas_jogo_${getSafeFileNamePart(data.ageGroupName)}_${new Date()
      .toISOString()
      .split("T")[0]}.pdf`,
  );
}
