import { NextResponse } from "next/server";

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

  // Troca do código feita no cliente para evitar falhas de PKCE em callback SSR.
  const fallbackUrl = new URL(`${origin}/auth/callback/client`);
  fallbackUrl.searchParams.set("code", code);
  fallbackUrl.searchParams.set("next", next);
  return NextResponse.redirect(fallbackUrl.toString());
}
