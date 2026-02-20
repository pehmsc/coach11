import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    let admin: ReturnType<typeof createAdminClient> | null = null;
    try {
      admin = createAdminClient();
    } catch {
      admin = null;
    }

    const db = admin ?? supabase;

    const { data: existingProfile } = await db
      .from("profiles")
      .select("id, full_name, role, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    let resolvedRole: "coordinator" | "coach" = "coordinator";
    if (admin && user.email) {
      const { data: inviteByEmail } = await admin
        .from("staff_invites")
        .select("role")
        .ilike("email", user.email)
        .order("accepted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inviteByEmail?.role && inviteByEmail.role !== "coordinator") {
        resolvedRole = "coach";
      } else if (inviteByEmail?.role === "coordinator") {
        resolvedRole = "coordinator";
      }
    }

    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      existingProfile?.full_name ||
      user.email?.split("@")[0] ||
      "Utilizador";
    const avatarUrl =
      user.user_metadata?.avatar_url ||
      user.user_metadata?.picture ||
      existingProfile?.avatar_url ||
      null;

    if (!existingProfile) {
      const { error: insertError } = await db.from("profiles").insert({
        id: user.id,
        full_name: fullName,
        role: resolvedRole,
        email: user.email ?? null,
        avatar_url: avatarUrl,
      });

      if (insertError) {
        return NextResponse.json(
          { error: "Não foi possível criar o perfil." },
          { status: 500 },
        );
      }
    } else {
      const updates: Record<string, unknown> = {};
      if (!existingProfile.full_name && fullName) updates.full_name = fullName;
      if (!existingProfile.role && resolvedRole) updates.role = resolvedRole;
      if (!existingProfile.email && user.email) updates.email = user.email;
      if (!existingProfile.avatar_url && avatarUrl) updates.avatar_url = avatarUrl;

      if (Object.keys(updates).length > 0) {
        await db.from("profiles").update(updates).eq("id", user.id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao garantir perfil:", error);
    const message =
      error instanceof Error ? error.message : "Erro interno ao garantir perfil.";
    return NextResponse.json(
      { error: message || "Erro interno ao garantir perfil." },
      { status: 500 },
    );
  }
}
