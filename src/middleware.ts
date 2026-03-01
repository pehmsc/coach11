import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
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

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const debugAuth = process.env.NODE_ENV !== "production";

  // Nunca interceptar ficheiros estáticos da app shell/PWA.
  if (shouldBypassAuthMiddleware(path)) {
    return NextResponse.next();
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

  // Rotas que não precisam de autenticação
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/auth") ||
    path.startsWith("/invite") ||
    path === "/";

  // Não autenticado a tentar aceder a rota privada
  if (!user && !isPublic) {
    if (hasAuthCookies) {
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
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
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

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!api|invite|auth|_next/static|_next/image|icons|fonts|assets|manifest\\.webmanifest|sw\\.js|offline\\.html|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|html|webmanifest|woff2?)$).*)",
  ],
};
