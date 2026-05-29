import type { LucideIcon } from "lucide-react";
import { getStaffRoleLabel } from "@/lib/team/staff-role";
import {
  BarChart2,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Dumbbell,
  Home,
  Settings,
  Shield,
  Sword,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

export type NavProfile = {
  id: string;
  full_name?: string | null;
  role?: string | null;
  is_super_coordinator?: boolean | null;
} | null;

export type AppNavBadgeKey = "notifications";

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
  // Mesma rota /club, label "Equipa" — para o treinador individual, que gere
  // nome/logo/cores da sua unica equipa (a pagina /club mostra so a tab Detalhes).
  teamHub: {
    id: "teamHub",
    href: "/club",
    label: "Equipa",
    icon: Shield,
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
  insights: {
    id: "insights",
    href: "/insights",
    label: "Insights",
    icon: TrendingUp,
  },
  settings: {
    id: "settings",
    href: "/settings",
    label: "Configurações",
    icon: Settings,
  },
} satisfies Record<string, AppNavItem>;

/**
 * Tipo de plano do clube. Reflecte clubs.plan_type.
 *
 * - `'club'`     — sales-led, multi-team. Nav remove items "single-team
 *   legacy" (Plantel/Jogos/Treinos/Competicoes) — esses sao acessiveis via
 *   Equipas -> Escalao -> tab.
 * - `'individual'` — self-service, treinador unico. Nav single-team classica
 *   (items acessiveis directos), sem Equipas/Clube (irrelevantes).
 */
export type PlanType = "individual" | "club";

const CLUB_APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: "main",
    items: [
      NAV_ITEMS.dashboard,
      NAV_ITEMS.calendar,
      NAV_ITEMS.notifications,
      NAV_ITEMS.teams,
      NAV_ITEMS.club,
      NAV_ITEMS.insights,
      NAV_ITEMS.statistics,
      NAV_ITEMS.exercises,
    ],
  },
  {
    id: "settings",
    items: [NAV_ITEMS.settings],
  },
];

const INDIVIDUAL_APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: "main",
    items: [
      NAV_ITEMS.dashboard,
      NAV_ITEMS.calendar,
      NAV_ITEMS.teamHub,
      NAV_ITEMS.players,
      NAV_ITEMS.games,
      NAV_ITEMS.competitions,
      NAV_ITEMS.trainings,
      NAV_ITEMS.exercises,
      NAV_ITEMS.insights,
      NAV_ITEMS.statistics,
      NAV_ITEMS.notifications,
    ],
  },
  {
    id: "settings",
    items: [NAV_ITEMS.settings],
  },
];

const CLUB_MOBILE_APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: "main",
    items: [
      NAV_ITEMS.teams,
      NAV_ITEMS.club,
      NAV_ITEMS.insights,
      NAV_ITEMS.statistics,
      NAV_ITEMS.exercises,
      NAV_ITEMS.notifications,
    ],
  },
  {
    id: "settings",
    items: [NAV_ITEMS.settings],
  },
];

const INDIVIDUAL_MOBILE_APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: "main",
    items: [
      NAV_ITEMS.competitions,
      NAV_ITEMS.games,
      NAV_ITEMS.trainings,
      NAV_ITEMS.players,
      NAV_ITEMS.teamHub,
      NAV_ITEMS.exercises,
      NAV_ITEMS.insights,
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

/**
 * Devolve secoes do sidebar desktop conforme persona do clube.
 *
 * - `'club'` (default): nav multi-team cleanup A — items single-team legacy
 *   (Plantel/Jogos/Treinos/Competicoes) removidos, Equipas como entrada
 *   principal.
 * - `'individual'`: nav single-team classica — items directos, sem
 *   Equipas/Clube.
 */
export function getAppNavSectionsForPlan(planType: PlanType = "club") {
  const source =
    planType === "individual"
      ? INDIVIDUAL_APP_NAV_SECTIONS
      : CLUB_APP_NAV_SECTIONS;
  return cloneSections(source);
}

/** Devolve secoes do drawer mobile conforme persona do clube. */
export function getMobileAppNavSectionsForPlan(planType: PlanType = "club") {
  const source =
    planType === "individual"
      ? INDIVIDUAL_MOBILE_APP_NAV_SECTIONS
      : CLUB_MOBILE_APP_NAV_SECTIONS;
  return cloneSections(source);
}

export function getNavSection(
  sectionId: AppNavSection["id"],
  planType: PlanType = "club",
) {
  return (
    getAppNavSectionsForPlan(planType).find(
      (section) => section.id === sectionId,
    ) || null
  );
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

/**
 * Retorna o label de role tendo em conta o source do contexto.
 * O `source` vem de resolveUserTeamContext() e distingue
 * club_coordinator de age_group_coordinator, ambos com profiles.role = "coordinator".
 *
 * Fallback: mapeia profiles.role via ROLE_LABELS (cenários sem contexto de equipa).
 */
export function getContextRoleLabel(
  role?: string | null,
  source?: string | null,
  isSuperCoordinator?: boolean | null,
  teamRole?: string | null,
  planType?: string | null,
): string {
  if (isSuperCoordinator) return "Super Admin";
  // Treinador individual: e dono de 1 equipa, nao "coordenador". O role no DB
  // continua club_coordinator (do seu proprio clube) — so o label muda.
  if (planType === "individual") return "Treinador Principal";
  if (source === "club_coordinator") return "Coordenador do Clube";
  if (source === "coordinator") return "Coordenador de Escalão";
  if (source === "staff") return getStaffRoleLabel(teamRole) || "Staff Técnico";
  if (!role) return "Utilizador";
  return ROLE_LABELS[role] || role;
}
