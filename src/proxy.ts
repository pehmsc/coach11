import { NextResponse, type NextRequest } from "next/server";

import { buildCsp, generateNonce, NONCE_HEADER } from "@/lib/security/csp";

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
 * Roots de LISTA legacy single-team. Quando o utilizador esta no plano 'club'
 * (nav multi-team), estas listas sao acessiveis via Equipas -> Escalao -> tab,
 * pelo que so o root exacto (ex. /games) e redirigido para /teams.
 *
 * Recursos profundos (ex. /games/[id], /games/[id]/live, /players/[id]) NAO
 * sao redirigidos: sao paginas validas e devem abrir directamente, para que
 * deep-links (avisos do dashboard, notificacoes, emails) cheguem ao recurso
 * em vez de saltarem para /teams.
 */
const LEGACY_SINGLE_TEAM_LIST_ROOTS = [
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
 * Anexa o nonce por-request a resposta de um documento HTML (Bloco C).
 *
 * - Gera o nonce (CPU-only — preserva a propriedade "proxy sem I/O").
 * - Poe o nonce no header CSP report-only da REQUEST: o renderer do Next le o
 *   nonce do `content-security-policy` ou, em fallback, do
 *   `content-security-policy-report-only` (ver app-render do Next), e carimba
 *   os scripts do framework. Como aqui so se poe no report-only, o enforce
 *   (next.config, com unsafe-inline) nao bloqueia nada — rede de seguranca.
 * - Poe o mesmo report-only na RESPONSE para o browser reportar violacoes.
 *
 * O enforce continua a vir do next.config ate ao PR de promocao.
 */
function withDocumentNonce(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const reportOnlyCsp = buildCsp({ nonce, reportOnly: true });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set("content-security-policy-report-only", reportOnlyCsp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy-Report-Only", reportOnlyCsp);
  return response;
}

/**
 * Aplica redirect quando a rota nao bate com a persona do utilizador.
 * Retorna NextResponse de redirect ou null se nao ha redirect a fazer.
 *
 * - `plan_type === 'club'` e root de LISTA legacy single-team -> /teams.
 *   Recursos profundos (ex. /games/[id]) passam para abrir directamente.
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

  const hitsLegacyListRoot = LEGACY_SINGLE_TEAM_LIST_ROOTS.includes(pathname);
  if (hitsLegacyListRoot) {
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

    // /api/* nao renderiza documentos HTML: o CSP nao governa respostas JSON
    // nem os streams PDF (que tem overrides proprios de frame-ancestors no
    // next.config). Nao gerar nonce nem tocar no CSP dessas rotas.
    const isApiRoute = pathname.startsWith("/api");

    if (isAlwaysAllowedPath(pathname)) {
      return isApiRoute ? NextResponse.next() : withDocumentNonce(request);
    }

    const planRedirect = maybeApplyPlanTypeRedirect(request);
    if (planRedirect) {
      return planRedirect;
    }

    // Hotfix: todo o gating beta/auth fica em route handlers Node.js.
    return isApiRoute ? NextResponse.next() : withDocumentNonce(request);
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons|fonts|assets|manifest\\.webmanifest|sw\\.js|offline\\.html|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|html|webmanifest|woff2?)$).*)",
  ],
};
