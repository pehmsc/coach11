"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearClientCaches } from "@/lib/query/cache-clear";
import { InstallPWAButton } from "@/components/pwa/InstallPWAButton";
import {
  getMobileAppNavSections,
  getContextRoleLabel,
  isNavItemActive,
  type NavProfile,
} from "@/components/layout/nav-config";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { ScopeToggle } from "@/components/navigation/ScopeToggle";
import { cn } from "@/lib/utils";

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [] as HTMLElement[];

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"));
}

export function MobileSideNavDrawer({
  open,
  onClose,
  profile,
  avatarUrl,
  source,
  teamRole,
  unreadMessagesCount,
  unreadNotificationsCount,
}: {
  open: boolean;
  onClose: () => void;
  profile: NavProfile;
  avatarUrl?: string | null;
  source?: string | null;
  teamRole?: string | null;
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(drawerRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      previousPathnameRef.current = pathname;
      return;
    }

    if (previousPathnameRef.current !== pathname) {
      onClose();
    }

    previousPathnameRef.current = pathname;
  }, [pathname, open, onClose]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearClientCaches(queryClient);
    onClose();
    router.push("/login");
    router.refresh();
  }

  const navSections = getMobileAppNavSections();
  const mainSection = navSections.find(
    (section) => section.id === "main",
  );
  const settingsSection = navSections.find(
    (section) => section.id === "settings",
  );

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 bottom-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom))] z-40 md:hidden transition-opacity duration-200",
        open
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0",
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Fechar menu"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div
        ref={drawerRef}
        id="mobile-side-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute inset-y-0 left-0 flex w-[min(88vw,22rem)] max-w-full flex-col bg-slate-900 text-white shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-slate-800 px-4 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <UserAvatar
                fullName={profile?.full_name}
                avatarUrl={avatarUrl}
                size="lg"
                fallbackClassName="bg-emerald-600 text-white"
              />
              <div className="min-w-0">
                <p
                  id={titleId}
                  className="truncate text-sm font-semibold text-white"
                >
                  {profile?.full_name || "Utilizador"}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {getContextRoleLabel(profile?.role, source, profile?.is_super_coordinator, teamRole)}
                </p>
                <Link
                  href="/settings"
                  onClick={onClose}
                  className="mt-1 inline-flex text-xs font-medium text-emerald-300 hover:text-emerald-200"
                >
                  Ver perfil/definições
                </Link>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Fechar menu"
              onClick={onClose}
              className="inline-flex size-9 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <ScopeToggle variant="sidebar" />

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {mainSection?.items.map((item) => {
              const isActive = isNavItemActive(pathname, item);
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
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-emerald-600 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  )}
                >
                  <item.icon size={18} />
                  <span className="flex-1">{item.label}</span>
                  {item.badgeKey && badgeCount > 0 ? (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-800 px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
          <div className="space-y-1">
            <InstallPWAButton
              fullWidth
              variant="ghost"
              className="justify-start rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            />
            {settingsSection?.items.map((item) => {
              const isActive = isNavItemActive(pathname, item);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-emerald-600 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  )}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <LogOut size={18} />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
