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
    pathname.startsWith("/api/public")
  );
}

export function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;

    if (shouldBypassAuthMiddleware(pathname)) {
      return NextResponse.next();
    }

    if (isAlwaysAllowedPath(pathname)) {
      return NextResponse.next();
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
