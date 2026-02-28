"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import { useUnreadNotifications } from "@/components/layout/use-unread-notifications";
import {
  APP_NAV_SECTIONS,
  getRoleLabel,
  isNavItemActive,
} from "@/components/layout/nav-config";
import { UserAvatar } from "@/components/layout/UserAvatar";

interface SidebarProps {
  profile: Profile | null;
  avatarUrl?: string | null;
}

export function Sidebar({ profile, avatarUrl }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const unreadCount = useUnreadNotifications(profile?.id ?? null);
  const mainSection = APP_NAV_SECTIONS.find((section) => section.id === "main");
  const settingsSection = APP_NAV_SECTIONS.find((section) => section.id === "settings");

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-slate-900 flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold">
          <span className="text-white">COACH</span>
          <span className="text-emerald-400">11</span>
        </h1>
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
                {getRoleLabel(profile.role)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {mainSection?.items.map((item) => {
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
                {item.badgeKey === "notifications" && unreadCount > 0 ? (
                  <span className="min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold inline-flex items-center justify-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Configurações + Logout */}
      <div className="p-4 border-t border-slate-800 space-y-1">
        {settingsSection?.title ? (
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {settingsSection.title}
          </p>
        ) : null}
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
