import { addWeeks, format, parseISO } from "date-fns";
import type { LocationSource } from "../location";
import { formatUtLabel, getWeekStartDate } from "./ut-numbering";

export type WeeklyDuplicationSourceSession = {
  age_group_id?: string | null;
  team_id?: string | null;
  session_date: string;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  formatted_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  osm_place_id?: string | null;
  location_source?: LocationSource | null;
  objective?: string | null;
  focus?: string | null;
  intensity?: string | null;
  material?: string | null;
  field_area?: string | null;
};

export type WeeklyDuplicatedTrainingInsert = {
  age_group_id: string;
  team_id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  osm_place_id: string | null;
  location_source: LocationSource | null;
  status: "scheduled";
  ut_number: number;
  week_start_date: string;
  objective: string | null;
  focus: string | null;
  intensity: string | null;
  material: string | null;
  field_area: string | null;
  notes: null;
};

type BuildWeeklyDuplicatedTrainingsInput = {
  sourceSessions: WeeklyDuplicationSourceSession[];
  numberOfWeeks: number;
  nextUtNumber: number;
};

export function buildWeeklyDuplicatedTrainings({
  sourceSessions,
  numberOfWeeks,
  nextUtNumber,
}: BuildWeeklyDuplicatedTrainingsInput) {
  const sessions: WeeklyDuplicatedTrainingInsert[] = [];
  let utNumber = nextUtNumber;

  for (let weekOffset = 1; weekOffset <= numberOfWeeks; weekOffset += 1) {
    for (const sourceSession of sourceSessions) {
      if (!sourceSession.age_group_id || !sourceSession.team_id) {
        throw new Error("weekly_duplication_missing_training_scope");
      }

      const duplicatedSessionDate = addWeeks(parseISO(sourceSession.session_date), weekOffset);
      const duplicatedDate = format(duplicatedSessionDate, "yyyy-MM-dd");
      const utLabel = formatUtLabel(utNumber) || "Treino";

      sessions.push({
        age_group_id: sourceSession.age_group_id,
        team_id: sourceSession.team_id,
        title: utLabel,
        session_date: duplicatedDate,
        start_time: sourceSession.start_time || "00:00",
        end_time: sourceSession.end_time ?? null,
        location: sourceSession.location ?? null,
        formatted_address: sourceSession.formatted_address ?? null,
        latitude: sourceSession.latitude ?? null,
        longitude: sourceSession.longitude ?? null,
        osm_place_id: sourceSession.osm_place_id ?? null,
        location_source: sourceSession.location_source ?? null,
        status: "scheduled",
        ut_number: utNumber,
        week_start_date: format(getWeekStartDate(duplicatedSessionDate), "yyyy-MM-dd"),
        objective: sourceSession.objective ?? null,
        focus: sourceSession.focus ?? null,
        intensity: sourceSession.intensity ?? null,
        material: sourceSession.material ?? null,
        field_area: sourceSession.field_area ?? null,
        notes: null,
      });

      utNumber += 1;
    }
  }

  const created = sessions.length;
  const utRange =
    created > 0
      ? {
          from: nextUtNumber,
          to: nextUtNumber + created - 1,
        }
      : null;

  return {
    sessions,
    created,
    utRange,
    firstSessionDate: sessions[0]?.session_date ?? null,
    lastSessionDate: sessions.at(-1)?.session_date ?? null,
  };
}
