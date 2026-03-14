import type { LocationSource } from "@/lib/location";
import type { Player } from "@/types/database";

export interface TrainingRow {
  id: string;
  session_date: string;
  start_time?: string;
  end_time?: string;
  title?: string;
  location?: string;
  location_address?: string;
  formatted_address?: string;
  latitude?: number | null;
  longitude?: number | null;
  osm_place_id?: string;
  location_source?: LocationSource | null;
  notes?: string;
  image_url?: string | null;
  status: string;
  age_group_id?: string;
  team_id?: string;
}

export interface AttendanceSummary {
  session_id: string;
  present: number;
  late: number;
  absent: number;
  injured: number;
  total: number;
}

export interface SessionDetail {
  session: TrainingRow;
  attendance: Record<string, { player: Player; status: string }>;
  summary: AttendanceSummary;
  hasRecordedAttendance: boolean;
}

export interface TrainingFormFields {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  locationAddress: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  osmPlaceId: string;
  locationSource: "google" | "osm" | "manual" | null;
  notes: string;
  imageUrl: string;
}
