"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  captureDashboardPageview,
  initPostHogBrowser,
} from "@/lib/observability/posthog-client";
import {
  resetAuthenticatedObservabilityContext,
  setAuthenticatedObservabilityContext,
} from "@/lib/observability/user-context";

type AuthenticatedAnalyticsProviderProps = {
  children: React.ReactNode;
  identity: {
    id: string;
    email?: string | null;
    role?: string | null;
    teamRole?: string | null;
    source?: string | null;
    isSuperCoordinator?: boolean;
    ageGroup?: {
      id: string;
      name?: string | null;
    } | null;
  };
};

export function AuthenticatedAnalyticsProvider({
  children,
  identity,
}: AuthenticatedAnalyticsProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPageviewKeyRef = useRef<string | null>(null);

  useEffect(() => {
    initPostHogBrowser();
    setAuthenticatedObservabilityContext({
      id: identity.id,
      email: identity.email ?? null,
      role: identity.role ?? null,
      teamRole: identity.teamRole ?? null,
      source: identity.source ?? null,
      isSuperCoordinator: identity.isSuperCoordinator ?? false,
      ageGroupId: identity.ageGroup?.id ?? null,
      ageGroupName: identity.ageGroup?.name ?? null,
    });

    return () => {
      resetAuthenticatedObservabilityContext();
    };
  }, [
    identity.ageGroup?.id,
    identity.ageGroup?.name,
    identity.email,
    identity.id,
    identity.isSuperCoordinator,
    identity.role,
    identity.source,
    identity.teamRole,
  ]);

  useEffect(() => {
    initPostHogBrowser();
    const search = searchParams?.toString() ?? "";
    const pageviewKey = `${pathname}?${search}`;
    if (lastPageviewKeyRef.current === pageviewKey) return;
    lastPageviewKeyRef.current = pageviewKey;

    captureDashboardPageview({
      pathname,
      search,
      role: identity.role ?? null,
      teamRole: identity.teamRole ?? null,
      ageGroupId: identity.ageGroup?.id ?? null,
      ageGroupName: identity.ageGroup?.name ?? null,
    });
  }, [
    identity.ageGroup?.id,
    identity.ageGroup?.name,
    identity.role,
    identity.teamRole,
    pathname,
    searchParams,
  ]);

  return <>{children}</>;
}
