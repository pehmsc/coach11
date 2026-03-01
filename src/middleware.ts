import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBetaOnboardingState,
  isBetaAllowed,
} from "@/lib/auth/beta-access";
import { hasSupabaseAuthCookies } from "@/lib/supabase/auth-cookie";
import { SUPABASE_AUTH_COOKIE_OPTIONS } from "@/lib/supabase/config";

const STATIC_EXACT_PATHS = new Set([
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

const STATIC_PREFIXES = [
  "/_next/static/",
  "/_next/image/",
  "/icons/",
  "/fonts/",
  "/assets/",
];

const STATIC_FILE_PATTERN =
  /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|html|webmanifest|woff2?)$/i;

function shouldBypassAuthMiddleware(pathname: string) {
  if (STATIC_EXACT_PATHS.has(pathname)) return true;
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return STATIC_FILE_PATTERN.test(pathname);
}

function isPublicPage(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/invite-only") ||
    pathname.startsWith("/public")
  );
}

function isPublicApi(pathname: string) {
  return (
    pathname.startsWith("/api/auth/ensure-profile") ||
    pathname.startsWith("/api/auth/beta-access/check") ||
    pathname.startsWith("/api/maintenance/")
  );
}

function isApiRoute(pathname: string) {
  return pathname.startsWith("/api/");
}

function extractPublicRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  return "unknown";
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function guardPublicShareRequest(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/public/")) return null;

  const token = path.split("/")[2]?.trim();
  if (!token) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const admin = createAdminClient();
    const tokenHash = await sha256Hex(token);
    const nowIso = new Date().toISOString();

    const { data: share, error: shareError } = await admin
      .from("public_share_tokens")
      .select("id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .maybeSingle();

    if (shareError || !share) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const ipHash = await sha256Hex(extractPublicRequestIp(request));
    const { data: rateData, error: rateError } = await admin.rpc(
      "consume_public_share_rate_limit",
      {
        p_token_hash: tokenHash,
        p_ip_hash: ipHash,
        p_ip_limit: 60,
        p_token_limit: 300,
      },
    );

    const rateResult =
      rateData && typeof rateData === "object"
        ? (rateData as Record<string, unknown>)
        : null;

    if (rateError || rateResult?.ok !== true) {
      return new NextResponse("Too Many Requests", { status: 429 });
    }
  } catch {
    return new NextResponse("Too Many Requests", { status: 429 });
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const debugAuth = process.env.NODE_ENV !== "production";

  // Nunca interceptar ficheiros estáticos da app shell/PWA.
  if (shouldBypassAuthMiddleware(path)) {
    return NextResponse.next();
  }

  const publicShareResponse = await guardPublicShareRequest(request);
  if (publicShareResponse) {
    return publicShareResponse;
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
      cookieOptions: SUPABASE_AUTH_COOKIE_OPTIONS,
    },
  );

  // IMPORTANTE: não usar getSession() — usar getUser() para segurança
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const hasAuthCookies = hasSupabaseAuthCookies(request.cookies.getAll());
  const isPublic = isApiRoute(path) ? isPublicApi(path) : isPublicPage(path);

  // Não autenticado a tentar aceder a rota privada
  if (!user && !isPublic) {
    if (hasAuthCookies) {
      if (isApiRoute(path)) {
        return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
      }
      if (debugAuth) {
        console.warn("[auth.debug] allowing request through for recovery", {
          path,
          authError: authError?.message || null,
        });
      }
      return supabaseResponse;
    }

    if (debugAuth) {
      console.info("[auth.debug] redirecting to login", {
        path,
        reason: "no_user_no_auth_cookie",
      });
    }

    if (isApiRoute(path)) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const betaAccess = await isBetaAllowed({
      profileId: user.id,
      email: user.email ?? null,
    });

    if (!betaAccess.allowed) {
      if (debugAuth) {
        console.warn("[auth.debug] beta access blocked", {
          path,
          email: user.email ?? null,
          reason: betaAccess.reason,
        });
      }

      if (isApiRoute(path) && !isPublicApi(path)) {
        return NextResponse.json({ error: "Acesso beta por convite obrigatório." }, { status: 403 });
      }

      if (!path.startsWith("/invite-only")) {
        const url = request.nextUrl.clone();
        url.pathname = "/invite-only";
        url.searchParams.set("reason", "beta_access_required");
        return NextResponse.redirect(url);
      }
    }
  }

  // Autenticado a tentar aceder ao login/registo
  if (user && (path.startsWith("/login") || path.startsWith("/register"))) {
    if (debugAuth) {
      console.info("[auth.debug] redirecting authenticated user", {
        path,
        reason: "auth_page_with_user",
      });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && !isApiRoute(path) && !isPublicPage(path)) {
    const onboarding = await getBetaOnboardingState(user.id, user.email ?? null);
    if (onboarding.requiresOnboarding && !path.startsWith("/team/setup")) {
      const url = request.nextUrl.clone();
      url.pathname = "/team/setup";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons|fonts|assets|manifest\\.webmanifest|sw\\.js|offline\\.html|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|html|webmanifest|woff2?)$).*)",
  ],
};
