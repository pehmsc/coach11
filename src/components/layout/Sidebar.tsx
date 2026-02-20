"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  Calendar,
  Trophy,
  BarChart2,
  Settings,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

const navItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard" },
  { href: "/players", icon: Users, label: "Plantel" },
  { href: "/calendar", icon: Calendar, label: "Calendário" },
  { href: "/competitions", icon: Trophy, label: "Competições" },
  { href: "/statistics", icon: BarChart2, label: "Estatísticas" },
  { href: "/team/setup", icon: Settings, label: "Configurações" },
];

interface SidebarProps {
  profile: Profile | null;
  avatarUrl?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  coordinator: "Coordenador",
  coach: "Treinador",
  player: "Jogador",
  parent: "Encarregado",
};

export function Sidebar({ profile, avatarUrl }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

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
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={profile.full_name}
                className="w-8 h-8 rounded-full object-cover border border-slate-700"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center border border-slate-600">
                {profile.full_name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-slate-300 text-sm truncate">{profile.full_name}</p>
              <p className="text-slate-500 text-xs truncate">
                {ROLE_LABELS[profile.role] || profile.role}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navegação */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                isActive
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-slate-800">
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
