import { handleCalendarEventsPatch } from "@/lib/services/calendar-events.service";

export async function handlePatchCalendarEvents(request: Request) {
  return handleCalendarEventsPatch(request);
}
