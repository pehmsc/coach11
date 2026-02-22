import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { createNotificationsForTeam } from "@/lib/notifications/service";

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

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return 80;
  return Math.max(20, Math.min(200, parsed));
}

function normalizeContent(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
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

    const admin = createAdminClient();
    const context = await resolveUserTeamContext(admin, user.id);
    if (!context.teamId || !context.ageGroup) {
      return NextResponse.json(
        { success: true, linked: false, teamId: null, messages: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = normalizeLimit(searchParams.get("limit"));

    const { data: rows, error } = await admin
      .from("team_messages")
      .select("id, team_id, age_group_id, sender_id, content, created_at")
      .eq("team_id", context.teamId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Erro ao carregar mensagens." },
        { status: 500 },
      );
    }

    const messages = (rows || []) as TeamMessageRow[];
    const senderIds = Array.from(new Set(messages.map((row) => row.sender_id)));
    const profileRows =
      senderIds.length > 0
        ? (
            (
              await admin
                .from("profiles")
                .select("id, full_name, avatar_url")
                .in("id", senderIds)
            ).data || []
          )
        : [];
    const profileMap = new Map(
      (profileRows as ProfileRow[]).map((row) => [row.id, row]),
    );

    const nowIso = new Date().toISOString();
    await admin
      .from("notifications")
      .update({ read_at: nowIso })
      .eq("user_id", user.id)
      .eq("type", "message")
      .eq("team_id", context.teamId)
      .is("read_at", null);

    return NextResponse.json(
      {
        success: true,
        linked: true,
        teamId: context.teamId,
        ageGroupId: context.ageGroup.id,
        currentUserId: user.id,
        messages: messages.map((row) => mapMessageWithProfile(row, profileMap)),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
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

    const body = await request.json().catch(() => null);
    const content = normalizeContent(body?.content);
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

    const admin = createAdminClient();
    const context = await resolveUserTeamContext(admin, user.id);
    if (!context.teamId || !context.ageGroup) {
      return NextResponse.json(
        { error: "Sem equipa associada para enviar mensagens." },
        { status: 403 },
      );
    }

    const { data: inserted, error: insertError } = await admin
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
      return NextResponse.json(
        { error: insertError?.message || "Erro ao enviar mensagem." },
        { status: 500 },
      );
    }

    const { data: senderProfile } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    try {
      await createNotificationsForTeam(admin, {
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
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
