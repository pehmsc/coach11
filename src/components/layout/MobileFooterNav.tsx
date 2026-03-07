"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useUnreadNotifications } from "@/components/layout/use-unread-notifications";
import { MobileSideNavDrawer } from "@/components/layout/MobileSideNavDrawer";
import {
  MOBILE_FOOTER_NAV_ITEMS,
  isNavItemActive,
  type NavProfile,
} from "@/components/layout/nav-config";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { cn } from "@/lib/utils";

export function MobileFooterNav({
  profile,
  avatarUrl,
}: {
  profile: NavProfile;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const unreadMessagesCount = useUnreadNotifications(profile?.id ?? null, {
    type: "message",
  });
  const unreadNotificationsCount = useUnreadNotifications(profile?.id ?? null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div className="md:hidden">
      <MobileSideNavDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        profile={profile}
        avatarUrl={avatarUrl}
        unreadMessagesCount={unreadMessagesCount}
        unreadNotificationsCount={unreadNotificationsCount}
      />

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/90"
        aria-label="Navegação principal mobile"
      >
        <div
          className="grid min-h-[var(--mobile-footer-height)] gap-1 px-2 pt-2 [padding-bottom:calc(env(safe-area-inset-bottom)+0.5rem)]"
          style={{
            gridTemplateColumns: `repeat(${MOBILE_FOOTER_NAV_ITEMS.length + 1}, minmax(0, 1fr))`,
          }}
        >
          <button
            type="button"
            aria-label="Abrir menu"
            aria-controls="mobile-side-nav-drawer"
            aria-expanded={isDrawerOpen}
            aria-haspopup="dialog"
            onClick={() => setIsDrawerOpen((current) => !current)}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors",
              isDrawerOpen
                ? "text-emerald-400"
                : "text-slate-400 hover:text-slate-200",
            )}
          >
            <UserAvatar
              fullName={profile?.full_name}
              avatarUrl={avatarUrl}
              size="sm"
              className="size-6 border border-slate-700"
              fallbackClassName="bg-slate-700 text-[10px] text-slate-100"
            />
            <span>Menu</span>
          </button>

          {MOBILE_FOOTER_NAV_ITEMS.map((item) => {
            const isActive = isNavItemActive(pathname, item);
            const label = item.mobileLabel || item.label;
            const badgeCount =
              item.badgeKey === "messages"
                ? unreadMessagesCount
                : item.badgeKey === "notifications"
                  ? unreadNotificationsCount
                  : 0;

            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors",
                  isActive
                    ? "text-emerald-400"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                <span className="relative">
                  <item.icon size={21} />
                  {item.badgeKey && badgeCount > 0 ? (
                    <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  ) : null}
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
