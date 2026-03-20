import type { AttendanceStats, GameStats } from "@/components/statistics/types";

function escapeCsv(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(csv: string, filename: string) {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportAttendanceCsv(
  stats: AttendanceStats[],
  ageGroupName: string,
) {
  const headers = ["Jogador", "Posição", "Minutos", "Presenças", "Atrasados", "Ausências", "Lesionados"];
  const rows = stats.map((s) => [
    `${s.player.first_name} ${s.player.last_name}`,
    s.player.preferred_position ?? "",
    s.minutos,
    s.presencas,
    s.atrasados,
    s.ausencias,
    s.lesionados,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\n");
  const date = new Date().toISOString().split("T")[0];
  const safeName = ageGroupName.replace(/[^a-zA-Z0-9]/g, "_");
  downloadCsv(csv, `presencas_${safeName}_${date}.csv`);
}

export function exportGameStatsCsv(
  stats: GameStats[],
  ageGroupName: string,
) {
  const headers = [
    "Jogador", "Posição", "Golos", "GS", "Assistências", "Minutos",
    "Titular", "Suplente", "Convocatórias", "MVP", "CA", "CV",
  ];
  const rows = stats.map((s) => [
    `${s.player.first_name} ${s.player.last_name}`,
    s.player.preferred_position ?? "",
    s.golos,
    s.gs,
    s.assistencias,
    s.minutos,
    s.titular,
    s.suplente,
    s.convocatorias,
    s.mvp,
    s.amarelos,
    s.vermelhos,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\n");
  const date = new Date().toISOString().split("T")[0];
  const safeName = ageGroupName.replace(/[^a-zA-Z0-9]/g, "_");
  downloadCsv(csv, `estatisticas_jogo_${safeName}_${date}.csv`);
}
