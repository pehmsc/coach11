import { handleCalendarEventsGet } from "@/lib/services/calendar-events.service";

export async function handleGetCalendarEvents(request: Request) {
  return handleCalendarEventsGet(request);
}
