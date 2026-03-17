import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthRecoveryGate } from "@/components/auth/AuthRecoveryGate";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookies } from "@/lib/supabase/auth-cookie";
import { BottomNav } from "@/components/layout/BottomNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { UnreadBadgeRuntime } from "@/components/layout/UnreadBadgeRuntime";
import { AuthenticatedAnalyticsProvider } from "@/components/observability/AuthenticatedAnalyticsProvider";
import { resolveUserTeamContext } from "@/lib/auth/team-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (hasSupabaseAuthCookies(cookieStore.getAll())) {
      return <AuthRecoveryGate />;
    }
    redirect("/login");
  }

  // Buscar perfil do utilizador
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Onboarding guard: coordinator sem escalão criado → redirecionar para /onboarding
  if (profile && "role" in profile && profile.role === "coordinator") {
    const { data: ageGroup } = await supabase
      .from("age_groups")
      .select("id")
      .eq("coordinator_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!ageGroup) {
      redirect("/onboarding");
    }
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metadataAvatar =
    (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
    (typeof metadata.picture === "string" && metadata.picture) ||
    null;
  const avatarUrl =
    (profile && "avatar_url" in profile && typeof profile.avatar_url === "string"
      ? profile.avatar_url
      : null) || metadataAvatar;
  const topInset = "max(env(safe-area-inset-top, 0px), env(titlebar-area-height, 0px))";
  let analyticsContext: Awaited<ReturnType<typeof resolveUserTeamContext>> | null = null;

  try {
    analyticsContext = await resolveUserTeamContext(supabase, user.id);
  } catch (error) {
    console.error("[dashboard.layout.analytics-context]", error);
  }

  return (
    <AuthenticatedAnalyticsProvider
      identity={{
        id: user.id,
        email:
          (profile && "email" in profile && typeof profile.email === "string"
            ? profile.email
            : null) || user.email || null,
        role:
          profile && "role" in profile && typeof profile.role === "string"
            ? profile.role
            : null,
        teamRole: analyticsContext?.teamRole ?? null,
        source: analyticsContext?.source ?? null,
        isSuperCoordinator:
          profile && "is_super_coordinator" in profile
            ? profile.is_super_coordinator === true
            : false,
        ageGroup: analyticsContext?.ageGroup
          ? {
              id: analyticsContext.ageGroup.id,
              name: analyticsContext.ageGroup.name,
            }
          : null,
      }}
    >
      <div
        className="min-h-screen bg-slate-50"
        style={{ ["--coach11-top-inset" as string]: topInset }}
      >
        <UnreadBadgeRuntime profileId={profile?.id ?? null} />

        {/* Sidebar — visível apenas em desktop */}
        <Sidebar profile={profile} avatarUrl={avatarUrl} />

        {/* Conteúdo principal */}
        <main
          className="min-w-0 pb-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+1rem)] md:ml-64 md:pb-0"
          style={{ paddingTop: "var(--coach11-top-inset, 0px)" }}
        >
          {children}
        </main>

        {/* Navegação inferior — visível apenas em mobile */}
        <BottomNav profile={profile} avatarUrl={avatarUrl} />
      </div>
    </AuthenticatedAnalyticsProvider>
  );
}
