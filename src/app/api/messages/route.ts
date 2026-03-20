import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { markTeamMessagesRead } from "@/lib/messages/unread";
import { getTeamMembersDetailed } from "@/lib/team/members";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { parseBody } from "@/lib/http/validate";

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

type AuthUserLike = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

const MessageCreateSchema = z.object({
  content: z.string().trim().min(1, "A mensagem não pode estar vazia.").max(1200, "A mensagem excede o limite de 1200 caracteres."),
});

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return 80;
  return Math.max(20, Math.min(200, parsed));
}

function normalizeDisplayName(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildNameFromEmail(email: string | null | undefined) {
  if (typeof email !== "string") return null;
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return null;

  const normalized = localPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;

  return normalized
    .split(" ")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function resolveDisplayNameFromAuthUser(user: AuthUserLike | null | undefined) {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;

  return (
    normalizeDisplayName(metadata.full_name) ||
    normalizeDisplayName(metadata.name) ||
    buildNameFromEmail(user?.email)
  );
}

async function loadAuthDisplayNamesById(
  admin: SupabaseClient,
  profileIds: string[],
) {
  const uniqueIds = Array.from(
    new Set(profileIds.filter((profileId) => typeof profileId === "string" && profileId.length > 0)),
  );
  const displayNameByProfileId = new Map<string, string>();

  if (uniqueIds.length === 0) return displayNameByProfileId;

  const authUsers = await Promise.allSettled(
    uniqueIds.map(async (profileId) => {
      const { data, error } = await admin.auth.admin.getUserById(profileId);
      if (error || !data.user) {
        return { profileId, displayName: null as string | null };
      }

      return {
        profileId,
        displayName: resolveDisplayNameFromAuthUser({
          email: data.user.email,
          user_metadata: (data.user.user_metadata ?? {}) as Record<string, unknown>,
        }),
      };
    }),
  );

  for (const result of authUsers) {
    if (result.status !== "fulfilled" || !result.value.displayName) continue;
    displayNameByProfileId.set(result.value.profileId, result.value.displayName);
  }

  return displayNameByProfileId;
}

function mapMessageWithProfile(
  message: TeamMessageRow,
  profileMap: Map<string, ProfileRow>,
  authDisplayNameMap?: Map<string, string>,
) {
  const profile = profileMap.get(message.sender_id);
  const senderName =
    normalizeDisplayName(profile?.full_name) ||
    authDisplayNameMap?.get(message.sender_id) ||
    "Membro da equipa";
  return {
    id: message.id,
    team_id: message.team_id,
    age_group_id: message.age_group_id,
    sender_id: message.sender_id,
    sender_name: senderName,
    sender_avatar_url: profile?.avatar_url || null,
    content: message.content,
    created_at: message.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    let admin: SupabaseClient | null = null;
    try {
      admin = createAdminClient();
    } catch (error) {
      console.error("[/api/messages GET] Admin client falhou:", error);
      admin = null;
    }
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

    const memberContext = await getTeamMembersDetailed(admin ?? supabase, {
      teamId: context.teamId,
      ageGroupId: context.ageGroup.id,
    });
    const missingDisplayNameIds = Array.from(
      new Set([
        ...senderIds.filter((senderId) => !normalizeDisplayName(profileMap.get(senderId)?.full_name)),
        ...memberContext.members
          .filter((member) => !normalizeDisplayName(member.fullName))
          .map((member) => member.profileId),
      ]),
    );
    const authDisplayNameMap =
      admin && missingDisplayNameIds.length > 0
        ? await loadAuthDisplayNamesById(admin, missingDisplayNameIds)
        : new Map<string, string>();

    const members: MessageMemberRow[] = memberContext.members.map((member) => ({
      id: member.profileId,
      full_name:
        normalizeDisplayName(member.fullName) ||
        authDisplayNameMap.get(member.profileId) ||
        buildNameFromEmail(member.email) ||
        "Membro da equipa",
      role: member.role,
    }));

    try {
      const lastVisibleMessageAt =
        messages.length > 0
          ? messages[messages.length - 1]?.created_at || null
          : new Date().toISOString();

      await markTeamMessagesRead(admin ?? supabase, {
        userId: user.id,
        teamId: context.teamId,
        readAt: lastVisibleMessageAt,
      });
    } catch (messageReadError) {
      console.error(
        "Erro ao atualizar estado de leitura das mensagens:",
        messageReadError,
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
        messages: messages.map((row) =>
          mapMessageWithProfile(row, profileMap, authDisplayNameMap)
        ),
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
    } catch (error) {
      console.error("[/api/messages POST] Admin client falhou, a usar client standard:", error);
      db = supabase;
    }

    const parsed = await parseBody(request, MessageCreateSchema);
    if (parsed.error) return parsed.error;
    const { content } = parsed.data;

    const context = await resolveUserTeamContext(db, user.id);
    if (!context.teamId || !context.ageGroup) {
      return NextResponse.json(
        { error: "Sem equipa associada para enviar mensagens." },
        { status: 403 },
      );
    }

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
    let senderDisplayName = normalizeDisplayName(senderProfile?.full_name);
    if (!senderDisplayName) {
      try {
        senderDisplayName =
          (await loadAuthDisplayNamesById(createAdminClient(), [user.id])).get(user.id) || null;
      } catch (error) {
        console.error("[/api/messages POST] Sender display name lookup falhou:", error);
        senderDisplayName = null;
      }
    }

    const profileMap = new Map<string, ProfileRow>();
    profileMap.set(user.id, {
      id: user.id,
      full_name: senderDisplayName,
      avatar_url: senderProfile?.avatar_url || null,
    });

    try {
      await markTeamMessagesRead(db, {
        userId: user.id,
        teamId: context.teamId,
        readAt: (inserted as TeamMessageRow).created_at,
      });
    } catch (messageReadError) {
      console.error("Erro ao sincronizar leitura do autor da mensagem:", messageReadError);
    }

    return NextResponse.json({
      success: true,
      message: mapMessageWithProfile(inserted as TeamMessageRow, profileMap),
    });
  } catch (error) {
    return respondInternalError("api.messages.post", error);
  }
}
