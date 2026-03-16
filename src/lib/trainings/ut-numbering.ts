import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";

export async function getNextUtNumber(
  supabase: SupabaseClient,
  clubId: string,
  ageGroupId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("training_sessions")
    .select("ut_number")
    .eq("age_group_id", ageGroupId)
    .filter("club_id", "eq", clubId)
    .not("ut_number", "is", null)
    .order("ut_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const maxUtNumber = typeof data?.ut_number === "number" ? data.ut_number : 0;
  return maxUtNumber + 1;
}

export function getWeekStartDate(sessionDate: Date): Date {
  const normalizedDate = new Date(sessionDate);
  normalizedDate.setHours(0, 0, 0, 0);

  const day = normalizedDate.getDay();
  const diff = normalizedDate.getDate() - day + (day === 0 ? -6 : 1);
  normalizedDate.setDate(diff);

  return normalizedDate;
}

export function toIsoDate(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export function formatUtLabel(utNumber: number | null | undefined) {
  if (!Number.isInteger(utNumber) || !utNumber || utNumber < 1) {
    return null;
  }

  return `UT${String(utNumber).padStart(2, "0")}`;
}

export function parseUtNumberInput(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

export function getTrainingDisplayTitle(input: {
  title?: string | null;
  ut_number?: number | null;
}) {
  const utLabel = formatUtLabel(input.ut_number);
  const title = input.title?.trim() || "Treino";

  if (!utLabel) {
    return title;
  }

  if (title.toUpperCase() === utLabel) {
    return utLabel;
  }

  return `${utLabel} ${title}`;
}
