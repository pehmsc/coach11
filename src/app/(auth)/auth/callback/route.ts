import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
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
