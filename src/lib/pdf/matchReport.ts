/**
 * Exporta um relatório de jogo em PDF.
 * Usa jsPDF + jspdf-autotable (instalados separadamente).
 */

interface MatchReportData {
  gameDatetime: string;
  opponentName: string;
  isHome: boolean;
  scoreHome: number;
  scoreAway: number;
  location?: string;
  events: Array<{
    minute: number;
    event_type: string;
    playerName?: string;
    is_opponent_event: boolean;
  }>;
  players: Array<{
    jersey_number?: number;
    name: string;
    goals: number;
    assists: number;
    yellow_cards: number;
    red_cards: number;
    minutes_played?: number;
  }>;
}

const EVENT_PT: Record<string, string> = {
  goal: "Golo",
  assist: "Assistência",
  own_goal: "Autogolo",
  yellow_card: "Cartão Amarelo",
  red_card: "Cartão Vermelho",
  substitution_in: "Substituição (entra)",
  substitution_out: "Substituição (sai)",
};

export async function exportMatchReportPDF(data: MatchReportData): Promise<void> {
  // Dynamic import para não afectar o bundle do servidor
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const margin = 14;
  let y = margin;

  // ── Cabeçalho ──
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("RELATÓRIO DE JOGO", margin, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139); // slate-500
  const dateStr = new Date(data.gameDatetime).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text(dateStr, margin, y);
  y += 6;

  if (data.location) {
    doc.text(`📍 ${data.location}`, margin, y);
    y += 6;
  }

  // ── Marcador ──
  y += 4;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.5);
  doc.line(margin, y, 210 - margin, y);
  y += 8;

  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  const scoreText = `${data.isHome ? "Nós" : data.opponentName} ${data.scoreHome} – ${data.scoreAway} ${data.isHome ? data.opponentName : "Nós"}`;
  doc.text(scoreText, 105, y, { align: "center" });
  y += 12;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${data.isHome ? "Casa" : "Fora"} · vs ${data.opponentName}`,
    105,
    y,
    { align: "center" },
  );
  y += 10;

  doc.line(margin, y, 210 - margin, y);
  y += 8;

  // ── Eventos ──
  if (data.events.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Eventos", margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Min.", "Evento", "Jogador", "Equipa"]],
      body: data.events.map((e) => [
        `${e.minute}'`,
        EVENT_PT[e.event_type] || e.event_type,
        e.playerName || "—",
        e.is_opponent_event ? data.opponentName : "Nós",
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

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Estatísticas dos jogadores ──
  if (data.players.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Estatísticas dos Jogadores", margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["#", "Nome", "Min.", "⚽", "🅰️", "🟨", "🟥"]],
      body: data.players.map((p) => [
        p.jersey_number?.toString() || "—",
        p.name,
        p.minutes_played?.toString() || "—",
        p.goals || 0,
        p.assists || 0,
        p.yellow_cards || 0,
        p.red_cards || 0,
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
      },
      margin: { left: margin, right: margin },
    });
  }

  // ── Rodapé ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `COACH11 · Gerado em ${new Date().toLocaleDateString("pt-PT")}`,
      105,
      292,
      { align: "center" },
    );
  }

  const filename = `relatorio_${data.opponentName.replace(/\s+/g, "_")}_${
    new Date(data.gameDatetime).toISOString().split("T")[0]
  }.pdf`;
  doc.save(filename);
}
