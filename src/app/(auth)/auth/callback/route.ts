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
  const tokenHash = searchParams.get("token_hash");
  const tokenType = searchParams.get("type");
  const next = sanitizeNext(searchParams.get("next"));

  const hasOtpPayload = !!tokenHash && !!tokenType;
  if (!code && !hasOtpPayload) {
    return NextResponse.redirect(`${origin}/login?error=invalid_callback`);
  }

  const clientUrl = new URL(`${origin}/auth/callback/client`);
  if (code) clientUrl.searchParams.set("code", code);
  if (tokenHash) clientUrl.searchParams.set("token_hash", tokenHash);
  if (tokenType) clientUrl.searchParams.set("type", tokenType);
  clientUrl.searchParams.set("next", next);
  return NextResponse.redirect(clientUrl.toString());
}
