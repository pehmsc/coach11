import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
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
  exercises: {
    id: "exercises",
    href: "/exercises",
    label: "Exercícios",
    icon: BookOpen,
  },
  club: {
    id: "club",
    href: "/club",
    label: "Clube",
    icon: Building2,
  },
  teams: {
    id: "teams",
    href: "/teams",
    label: "Equipas",
    icon: Shield,
  },
  staff: {
    id: "staff",
    href: "/club?tab=members",
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
      NAV_ITEMS.notifications,
      NAV_ITEMS.competitions,
      NAV_ITEMS.games,
      NAV_ITEMS.trainings,
      NAV_ITEMS.exercises,
      NAV_ITEMS.club,
      NAV_ITEMS.teams,
      NAV_ITEMS.statistics,
    ],
  },
  {
    id: "settings",
    items: [NAV_ITEMS.settings],
  },
];

const BASE_MOBILE_APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: "main",
    items: [
      NAV_ITEMS.competitions,
      NAV_ITEMS.games,
      NAV_ITEMS.trainings,
      NAV_ITEMS.exercises,
      NAV_ITEMS.club,
      NAV_ITEMS.teams,
      NAV_ITEMS.notifications,
    ],
  },
  {
    id: "settings",
    items: [NAV_ITEMS.settings],
  },
];

export const MOBILE_FOOTER_NAV_ITEMS: AppNavItem[] = [
  NAV_ITEMS.dashboard,
  NAV_ITEMS.calendar,
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

/**
 * Retorna o label de role tendo em conta o source do contexto.
 * O `source` vem de resolveUserTeamContext() e distingue
 * club_coordinator de age_group_coordinator, ambos com profiles.role = "coordinator".
 */
export function getContextRoleLabel(
  role?: string | null,
  source?: string | null,
  isSuperCoordinator?: boolean | null,
): string {
  if (isSuperCoordinator) return "Super Admin";
  if (source === "club_coordinator") return "Coordenador do Clube";
  if (source === "coordinator") return "Coordenador de Escalão";
  if (source === "staff") return ROLE_LABELS["coach"] ?? "Staff Técnico";
  return getRoleLabel(role);
}
