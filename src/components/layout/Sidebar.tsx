"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearClientCaches } from "@/lib/query/cache-clear";
import type { Profile } from "@/types/database";
import { useUnreadCounts } from "@/contexts/UnreadNotificationsContext";
import {
  getAppNavSectionsForPlan,
  getContextRoleLabel,
  isNavItemActive,
  type PlanType,
} from "@/components/layout/nav-config";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { ScopeToggle } from "@/components/navigation/ScopeToggle";

interface SidebarProps {
  profile: Profile | null;
  avatarUrl?: string | null;
  source?: string | null;
  teamRole?: string | null;
  /** Plano do clube do utilizador (default 'club' = nav multi-team). */
  planType?: PlanType;
}

export function Sidebar({
  profile,
  avatarUrl,
  source,
  teamRole,
  planType = "club",
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { unreadNotifications: unreadNotificationsCount } = useUnreadCounts();
  const navSections = getAppNavSectionsForPlan(planType);
  const mainSection = navSections.find((section) => section.id === "main");
  const settingsSection = navSections.find((section) => section.id === "settings");

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearClientCaches(queryClient);
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className="fixed bottom-0 left-0 z-40 hidden w-64 flex-col bg-slate-900 md:flex"
      style={{ top: "var(--coach11-top-inset, 0px)" }}
    >
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <p className="text-2xl font-bold">
          <span className="text-white">COACH</span>
          <span className="text-emerald-400">11</span>
        </p>
        {profile && (
          <div className="mt-3 flex items-center gap-2.5 min-w-0">
            <UserAvatar
              fullName={profile.full_name}
              avatarUrl={avatarUrl}
              className="border border-slate-700"
            />
            <div className="min-w-0">
              <p className="text-slate-300 text-sm truncate">{profile.full_name}</p>
              <p className="text-slate-500 text-xs truncate">
                {getContextRoleLabel(profile.role, source, profile.is_super_coordinator, teamRole, planType)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Selector de escalão — visível apenas para club_coordinator com múltiplos escalões */}
      <ScopeToggle variant="sidebar" />

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {mainSection?.items.map((item) => {
            const isActive = isNavItemActive(pathname, item);
            const Icon = item.icon;
            const badgeCount =
              item.badgeKey === "notifications" ? unreadNotificationsCount : 0;

            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                  isActive
                    ? "bg-emerald-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon size={18} />
                <span className="flex-1">{item.label}</span>
                {item.badgeKey && badgeCount > 0 ? (
                  <span className="min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold inline-flex items-center justify-center">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Configurações + Logout */}
      <div className="p-4 border-t border-slate-800 space-y-1">
        {settingsSection?.items.map((item) => {
          const isActive = isNavItemActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                isActive
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon size={18} />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium w-full"
        >
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </aside>
  );
}
