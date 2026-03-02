import { NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/sanitize-next";

function buildLoginErrorRedirect(origin: string, next: string, errorCode: string) {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", errorCode);

  try {
    const nextUrl = new URL(next, origin);
    const inviteCode = nextUrl.searchParams.get("code");
    if (inviteCode) loginUrl.searchParams.set("code", inviteCode);
  } catch {
    // Ignorar next inválido.
  }

  return loginUrl.toString();
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const tokenType = searchParams.get("type");
  const next = sanitizeNextPath(searchParams.get("next"));
  const oauthError = searchParams.get("error");
  const oauthErrorCode = searchParams.get("error_code");
  const oauthErrorDescription = searchParams.get("error_description");

  const hasOtpPayload = !!tokenHash && !!tokenType;
  if (!code && !hasOtpPayload) {
    if (oauthError || oauthErrorCode || oauthErrorDescription) {
      const combinedError = [
        oauthError,
        oauthErrorCode,
        oauthErrorDescription,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        combinedError.includes("signup") ||
        combinedError.includes("invite") ||
        combinedError.includes("access_denied")
      ) {
        return NextResponse.redirect(
          `${origin}/invite-only?reason=beta_access_required`,
        );
      }

      return NextResponse.redirect(
        buildLoginErrorRedirect(origin, next, "oauth_failed"),
      );
    }

    return NextResponse.redirect(buildLoginErrorRedirect(origin, next, "invalid_callback"));
  }

  const clientUrl = new URL(`${origin}/auth/callback/client`);
  if (code) clientUrl.searchParams.set("code", code);
  if (tokenHash) clientUrl.searchParams.set("token_hash", tokenHash);
  if (tokenType) clientUrl.searchParams.set("type", tokenType);
  clientUrl.searchParams.set("next", next);
  return NextResponse.redirect(clientUrl.toString());
}
