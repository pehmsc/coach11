import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    // PKCE falhou — verificar se existe sessão válida de tentativa anterior
    const {
      data: { user: existingUser },
    } = await supabase.auth.getUser();

    if (existingUser) {
      // Sessão válida existe — redirecionar normalmente
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("Auth callback error:", error);

    // Preservar o código de convite na redirecção de erro
    const errorUrl = new URL(`${origin}/login`);
    errorUrl.searchParams.set("error", "exchange_failed");
    try {
      const nextUrl = new URL(decodeURIComponent(next), origin);
      const inviteCode = nextUrl.searchParams.get("code");
      if (inviteCode) errorUrl.searchParams.set("code", inviteCode);
    } catch {
      // next inválido — ignorar
    }
    return NextResponse.redirect(errorUrl.toString());
  }

  // Garantir que o perfil existe (para Google OAuth)
  const userId = data.session.user.id;
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  if (!existingProfile) {
    const user = data.session.user;
    await supabase.from("profiles").insert({
      id: userId,
      full_name:
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "Utilizador",
      role: "coordinator",
    });
  }

  // Redirect com sessão activa
  return NextResponse.redirect(`${origin}${next}`);
}
