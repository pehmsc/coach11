import type { LocationSource } from "@/lib/location";
import { EMPTY_LOCATION_FIELDS } from "@/lib/location";
import type { SharedGameFormValues } from "@/components/games/game-form-fields";
import { formatFixtureOpponentLabel } from "@/lib/games/display";

export const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export interface CalEvent {
  id: string;
  type: "training" | "game";
  date: string;
  title?: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
  status?: string;
  opponent_id?: string;
  opponent_name?: string;
  opponent_short_name?: string;
  competition_id?: string;
  location?: string;
  formatted_address?: string;
  latitude?: number | null;
  longitude?: number | null;
  osm_place_id?: string;
  location_source?: LocationSource | null;
  is_home?: boolean;
  image_url?: string;
}

export type ModalMode = "add_training" | "add_game" | "edit_training" | "edit_game";
export type ModalScreen = "view" | "edit";

export type EventForm = SharedGameFormValues & {
  title: string;
  end_time: string;
  notes: string;
  image_url: string;
};

export const EMPTY_FORM: EventForm = {
  title: "",
  date: "",
  start_time: "18:00",
  end_time: "",
  opponent_name: "",
  opponent_short_name: "",
  competition_id: "",
  ...EMPTY_LOCATION_FIELDS,
  is_home: true,
  notes: "",
  image_url: "",
};

export function timeToMinutes(time?: string) {
  if (!time) return Number.MAX_SAFE_INTEGER;
  const [h, m] = time.split(":").map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.MAX_SAFE_INTEGER;
  return h * 60 + m;
}

export function compareEventsByDateTime(a: CalEvent, b: CalEvent) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  const diff = timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
  if (diff !== 0) return diff;
  return a.type.localeCompare(b.type);
}

export function isEventEditable(event: CalEvent | null, canDeleteEvents: boolean) {
  if (!event) return false;
  if (event.type === "game" && event.status === "completed") {
    return canDeleteEvents;
  }
  return event.status !== "completed" && event.status !== "cancelled";
}

export function buildDuplicateTitle(event: CalEvent) {
  const fallbackTitle =
    event.title ||
    (event.type === "training"
      ? "Treino"
      : formatFixtureOpponentLabel({
          isHome: event.is_home ?? true,
          opponentName: event.opponent_name,
          opponentShortName: event.opponent_short_name,
        }));

  return `Cópia ${fallbackTitle}`.trim();
}
