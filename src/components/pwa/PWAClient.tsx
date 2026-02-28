"use client";

import { PWAProvider } from "@/components/pwa/PWAProvider";

export function PWAClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PWAProvider>{children}</PWAProvider>;
}
