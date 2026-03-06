import { handleCalendarEventsPost } from "@/lib/services/calendar-events.service";

export async function handlePostCalendarEvents(request: Request) {
  return handleCalendarEventsPost(request);
}
