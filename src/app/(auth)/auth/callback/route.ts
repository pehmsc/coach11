import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function sanitizeNext(rawNext: string | null) {
  if (!rawNext) return "/dashboard";

  try {
    const decoded = decodeURIComponent(rawNext);
    if (decoded.startsWith("/")) return decoded;
  } catch {
    if (rawNext.startsWith("/")) return rawNext;
  }

  return "/dashboard";
}

async function ensureProfile(userId: string, email: string | undefined, userMetadata: Record<string, unknown>) {
  try {
    const admin = createAdminClient();

    // Verificar se tem convite como staff para determinar o role
    let resolvedRole: "coordinator" | "coach" = "coordinator";
    if (email) {
      const { data: invite } = await admin
        .from("staff_invites")
        .select("role")
        .ilike("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (invite?.role && invite.role !== "coordinator") resolvedRole = "coach";
    }

    const fullName =
      (userMetadata?.full_name as string) ||
      (userMetadata?.name as string) ||
      email?.split("@")[0] ||
      "Utilizador";
    const avatarUrl =
      (userMetadata?.avatar_url as string) ||
      (userMetadata?.picture as string) ||
      null;

    await admin.from("profiles").upsert(
      {
        id: userId,
        full_name: fullName,
        role: resolvedRole,
        email: email ?? null,
        avatar_url: avatarUrl,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  } catch {
    // Falha silenciosa — o cliente callback fará uma nova tentativa
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  // Tentar finalizar no servidor primeiro; se falhar, cair para callback cliente.
  try {
    const supabase = await createClient();
    const { data: exchangeData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && exchangeData.session?.user) {
      const { user } = exchangeData.session;
      // Garantir que o perfil existe na BD (necessário em primeiro login)
      await ensureProfile(user.id, user.email, user.user_metadata ?? {});
      return NextResponse.redirect(`${origin}${next}`);
    }
  } catch {
    // fallback para callback cliente
  }

  const fallbackUrl = new URL(`${origin}/auth/callback/client`);
  fallbackUrl.searchParams.set("code", code);
  fallbackUrl.searchParams.set("next", next);
  return NextResponse.redirect(fallbackUrl.toString());
}
