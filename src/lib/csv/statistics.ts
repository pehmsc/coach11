/**
 * CSV export utilities for statistics tables.
 */

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename: string, csvContent: string) {
  // BOM for Excel UTF-8 compatibility
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export interface AttendanceCsvRow {
  name: string;
  position: string | null;
  minutes: number;
  presences: number;
  late: number;
  absent: number;
  injured: number;
}

export interface GameStatsCsvRow {
  name: string;
  position: string | null;
  convocations: number;
  starters: number;
  substitutes: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  mvp: number;
  averageRating: number | null;
}

export function exportAttendanceCsv(
  ageGroupName: string,
  rows: AttendanceCsvRow[],
) {
  const headers = [
    "Jogador",
    "Posição",
    "Minutos",
    "Presenças",
    "Atrasados",
    "Ausências",
    "Lesionados",
  ];
  const csvRows = rows.map((r) =>
    [
      escapeCsv(r.name),
      escapeCsv(r.position),
      escapeCsv(r.minutes),
      escapeCsv(r.presences),
      escapeCsv(r.late),
      escapeCsv(r.absent),
      escapeCsv(r.injured),
    ].join(","),
  );
  const csv = [headers.join(","), ...csvRows].join("\n");
  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(`presencas_${ageGroupName}_${date}.csv`, csv);
}

export function exportGameStatsCsv(
  ageGroupName: string,
  rows: GameStatsCsvRow[],
) {
  const headers = [
    "Jogador",
    "Posição",
    "Convocatórias",
    "Titular",
    "Suplente",
    "Minutos",
    "Golos",
    "Assistências",
    "Cartões Amarelos",
    "Cartões Vermelhos",
    "MVP",
    "Nota Média",
  ];
  const csvRows = rows.map((r) =>
    [
      escapeCsv(r.name),
      escapeCsv(r.position),
      escapeCsv(r.convocations),
      escapeCsv(r.starters),
      escapeCsv(r.substitutes),
      escapeCsv(r.minutes),
      escapeCsv(r.goals),
      escapeCsv(r.assists),
      escapeCsv(r.yellowCards),
      escapeCsv(r.redCards),
      escapeCsv(r.mvp),
      escapeCsv(r.averageRating !== null ? r.averageRating.toFixed(1) : ""),
    ].join(","),
  );
  const csv = [headers.join(","), ...csvRows].join("\n");
  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(`estatisticas_jogo_${ageGroupName}_${date}.csv`, csv);
}
