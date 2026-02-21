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

  // Always delegate the code exchange to the browser client callback.
  //
  // Attempting server-side exchangeCodeForSession here causes a critical problem:
  // if the server exchange fails (e.g. PKCE verifier not in server cookies for
  // OAuth flows, or edge/serverless cold-start cookie mismatch), the authorization
  // server may mark the code as "used" — making it impossible for the client to
  // retry. Skipping the server attempt ensures the client callback always gets a
  // fresh, valid code to exchange.
  //
  // Profile creation and invite sync are handled by the client callback after a
  // successful exchange (via /api/auth/ensure-profile and /api/invite/sync).
  const clientUrl = new URL(`${origin}/auth/callback/client`);
  clientUrl.searchParams.set("code", code);
  clientUrl.searchParams.set("next", next);
  return NextResponse.redirect(clientUrl.toString());
}
