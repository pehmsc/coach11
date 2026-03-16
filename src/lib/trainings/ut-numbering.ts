import type { SupabaseClient } from "@supabase/supabase-js";

export function resolveNextUtNumber(maxUtNumber: number | null | undefined) {
  if (typeof maxUtNumber !== "number" || !Number.isFinite(maxUtNumber) || maxUtNumber < 1) {
    return 1;
  }

  return maxUtNumber + 1;
}

export async function getNextUtNumber(
  supabase: SupabaseClient,
  clubId: string,
  ageGroupId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("training_sessions")
    .select("ut_number")
    .filter("club_id", "eq", clubId)
    .eq("age_group_id", ageGroupId)
    .not("ut_number", "is", null)
    .order("ut_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ ut_number: number | null }>();

  if (error) {
    throw error;
  }

  return resolveNextUtNumber(data?.ut_number);
}
