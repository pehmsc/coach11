/**
 * Exportações PDF do jogo.
 * Usa jsPDF + jspdf-autotable (instalados separadamente).
 */

type MatchPdfBaseData = {
  gameDatetime: string;
  opponentName: string;
  isHome: boolean;
  scoreHome: number;
  scoreAway: number;
  ourTeamName?: string;
  location?: string;
  title?: string;
  statusLabel?: string;
};

type MatchPdfEvent = {
  minute: number;
  event_type: string;
  playerName?: string;
  relatedPlayerName?: string;
  is_opponent_event: boolean;
};

type MatchPdfPlayerStatsRow = {
  jersey_number?: number;
  name: string;
  lineupLabel?: string;
  goals: number;
  own_goals?: number;
  assists: number;
  goals_conceded?: number;
  yellow_cards: number;
  red_cards: number;
  minutes_played?: number;
};

type MatchPdfAttendanceRow = {
  jersey_number?: number;
  name: string;
  lineupLabel?: string;
  confirmationLabel?: string;
  presenceLabel?: string;
};

export interface MatchReportData extends MatchPdfBaseData {
  events: MatchPdfEvent[];
  players: MatchPdfPlayerStatsRow[];
  squad?: MatchPdfAttendanceRow[];
}

export interface MatchAttendanceData extends MatchPdfBaseData {
  entries: MatchPdfAttendanceRow[];
}

export interface MatchStatisticsData extends MatchPdfBaseData {
  players: MatchPdfPlayerStatsRow[];
}

const EVENT_PT: Record<string, string> = {
  goal: "Golo",
  penalty_goal: "Golo (penálti)",
  assist: "Assistência",
  own_goal: "Autogolo",
  yellow_card: "Cartão amarelo",
  red_card: "Cartão vermelho",
  substitution_in: "Substituição",
  substitution_out: "Substituição",
};

function getMatchDateLabel(gameDatetime: string) {
  return new Date(gameDatetime).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSafeFileDate(gameDatetime: string) {
  return new Date(gameDatetime).toISOString().split("T")[0];
}

function getSafeFileOpponentName(opponentName: string) {
  return opponentName.replace(/\s+/g, "_");
}

function getOurTeamName(data: MatchPdfBaseData) {
  const normalized = data.ourTeamName?.trim();
  return normalized?.length ? normalized : "Nós";
}

function getScoreText(data: MatchPdfBaseData) {
  const ourTeamName = getOurTeamName(data);
  return `${data.isHome ? ourTeamName : data.opponentName} ${data.scoreHome} – ${data.scoreAway} ${
    data.isHome ? data.opponentName : ourTeamName
  }`;
}

function getMatchModeLabel(data: MatchPdfBaseData) {
  return `${data.isHome ? "Casa" : "Fora"} · vs ${data.opponentName}`;
}

function getPdfAutoTableFinalY(doc: unknown, fallback: number) {
  return (
    (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback
  );
}

async function createPdfDocument() {
  // Dynamic import para não afectar o bundle do servidor.
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  return { doc, autoTable };
}

function renderStatsLegend(
  doc: {
    setFontSize: (size: number) => void;
    setFont: (family: string, style: string) => void;
    setTextColor: (r: number, g: number, b: number) => void;
    text: (text: string, x: number, y: number) => void;
  },
  margin: number,
  y: number,
) {
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Min. — Minutos jogados  |  G — Golos  |  AG — Auto-golo  |  A — Assistência  |  GS — Golos sofridos  |  CA — Cartão amarelo  |  CV — Cartão vermelho",
    margin,
    y,
  );
  return y + 6;
}

function renderSectionTitle(doc: {
  setFontSize: (size: number) => void;
  setFont: (family: string, style: string) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  text: (text: string, x: number, y: number) => void;
}, title: string, margin: number, y: number) {
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin, y);
  return y + 4;
}

function renderMatchHeader(
  doc: {
    setFontSize: (size: number) => void;
    setFont: (family: string, style: string) => void;
    setTextColor: (r: number, g: number, b: number) => void;
    setDrawColor: (r: number, g: number, b: number) => void;
    setLineWidth: (width: number) => void;
    line: (x1: number, y1: number, x2: number, y2: number) => void;
    text: (
      text: string,
      x: number,
      y: number,
      options?: { align?: "left" | "center" | "right" },
    ) => void;
  },
  heading: string,
  data: MatchPdfBaseData,
  margin: number,
) {
  let y = margin;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(heading, margin, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(getMatchDateLabel(data.gameDatetime), margin, y);
  y += 6;

  if (data.title) {
    doc.text(data.title, margin, y);
    y += 6;
  }

  if (data.location) {
    doc.text(`Local: ${data.location}`, margin, y);
    y += 6;
  }

  if (data.statusLabel) {
    doc.text(`Estado: ${data.statusLabel}`, margin, y);
    y += 6;
  }

  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, y, 210 - margin, y);
  y += 8;

  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(getScoreText(data), 105, y, { align: "center" });
  y += 12;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(getMatchModeLabel(data), 105, y, { align: "center" });
  y += 10;

  doc.line(margin, y, 210 - margin, y);
  return y + 8;
}

function renderFooter(doc: {
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
}) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `COACH11 · Gerado em ${new Date().toLocaleDateString("pt-PT")}`,
      105,
      292,
      { align: "center" },
    );
  }
}

function buildReportEventPlayerLabel(event: MatchPdfEvent) {
  const baseName = event.playerName?.trim() || "—";

  if (event.event_type === "goal" || event.event_type === "penalty_goal") {
    return event.relatedPlayerName?.trim()
      ? `${baseName} (assistência: ${event.relatedPlayerName})`
      : baseName;
  }

  if (event.event_type === "substitution_out") {
    // player_id = leaving, relatedPlayerName = entering
    return event.relatedPlayerName?.trim()
      ? `${event.relatedPlayerName} ➜ ${baseName}`
      : baseName;
  }

  if (event.event_type === "substitution_in") {
    // player_id = entering, relatedPlayerName = leaving
    return event.relatedPlayerName?.trim()
      ? `${baseName} ➜ ${event.relatedPlayerName}`
      : baseName;
  }

  return baseName;
}

function savePdfFile(
  doc: { save: (filename: string) => void },
  prefix: string,
  data: MatchPdfBaseData,
) {
  doc.save(
    `${prefix}_${getSafeFileOpponentName(data.opponentName)}_${getSafeFileDate(data.gameDatetime)}.pdf`,
  );
}

export async function exportMatchReportPDF(data: MatchReportData): Promise<void> {
  const { doc, autoTable } = await createPdfDocument();
  const margin = 14;
  let y = renderMatchHeader(doc, "RELATÓRIO DE JOGO", data, margin);

  if (data.events.length > 0) {
    y = renderSectionTitle(doc, "Cronologia de eventos", margin, y);

    autoTable(doc, {
      startY: y,
      head: [["Min.", "Evento", "Jogador", "Equipa"]],
      body: data.events.map((event) => [
        `${event.minute}'`,
        EVENT_PT[event.event_type] || event.event_type,
        buildReportEventPlayerLabel(event),
        event.is_opponent_event ? data.opponentName : getOurTeamName(data),
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
      margin: { left: margin, right: margin },
    });

    y = getPdfAutoTableFinalY(doc, y) + 8;
  }

  if (data.squad && data.squad.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = margin;
    }

    y = renderSectionTitle(doc, "Convocatória", margin, y);

    autoTable(doc, {
      startY: y,
      head: [["#", "Jogador", "Utilização"]],
      body: data.squad.map((row) => [
        row.jersey_number?.toString() || "—",
        row.name,
        row.lineupLabel || "Convocado",
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
        0: { halign: "center", cellWidth: 12 },
        2: { halign: "center", cellWidth: 32 },
      },
      margin: { left: margin, right: margin },
    });

    y = getPdfAutoTableFinalY(doc, y) + 8;
  }

  if (data.players.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = margin;
    }

    y = renderSectionTitle(doc, "Estatísticas", margin, y);

    autoTable(doc, {
      startY: y,
      head: [["#", "Nome", "Min.", "G", "AG", "A", "GS", "CA", "CV"]],
      body: data.players.map((player) => [
        player.jersey_number?.toString() || "—",
        player.name,
        player.minutes_played?.toString() || "—",
        player.goals || 0,
        player.own_goals || 0,
        player.assists || 0,
        player.goals_conceded ?? "—",
        player.yellow_cards || 0,
        player.red_cards || 0,
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
        0: { halign: "center", cellWidth: 12 },
        2: { halign: "center", cellWidth: 14 },
        3: { halign: "center", cellWidth: 10 },
        4: { halign: "center", cellWidth: 10 },
        5: { halign: "center", cellWidth: 10 },
        6: { halign: "center", cellWidth: 10 },
        7: { halign: "center", cellWidth: 10 },
        8: { halign: "center", cellWidth: 10 },
      },
      margin: { left: margin, right: margin },
    });

    y = getPdfAutoTableFinalY(doc, y) + 4;
    renderStatsLegend(doc, margin, y);
  }

  renderFooter(doc);
  savePdfFile(doc, "relatorio", data);
}

export async function exportMatchAttendancePDF(
  data: MatchAttendanceData,
): Promise<void> {
  const { doc, autoTable } = await createPdfDocument();
  const margin = 14;
  let y = renderMatchHeader(doc, "MAPA DE PRESENÇAS", data, margin);

  if (data.entries.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Sem convocatória ou presenças registadas para este jogo.", margin, y);
  } else {
    y = renderSectionTitle(doc, "Convocados e presença", margin, y);

    autoTable(doc, {
      startY: y,
      head: [["#", "Jogador", "Utilização", "Confirmação", "Presença"]],
      body: data.entries.map((entry) => [
        entry.jersey_number?.toString() || "—",
        entry.name,
        entry.lineupLabel || "Convocado",
        entry.confirmationLabel || "—",
        entry.presenceLabel || "—",
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
        0: { halign: "center", cellWidth: 12 },
        2: { halign: "center", cellWidth: 28 },
        3: { halign: "center", cellWidth: 30 },
        4: { halign: "center", cellWidth: 22 },
      },
      margin: { left: margin, right: margin },
    });
  }

  renderFooter(doc);
  savePdfFile(doc, "mapa_presencas", data);
}

export async function exportMatchStatisticsPDF(
  data: MatchStatisticsData,
): Promise<void> {
  const { doc, autoTable } = await createPdfDocument();
  const margin = 14;
  let y = renderMatchHeader(doc, "ESTATÍSTICAS FINAIS", data, margin);

  if (data.players.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Este jogo não tem estatísticas finais persistidas.", margin, y);
  } else {
    y = renderSectionTitle(doc, "Estatísticas", margin, y);

    autoTable(doc, {
      startY: y,
      head: [["#", "Jogador", "Tipo", "Min.", "G", "AG", "A", "GS", "CA", "CV"]],
      body: data.players.map((player) => [
        player.jersey_number?.toString() || "—",
        player.name,
        player.lineupLabel || "—",
        player.minutes_played?.toString() || "—",
        player.goals || 0,
        player.own_goals || 0,
        player.assists || 0,
        player.goals_conceded ?? "—",
        player.yellow_cards || 0,
        player.red_cards || 0,
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
        0: { halign: "center", cellWidth: 12 },
        2: { halign: "center", cellWidth: 22 },
        3: { halign: "center", cellWidth: 14 },
        4: { halign: "center", cellWidth: 10 },
        5: { halign: "center", cellWidth: 10 },
        6: { halign: "center", cellWidth: 10 },
        7: { halign: "center", cellWidth: 10 },
        8: { halign: "center", cellWidth: 10 },
        9: { halign: "center", cellWidth: 10 },
      },
      margin: { left: margin, right: margin },
    });

    y = getPdfAutoTableFinalY(doc, y) + 4;
    renderStatsLegend(doc, margin, y);
  }

  renderFooter(doc);
  savePdfFile(doc, "estatisticas", data);
}
