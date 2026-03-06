import { handleDeleteCalendarEvents } from "./handlers/delete";
import { handleGetCalendarEvents } from "./handlers/get";
import { handlePatchCalendarEvents } from "./handlers/patch";
import { handlePostCalendarEvents } from "./handlers/post";

export async function GET(request: Request) {
  return handleGetCalendarEvents(request);
}

export async function POST(request: Request) {
  return handlePostCalendarEvents(request);
}

export async function PATCH(request: Request) {
  return handlePatchCalendarEvents(request);
}

export async function DELETE(request: Request) {
  return handleDeleteCalendarEvents(request);
}
