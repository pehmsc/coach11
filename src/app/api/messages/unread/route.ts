import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { countUnreadTeamMessages } from "@/lib/messages/unread";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    let db = supabase;
    try {
      db = createAdminClient();
    } catch {
      db = supabase;
    }

    const context = await resolveUserTeamContext(db, user.id);
    if (!context.teamId || !context.ageGroup) {
      return NextResponse.json(
        {
          success: true,
          linked: false,
          teamId: null,
          unreadCount: 0,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const unreadCount = await countUnreadTeamMessages(db, {
      teamId: context.teamId,
      userId: user.id,
    });

    return NextResponse.json(
      {
        success: true,
        linked: true,
        teamId: context.teamId,
        unreadCount,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.messages.unread.get", error);
  }
}
