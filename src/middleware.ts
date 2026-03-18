import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Centralized auth middleware.
 * Refreshes the Supabase auth session on every matched request.
 * Redirects unauthenticated users away from protected routes.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Refresh the session — this keeps the cookie alive
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protect dashboard routes: redirect to /login if not authenticated
  if (!user && pathname.startsWith("/")) {
    // Only protect dashboard and API routes (not auth, public, or static)
    const isProtectedPage =
      !pathname.startsWith("/login") &&
      !pathname.startsWith("/register") &&
      !pathname.startsWith("/recover") &&
      !pathname.startsWith("/auth") &&
      !pathname.startsWith("/join") &&
      !pathname.startsWith("/public") &&
      !pathname.startsWith("/api/auth") &&
      !pathname.startsWith("/api/waitlist") &&
      !pathname.startsWith("/api/public") &&
      !pathname.startsWith("/_next") &&
      !pathname.startsWith("/manifest") &&
      !pathname.startsWith("/sw") &&
      !pathname.startsWith("/icons") &&
      pathname !== "/";

    if (isProtectedPage && !pathname.startsWith("/api/")) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }

    if (isProtectedPage && pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - icons/ (PWA icons)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|icons/).*)",
  ],
};
