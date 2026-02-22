"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  BarChart2,
  MessageSquare,
  Bell,
  Settings,
} from "lucide-react";
import { useUnreadNotifications } from "@/components/layout/use-unread-notifications";

const navItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard" },
  { href: "/calendar", icon: Calendar, label: "Calendário" },
  { href: "/messages", icon: MessageSquare, label: "Mensagens" },
  { href: "/notifications", icon: Bell, label: "Alertas", showBadge: true },
  { href: "/statistics", icon: BarChart2, label: "Stats" },
  { href: "/settings", icon: Settings, label: "Config" },
];

export function BottomNav({ profileId }: { profileId?: string | null }) {
  const pathname = usePathname();
  const unreadCount = useUnreadNotifications(profileId ?? null);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 md:hidden z-40">
      <div className="flex">
        {navItems.map(({ href, icon: Icon, label, showBadge }) => {
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-2.5 gap-1 transition-colors ${
                isActive
                  ? "text-emerald-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="relative">
                <Icon size={21} />
                {showBadge && unreadCount > 0 ? (
                  <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold inline-flex items-center justify-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </span>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
