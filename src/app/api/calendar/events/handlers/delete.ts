import { handleCalendarEventsDelete } from "@/lib/services/calendar-events.service";

export async function handleDeleteCalendarEvents(request: Request) {
  return handleCalendarEventsDelete(request);
}
