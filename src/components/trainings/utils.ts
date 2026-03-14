import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { portugalDateTimeToUtc } from "@/lib/events/presence-window";
import type { TrainingRow } from "./types";

export function groupByMonth(sessions: TrainingRow[]): { label: string; sessions: TrainingRow[] }[] {
  const map = new Map<string, TrainingRow[]>();
  for (const s of sessions) {
    const key = format(parseISO(s.session_date), "MMMM yyyy", { locale: pt });
    const bucket = map.get(key) ?? [];
    bucket.push(s);
    map.set(key, bucket);
  }
  return Array.from(map.entries()).map(([label, sessions]) => ({ label, sessions }));
}

export function isTrainingClosed(session: TrainingRow, now = new Date()) {
  if (session.status === "completed") return true;

  const endAt =
    portugalDateTimeToUtc(session.session_date, session.end_time) ||
    portugalDateTimeToUtc(session.session_date, session.start_time);

  return !!endAt && endAt.getTime() < now.getTime();
}

export function getAttendanceStatusClasses(status: string) {
  if (status === "present") {
    return {
      dot: "bg-emerald-500",
      text: "text-emerald-600",
      label: "Presente",
    };
  }

  if (status === "late") {
    return {
      dot: "bg-amber-500",
      text: "text-amber-600",
      label: "Atrasado",
    };
  }

  if (status === "absent") {
    return {
      dot: "bg-red-500",
      text: "text-red-500",
      label: "Ausente",
    };
  }

  return {
    dot: "bg-orange-400",
    text: "text-orange-500",
    label: "Lesionado",
  };
}
