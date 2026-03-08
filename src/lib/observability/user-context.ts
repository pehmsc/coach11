import * as Sentry from "@sentry/nextjs";
import {
  identifyPostHogUser,
  resetPostHogUser,
  type BrowserAnalyticsIdentity,
} from "@/lib/observability/posthog-client";

export type AuthenticatedObservabilityIdentity = BrowserAnalyticsIdentity;

// Mantém PostHog e Sentry alinhados com a sessão autenticada atual.
export function setAuthenticatedObservabilityContext(
  identity: AuthenticatedObservabilityIdentity,
) {
  identifyPostHogUser(identity);

  Sentry.setUser({
    id: identity.id,
    email: identity.email ?? undefined,
  });
  Sentry.setTag("user_role", identity.role ?? "unknown");
  Sentry.setTag("team_role", identity.teamRole ?? "none");
  Sentry.setTag("age_group_id", identity.ageGroupId ?? "none");
  Sentry.setContext(
    "age_group",
    identity.ageGroupId
      ? {
          id: identity.ageGroupId,
          name: identity.ageGroupName ?? undefined,
          source: identity.source ?? undefined,
        }
      : {
          state: "none",
        },
  );
}

export function resetAuthenticatedObservabilityContext() {
  resetPostHogUser();

  Sentry.setUser(null);
  Sentry.setTag("user_role", "anonymous");
  Sentry.setTag("team_role", "none");
  Sentry.setTag("age_group_id", "none");
  Sentry.setContext("age_group", { state: "none" });
}
