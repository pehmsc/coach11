import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import {
  createNotificationsForTeam,
  createNotificationsForUsers,
} from "@/lib/notifications/service";
import { bulkApplyNotificationAction } from "@/lib/notifications/store";
import { getTeamMembersDetailed } from "@/lib/team/members";
import { respondInternalError } from "@/lib/http/respond-internal-error";

type TeamMessageRow = {
  id: string;
  team_id: string;
  age_group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type MessageMemberRow = {
  id: string;
  full_name: string;
  role: string;
};

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return 80;
  return Math.max(20, Math.min(200, parsed));
}

function normalizeContent(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeMentionUserIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0),
    ),
  );
}

function mapMessageWithProfile(
  message: TeamMessageRow,
  profileMap: Map<string, ProfileRow>,
) {
  const profile = profileMap.get(message.sender_id);
  return {
    id: message.id,
    team_id: message.team_id,
    age_group_id: message.age_group_id,
    sender_id: message.sender_id,
    sender_name: profile?.full_name || "Membro da equipa",
    sender_avatar_url: profile?.avatar_url || null,
    content: message.content,
    created_at: message.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const context = await resolveUserTeamContext(supabase, user.id);
    if (!context.teamId || !context.ageGroup) {
      return NextResponse.json(
        { success: true, linked: false, teamId: null, messages: [], members: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = normalizeLimit(searchParams.get("limit"));

    const { data: rows, error } = await supabase
      .from("team_messages")
      .select("id, team_id, age_group_id, sender_id, content, created_at")
      .eq("team_id", context.teamId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      return respondInternalError("api.messages.get.list", error);
    }

    const messages = (rows || []) as TeamMessageRow[];
    const senderIds = Array.from(new Set(messages.map((row) => row.sender_id)));
    const profileRows =
      senderIds.length > 0
        ? (
            (
              await supabase
                .from("profiles")
                .select("id, full_name, avatar_url")
                .in("id", senderIds)
            ).data || []
          )
        : [];
    const profileMap = new Map(
      (profileRows as ProfileRow[]).map((row) => [row.id, row]),
    );

    const memberContext = await getTeamMembersDetailed(supabase, {
      teamId: context.teamId,
      ageGroupId: context.ageGroup.id,
    });
    const members: MessageMemberRow[] = memberContext.members.map((member) => ({
      id: member.profileId,
      full_name: member.fullName || "Membro da equipa",
      role: member.role,
    }));

    const nowIso = new Date().toISOString();
    try {
      await bulkApplyNotificationAction(createAdminClient(), {
        userId: user.id,
        type: "message",
        onlyUnread: true,
        action: "mark_read",
        nowIso,
      });
    } catch (notificationReadError) {
      console.error(
        "Erro ao atualizar estado das notificações de mensagem:",
        notificationReadError,
      );
    }

    return NextResponse.json(
      {
        success: true,
        linked: true,
        teamId: context.teamId,
        ageGroupId: context.ageGroup.id,
        currentUserId: user.id,
        members,
        messages: messages.map((row) => mapMessageWithProfile(row, profileMap)),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.messages.get", error);
  }
}

export async function POST(request: Request) {
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

    const body = await request.json().catch(() => null);
    const content = normalizeContent(body?.content);
    const mentionUserIds = normalizeMentionUserIds(body?.mentionUserIds);
    if (!content) {
      return NextResponse.json(
        { error: "A mensagem não pode estar vazia." },
        { status: 400 },
      );
    }
    if (content.length > 1200) {
      return NextResponse.json(
        { error: "A mensagem excede o limite de 1200 caracteres." },
        { status: 400 },
      );
    }

    const context = await resolveUserTeamContext(db, user.id);
    if (!context.teamId || !context.ageGroup) {
      return NextResponse.json(
        { error: "Sem equipa associada para enviar mensagens." },
        { status: 403 },
      );
    }

    const memberContext = await getTeamMembersDetailed(db, {
      teamId: context.teamId,
      ageGroupId: context.ageGroup.id,
    });
    const validMemberIds = new Set(
      memberContext.members.map((member) => member.profileId),
    );
    const mentionRecipientIds = mentionUserIds.filter(
      (memberId) => validMemberIds.has(memberId) && memberId !== user.id,
    );

    const { data: inserted, error: insertError } = await db
      .from("team_messages")
      .insert({
        team_id: context.teamId,
        age_group_id: context.ageGroup.id,
        sender_id: user.id,
        content,
      })
      .select("id, team_id, age_group_id, sender_id, content, created_at")
      .single();

    if (insertError || !inserted) {
      return respondInternalError(
        "api.messages.post.insert",
        insertError ?? new Error("MESSAGE_INSERT_EMPTY_RESULT"),
      );
    }

    const { data: senderProfile } = await db
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    try {
      await createNotificationsForTeam(db, {
        teamId: context.teamId,
        ageGroupId: context.ageGroup.id,
        actorId: user.id,
        type: "message",
        entityId: inserted.id,
        title: "Nova mensagem da equipa técnica",
        body:
          (senderProfile?.full_name || "Um membro da equipa") +
          ": " +
          content.slice(0, 120),
        linkPath: "/messages",
        excludeActor: true,
      });
    } catch (notificationError) {
      console.error("Erro ao gerar notificações de mensagem:", notificationError);
    }

    if (mentionRecipientIds.length > 0) {
      try {
        await createNotificationsForUsers(db, {
          recipientIds: mentionRecipientIds,
          actorId: user.id,
          ageGroupId: context.ageGroup.id,
          teamId: context.teamId,
          type: "message",
          entityId: inserted.id,
          title: "Foste mencionado numa mensagem",
          body: `${
            senderProfile?.full_name || "Um membro da equipa"
          } mencionou-te no chat`,
          linkPath: "/messages",
          excludeActor: true,
        });
      } catch (mentionNotificationError) {
        console.error(
          "Erro ao gerar notificações de menção:",
          mentionNotificationError,
        );
      }
    }

    const profileMap = new Map<string, ProfileRow>();
    profileMap.set(user.id, {
      id: user.id,
      full_name: senderProfile?.full_name || null,
      avatar_url: senderProfile?.avatar_url || null,
    });

    return NextResponse.json({
      success: true,
      message: mapMessageWithProfile(inserted as TeamMessageRow, profileMap),
    });
  } catch (error) {
    return respondInternalError("api.messages.post", error);
  }
}
