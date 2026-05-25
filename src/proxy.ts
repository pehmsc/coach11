import { NextResponse, type NextRequest } from "next/server";

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

/**
 * Rotas legacy single-team. Quando o utilizador esta no plano 'club'
 * (nav multi-team), estes paths sao acessiveis via Equipas -> Escalao -> tab,
 * pelo que entradas directas sao redirigidas para /teams.
 */
const LEGACY_SINGLE_TEAM_PREFIXES = [
  "/games",
  "/players",
  "/trainings",
  "/competitions",
  "/team",
  "/staff",
];

/**
 * Rotas multi-team. Quando o utilizador esta no plano 'individual' (1 equipa
 * unica), estes paths nao fazem sentido — redirige para o dashboard.
 */
const MULTI_TEAM_PREFIXES = ["/teams"];

const PLAN_TYPE_COOKIE = "coach11_plan_type";

function shouldBypassAuthMiddleware(pathname: string) {
  if (STATIC_EXACT_PATHS.has(pathname)) return true;
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return STATIC_FILE_PATTERN.test(pathname);
}

function isAlwaysAllowedPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/invite-only") ||
    pathname.startsWith("/public") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/public-gate") ||
    pathname === "/admin/login" ||
    pathname.startsWith("/admin/login/")
  );
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Aplica redirect quando a rota nao bate com a persona do utilizador.
 * Retorna NextResponse de redirect ou null se nao ha redirect a fazer.
 *
 * - `plan_type === 'club'` e rota legacy single-team -> /teams.
 * - `plan_type === 'individual'` e rota multi-team -> /dashboard.
 * - Default (cookie missing) trata como 'club' (modelo dominante actual).
 */
export function maybeApplyPlanTypeRedirect(
  request: NextRequest,
): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  const cookieValue = request.cookies.get(PLAN_TYPE_COOKIE)?.value;

  // Defensivo: apenas 'individual' tem semantica single-team unica. Qualquer
  // outro valor (incluindo missing, vazio, ou tiers futuros como
  // 'club_standard'/'club_pro') comporta-se como 'club' (multi-team).
  const isIndividual = cookieValue === "individual";

  if (isIndividual) {
    const hitsMultiTeam = MULTI_TEAM_PREFIXES.some((prefix) =>
      matchesPrefix(pathname, prefix),
    );
    if (hitsMultiTeam) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return null;
  }

  const hitsLegacy = LEGACY_SINGLE_TEAM_PREFIXES.some((prefix) =>
    matchesPrefix(pathname, prefix),
  );
  if (hitsLegacy) {
    const url = request.nextUrl.clone();
    url.pathname = "/teams";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return null;
}

export function proxy(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;

    if (shouldBypassAuthMiddleware(pathname)) {
      return NextResponse.next();
    }

    if (isAlwaysAllowedPath(pathname)) {
      return NextResponse.next();
    }

    const planRedirect = maybeApplyPlanTypeRedirect(request);
    if (planRedirect) {
      return planRedirect;
    }

    // Hotfix: todo o gating beta/auth fica em route handlers Node.js.
    return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons|fonts|assets|manifest\\.webmanifest|sw\\.js|offline\\.html|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|html|webmanifest|woff2?)$).*)",
  ],
};
