import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthRecoveryGate } from "@/components/auth/AuthRecoveryGate";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookies } from "@/lib/supabase/auth-cookie";
import { BottomNav } from "@/components/layout/BottomNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { UnreadNotificationsProvider } from "@/contexts/UnreadNotificationsContext";
import { AuthenticatedAnalyticsProvider } from "@/components/observability/AuthenticatedAnalyticsProvider";
import { getCachedUserTeamContext, type UserTeamContext } from "@/lib/auth/team-context";
import { AgeGroupProvider } from "@/contexts/AgeGroupContext";
import { PlanTypeCookieWriter } from "@/components/auth/PlanTypeCookieWriter";
import { PurgeCountdownBanner } from "@/components/billing/PurgeCountdownBanner";
import {
  blockedRedirectPath,
  hasActiveAccess,
  type SubscriptionStatus,
} from "@/lib/stripe/subscription-status";

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

  // Buscar perfil do utilizador — campos específicos consumidos pelo layout
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, email, avatar_url, is_super_coordinator, created_at")
    .eq("id", user.id)
    .single();

  // Subscription guard: bloqueia acesso ao dashboard se Individual sem subscricao
  // activa. Clubes sales-led (plan_type='club') ignoram. Super-coordinator
  // bypass (admin platforma).
  // Session client: RLS cobre ambas as leituras (club_memberships_own_select
  // e club_members_can_read, TO authenticated). Sem linha (onboarding,
  // sem clube) o maybeSingle devolve null e o guard nao bloqueia o layout.
  // Purga RGPD: aviso legal nao-dispensavel em todas as paginas do dashboard
  // enquanto houver purga agendada (conta individual cancelada). Lido no
  // MESMO select do guard — o layout nao ganha queries novas.
  let purgeScheduledAt: string | null = null;

  if (!profile?.is_super_coordinator) {
    const { data: subMembership } = await supabase
      .from("club_memberships")
      .select("club_id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();

    if (subMembership?.club_id) {
      const { data: subClub } = await supabase
        .from("clubs")
        .select(
          "plan_type, subscription_status, trial_ends_at, subscription_current_period_end, subscription_cancel_at_period_end, data_purge_scheduled_at",
        )
        .eq("id", subMembership.club_id)
        .maybeSingle();

      if (subClub) {
        const subContext = {
          plan_type:
            (subClub.plan_type === "individual" ? "individual" : "club") as
              | "individual"
              | "club",
          subscription_status:
            (subClub.subscription_status as SubscriptionStatus | null) ?? null,
          trial_ends_at: subClub.trial_ends_at,
          subscription_current_period_end:
            subClub.subscription_current_period_end,
          subscription_cancel_at_period_end:
            subClub.subscription_cancel_at_period_end ?? false,
        };
        if (!hasActiveAccess(subContext)) {
          // (dashboard) layout nao aplica a /billing/*, /precos, /login —
          // seguro fazer redirect sem risco de loop
          redirect(blockedRedirectPath(subContext));
        }
        if (
          subContext.plan_type === "individual" &&
          typeof subClub.data_purge_scheduled_at === "string"
        ) {
          purgeScheduledAt = subClub.data_purge_scheduled_at;
        }
      }
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
  let analyticsContext: UserTeamContext | null = null;

  try {
    analyticsContext = await getCachedUserTeamContext(user.id);
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
      <UnreadNotificationsProvider profileId={profile?.id ?? null}>
        <AgeGroupProvider
          ageGroups={analyticsContext?.allAgeGroups ?? []}
          source={analyticsContext?.source ?? null}
          defaultAgeGroupId={analyticsContext?.ageGroup?.id ?? null}
        >
          <PlanTypeCookieWriter
            planType={analyticsContext?.club?.plan_type ?? "individual"}
          />
          <div
            className="min-h-screen bg-slate-50"
            style={{ ["--coach11-top-inset" as string]: topInset }}
          >
            {/* Sidebar — visível apenas em desktop */}
            <Sidebar
              profile={profile}
              avatarUrl={avatarUrl}
              source={analyticsContext?.source ?? null}
              teamRole={analyticsContext?.teamRole ?? null}
              planType={analyticsContext?.club?.plan_type ?? "individual"}
            />

            {/* Conteúdo principal */}
            <main
              className="min-w-0 pb-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+1rem)] md:ml-64 md:pb-0"
              style={{ paddingTop: "var(--coach11-top-inset, 0px)" }}
            >
              {purgeScheduledAt && (
                <PurgeCountdownBanner scheduledAt={purgeScheduledAt} />
              )}
              {children}
            </main>

            {/* Navegação inferior — visível apenas em mobile */}
            <BottomNav
              profile={profile}
              avatarUrl={avatarUrl}
              source={analyticsContext?.source ?? null}
              teamRole={analyticsContext?.teamRole ?? null}
              planType={analyticsContext?.club?.plan_type ?? "individual"}
            />
          </div>
        </AgeGroupProvider>
      </UnreadNotificationsProvider>
    </AuthenticatedAnalyticsProvider>
  );
}
