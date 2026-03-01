import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Bell,
  Briefcase,
  Calendar,
  Dumbbell,
  Home,
  MessageSquare,
  Settings,
  Shield,
  Sword,
  Trophy,
  Users,
} from "lucide-react";

export type NavProfile = {
  id: string;
  full_name?: string | null;
  role?: string | null;
  is_super_coordinator?: boolean | null;
} | null;

export type AppNavBadgeKey = "notifications" | "messages";

export type AppNavItem = {
  id: string;
  href: string;
  label: string;
  mobileLabel?: string;
  icon: LucideIcon;
  badgeKey?: AppNavBadgeKey;
};

export type AppNavSection = {
  id: string;
  title?: string;
  items: AppNavItem[];
};

const NAV_ITEMS = {
  dashboard: {
    id: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    mobileLabel: "Hoje",
    icon: Home,
  },
  calendar: {
    id: "calendar",
    href: "/calendar",
    label: "Calendário",
    icon: Calendar,
  },
  messages: {
    id: "messages",
    href: "/messages",
    label: "Mensagens",
    icon: MessageSquare,
    badgeKey: "messages" as const,
  },
  players: {
    id: "players",
    href: "/players",
    label: "Plantel",
    icon: Users,
  },
  competitions: {
    id: "competitions",
    href: "/competitions",
    label: "Competição",
    icon: Trophy,
  },
  games: {
    id: "games",
    href: "/games",
    label: "Jogos",
    icon: Sword,
  },
  trainings: {
    id: "trainings",
    href: "/trainings",
    label: "Treinos",
    icon: Dumbbell,
  },
  team: {
    id: "team",
    href: "/team/setup",
    label: "Equipa",
    icon: Shield,
  },
  staff: {
    id: "staff",
    href: "/staff",
    label: "Equipa técnica",
    icon: Briefcase,
  },
  notifications: {
    id: "notifications",
    href: "/notifications",
    label: "Notificações",
    mobileLabel: "Alertas",
    icon: Bell,
    badgeKey: "notifications" as const,
  },
  statistics: {
    id: "statistics",
    href: "/statistics",
    label: "Estatísticas",
    mobileLabel: "Stats",
    icon: BarChart2,
  },
  settings: {
    id: "settings",
    href: "/settings",
    label: "Configurações",
    icon: Settings,
  },
} satisfies Record<string, AppNavItem>;

const BASE_APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: "main",
    items: [
      NAV_ITEMS.dashboard,
      NAV_ITEMS.calendar,
      NAV_ITEMS.messages,
      NAV_ITEMS.players,
      NAV_ITEMS.competitions,
      NAV_ITEMS.games,
      NAV_ITEMS.trainings,
      NAV_ITEMS.team,
      NAV_ITEMS.staff,
      NAV_ITEMS.statistics,
    ],
  },
  {
    id: "settings",
    title: "Configurações",
    items: [NAV_ITEMS.settings],
  },
];

const BASE_MOBILE_APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: "main",
    items: [
      NAV_ITEMS.calendar,
      NAV_ITEMS.players,
      NAV_ITEMS.competitions,
      NAV_ITEMS.games,
      NAV_ITEMS.trainings,
      NAV_ITEMS.team,
      NAV_ITEMS.staff,
    ],
  },
  {
    id: "settings",
    title: "Configurações",
    items: [NAV_ITEMS.settings],
  },
];

export const MOBILE_FOOTER_NAV_ITEMS: AppNavItem[] = [
  NAV_ITEMS.dashboard,
  NAV_ITEMS.messages,
  NAV_ITEMS.statistics,
];

export const ROLE_LABELS: Record<string, string> = {
  coordinator: "Coordenador",
  coach: "Treinador",
  player: "Jogador",
  parent: "Encarregado",
};

function cloneSections(sections: AppNavSection[]) {
  return sections.map((section) => ({
    ...section,
    items: [...section.items],
  }));
}

export function getAppNavSections() {
  return cloneSections(BASE_APP_NAV_SECTIONS);
}

export function getMobileAppNavSections() {
  return cloneSections(BASE_MOBILE_APP_NAV_SECTIONS);
}

export function getNavSection(sectionId: AppNavSection["id"]) {
  return getAppNavSections().find((section) => section.id === sectionId) || null;
}

export function isNavItemActive(pathname: string, item: AppNavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function getProfileInitials(fullName?: string | null) {
  const tokens = (fullName || "").trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) return "U";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();

  return `${tokens[0][0] || ""}${tokens[tokens.length - 1][0] || ""}`.toUpperCase();
}

export function getRoleLabel(role?: string | null) {
  if (!role) return "Utilizador";
  return ROLE_LABELS[role] || role;
}
