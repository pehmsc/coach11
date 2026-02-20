"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Calendar, Trophy, BarChart2 } from "lucide-react";

const navItems = [
  { href: "/dashboard", icon: Home, label: "Hoje" },
  { href: "/players", icon: Users, label: "Plantel" },
  { href: "/calendar", icon: Calendar, label: "Calendário" },
  { href: "/competitions", icon: Trophy, label: "Competições" },
  { href: "/statistics", icon: BarChart2, label: "Stats" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 md:hidden z-50">
      <div className="flex">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${
                isActive
                  ? "text-emerald-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon size={22} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
