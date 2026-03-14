import posthog from "posthog-js";
import {
  sanitizeProductEventProperties,
  type ProductEventName,
  type ProductEventProperties,
} from "@/lib/observability/product-events";

let posthogInitialized = false;

function isPostHogEnabledInBrowser() {
  return (
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "production" &&
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY) &&
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_HOST)
  );
}

export function initPostHogBrowser() {
  if (!isPostHogEnabledInBrowser() || posthogInitialized) {
    return posthogInitialized;
  }

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-mask]",
    },
    person_profiles: "identified_only",
  });

  posthogInitialized = true;
  return true;
}

function getPostHogClient() {
  if (!initPostHogBrowser()) return null;
  return posthog;
}

export type BrowserAnalyticsIdentity = {
  id: string;
  email?: string | null;
  role?: string | null;
  ageGroupId?: string | null;
  ageGroupName?: string | null;
  teamRole?: string | null;
  source?: string | null;
  isSuperCoordinator?: boolean;
};

export function identifyPostHogUser(identity: BrowserAnalyticsIdentity) {
  const client = getPostHogClient();
  if (!client) return;

  client.identify(
    identity.id,
    sanitizeProductEventProperties({
      email: identity.email ?? null,
      role: identity.role ?? null,
      age_group_id: identity.ageGroupId ?? null,
      age_group_name: identity.ageGroupName ?? null,
      team_role: identity.teamRole ?? null,
      context_source: identity.source ?? null,
      is_super_coordinator: identity.isSuperCoordinator ?? false,
    }),
  );
}

export function resetPostHogUser() {
  const client = getPostHogClient();
  if (!client) return;
  client.reset();
}

export function captureDashboardPageview(input: {
  pathname: string;
  search: string;
  role?: string | null;
  ageGroupId?: string | null;
  ageGroupName?: string | null;
  teamRole?: string | null;
}) {
  const client = getPostHogClient();
  if (!client) return;

  const searchSuffix = input.search ? `?${input.search}` : "";
  client.capture(
    "$pageview",
    sanitizeProductEventProperties({
      $current_url: `${window.location.origin}${input.pathname}${searchSuffix}`,
      pathname: input.pathname,
      search: input.search || null,
      area: "dashboard",
      role: input.role ?? null,
      age_group_id: input.ageGroupId ?? null,
      age_group_name: input.ageGroupName ?? null,
      team_role: input.teamRole ?? null,
    }),
  );
}

export function captureClientProductEvent(
  event: ProductEventName,
  properties: ProductEventProperties,
) {
  const client = getPostHogClient();
  if (!client) return;

  client.capture(event, sanitizeProductEventProperties(properties));
}
