#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_ROOT = path.join(ROOT, "src");
const MIGRATIONS_ROOT = path.join(ROOT, "supabase", "migrations");
const MIGRATION_BASELINE = 20260308060001;

const SRC_ALLOWED_EXCEPTIONS = new Map([
  [
    "src/lib/team/delete-age-group.ts",
    new Set(["src-club-id-filter"]),
  ],
  [
    "src/app/api/exercises/route.ts",
    new Set(["src-club-id-filter"]), // exercícios partilhados ao nível do clube
  ],
  [
    "src/app/api/exercises/[id]/route.ts",
    new Set(["src-club-id-filter"]), // leitura de exercício ao nível do clube
  ],
  [
    "src/app/api/admin/clubs/list/route.ts",
    new Set(["src-club-id-filter"]), // backoffice agrega counts por clube (super-user gate)
  ],
  [
    "src/app/api/admin/clubs/[id]/snapshot/route.ts",
    new Set(["src-club-id-filter"]), // backoffice snapshot por clube (super-user gate)
  ],
  [
    "src/app/api/admin/clubs/create/route.ts",
    new Set(["src-club-id-filter"]), // backoffice cria clube manualmente (super-user gate)
  ],
  // createAdminClient — ficheiros legítimos que precisam de service_role.
  // AUTH_MGMT: auth.admin.createUser/deleteUser/updateUser
  ["src/app/api/auth/ensure-profile/route.ts", new Set(["src-admin-client"])],
  ["src/app/api/auth/register/route.ts", new Set(["src-admin-client"])],
  ["src/app/api/me/account/route.ts", new Set(["src-admin-client"])],
  ["src/app/api/admin/beta-invites/create-coordinator/route.ts", new Set(["src-admin-client"])],
  // src-club-id-filter: verifica que age_group pertence ao clube do club_coordinator (correcção BUG C-1)
  ["src/app/api/invite/staff/route.ts", new Set(["src-admin-client", "src-club-id-filter"])],
  ["src/app/api/staff/[id]/route.ts", new Set(["src-admin-client"])],
  ["src/app/api/messages/route.ts", new Set(["src-admin-client"])],
  ["src/lib/auth/invite-auth-user.ts", new Set(["src-admin-client"])],
  ["src/lib/auth/beta-access.server.ts", new Set(["src-admin-client"])],
  ["src/lib/auth/super-user.server.ts", new Set(["src-admin-client"])],
  // PUBLIC_SSR: SSR sem sessão auth
  ["src/app/public/[token]/page.tsx", new Set(["src-admin-client"])],
  ["src/app/public/[token]/games/[gameId]/page.tsx", new Set(["src-admin-client"])],
  ["src/app/public/[token]/trainings/[trainingId]/page.tsx", new Set(["src-admin-client"])],
  ["src/app/api/public-gate/[segment]/route.ts", new Set(["src-admin-client"])],
  ["src/app/api/public-share/route.ts", new Set(["src-admin-client"])],
  ["src/app/api/public/games/[identifier]/[gameRef]/live/route.ts", new Set(["src-admin-client"])],
  ["src/app/api/invite/info/route.ts", new Set(["src-admin-client"])],
  // CRON/SERVICE: sem sessão de utilizador
  ["src/app/api/maintenance/prune-notifications/route.ts", new Set(["src-admin-client"])],
  ["src/app/api/notifications/cron/trainings/route.ts", new Set(["src-admin-client"])],
  ["src/app/api/notifications/cron/games/route.ts", new Set(["src-admin-client"])],
  ["src/lib/games/convocation-guard.ts", new Set(["src-admin-client"])],
  ["src/lib/notifications/service.ts", new Set(["src-admin-client"])],
  ["src/lib/supabase/admin.ts", new Set(["src-admin-client"])], // definição
  ["src/app/api/push/test/route.ts", new Set(["src-admin-client"])], // rota de teste push
  // BUG-2: club_coordinator delete age_group + DELETE club data
  ["src/app/api/me/age-group/route.ts", new Set(["src-admin-client", "src-club-id-filter"])],
  ["src/app/api/club/route.ts", new Set(["src-admin-client", "src-club-id-filter"])],
  // CLUB_MEMBERS/LOGO/AGE-GROUPS: endpoints clube-first sem age_group_id
  ["src/app/api/club/members/route.ts", new Set(["src-admin-client", "src-club-id-filter"])],
  ["src/app/api/club/members/[profileId]/route.ts", new Set(["src-admin-client", "src-club-id-filter"])],
  ["src/app/api/club/logo/route.ts", new Set(["src-admin-client", "src-club-id-filter"])],
  ["src/app/api/club/age-groups/route.ts", new Set(["src-admin-client", "src-club-id-filter"])],
  // BUG-1: redeem cria entradas adicionais age_group_staff para multi-escalão
  ["src/app/api/invite/redeem/route.ts", new Set(["src-admin-client"])],
  // CANCEL_INVITE: club_coordinator cancela convites pendentes — verifica club_id para auth
  ["src/app/api/invite/staff/[id]/route.ts", new Set(["src-admin-client", "src-club-id-filter"])],
  // RESEND_INVITE: club_coordinator reenvia email de convite pendente — mesma autorização do DELETE
  ["src/app/api/invite/staff/[id]/resend/route.ts", new Set(["src-admin-client", "src-club-id-filter"])],
  // INVITE_SYNC_FALLBACK: dashboard RSC resgata convite pendente por email antes de redirect para onboarding
  ["src/app/(dashboard)/dashboard/page.tsx", new Set(["src-admin-client"])],
  // CLUB_COORD_ALL_AGE_GROUPS: club_coordinator vê todos os escalões do clube — boundary legítima
  ["src/lib/auth/team-context.ts", new Set(["src-club-id-filter"])],
  // INSIGHTS-AGE-GROUP-SELECT: o seletor de equipa na página de insights precisa de listar
  // os escalões do clube escolhido (gate ado por RLS). Boundary legítima para um dashboard
  // de agregação cross-age-group dentro de um club_id.
  ["src/app/(dashboard)/insights/page.tsx", new Set(["src-club-id-filter"])],
]);

const MIGRATION_ALLOWED_EXCEPTIONS = new Map([
  [
    // BUG-3: substitui rpc_redeem_staff_invite para corrigir dead code no mapeamento de role.
    // A função usa team_staff por compatibilidade com o schema legado — não é nova escrita funcional.
    "supabase/migrations/20260323100000_fix_rpc_staff_invite_role_mapping.sql",
    new Set(["sql-team-staff-write", "sql-team-staff-source"]),
  ],
  [
    // ROLE-NORMALIZE: normalização única de dados — 'coordinator'→'club_coordinator' em club_memberships,
    // 'coordinator'→'age_group_coordinator' em age_group_staff e team_staff, 'coach'→'head_coach' em team_staff.
    // team_staff mantém-se como projecção; este UPDATE é migração de dados históricos, não escrita funcional.
    "supabase/migrations/20260326010000_normalize_coordinator_roles.sql",
    new Set(["sql-team-staff-write"]),
  ],
  [
    // INSIGHTS-FASE-1: RPC de agregação de KPIs por clube. user_can_access_club é o
    // helper de gating de leitura cross-age-group já existente — apropriado aqui porque
    // a métrica do clube é, por construção, a soma de todos os escalões a que o user
    // tem acesso dentro de um club_id. Sem este wrapper teríamos de replicar a lógica
    // (membership + super-coordinator bypass) inline em cada agregação futura.
    "supabase/migrations/20260524074907_create_get_club_insights.sql",
    new Set(["sql-club-wrapper-usage"]),
  ],
  [
    // INSIGHTS-AGE-GROUP-FILTER: substitui a RPC anterior para adicionar p_age_group_id e
    // corrigir o cálculo de game_minutes (passa a tempo total dos jogos em vez de soma de
    // minutos-atleta). Mantém a mesma justificação da migration INSIGHTS-FASE-1 para o uso
    // de user_can_access_club como helper de gating.
    "supabase/migrations/20260524225300_get_club_insights_age_group_and_game_minutes.sql",
    new Set(["sql-club-wrapper-usage"]),
  ],
  [
    // INSIGHTS-FASE-2-RANKINGS: RPC de rankings de atletas (top-N por métrica).
    // Mesma justificação das outras migrations de insights: user_can_access_club
    // é o helper de gating de leitura cross-age-group já existente — apropriado
    // aqui porque o ranking é, por construção, a soma de todos os escalões a que
    // o user tem acesso dentro de um club_id (com filtro opcional por escalão).
    "supabase/migrations/20260525001600_create_get_club_player_rankings.sql",
    new Set(["sql-club-wrapper-usage"]),
  ],
  [
    // INSIGHTS-RANKINGS-SPLIT-METRICS: substitui a RPC anterior para separar
    // métricas de treino e de jogo (present/absent/injured/late e
    // goals/assists/minutes/matches). Mantém a mesma justificação das outras
    // migrations de insights para o uso de user_can_access_club como helper
    // de gating.
    "supabase/migrations/20260525120100_get_club_player_rankings_split_metrics.sql",
    new Set(["sql-club-wrapper-usage"]),
  ],
]);

const SRC_RULES = [
  {
    id: "src-team-tactical-query",
    description:
      "teams.tactical_system já não existe. Usa age_groups.tactical_system como única fonte funcional.",
    regex:
      /\.from\(\s*["']teams["']\s*\)[\s\S]{0,500}?\.(?:select|update|insert|upsert)\([\s\S]{0,240}?\btactical_system\b/g,
  },
  {
    id: "src-team-tactical-type",
    description:
      "Não reintroduzir teams.tactical_system em tipos runtime. A fonte funcional é age_groups.tactical_system.",
    regex: /\bexport\s+interface\s+Team\b[\s\S]{0,250}?\btactical_system\??\s*:/g,
  },
  {
    id: "src-team-staff-query",
    description:
      "Não usar team_staff diretamente no runtime. Usa age_group_staff / resolveUserTeamContext.",
    regex: /\.from\(\s*["']team_staff["']\s*\)/g,
  },
  // club_memberships é tabela de primeira classe na arquitectura club-first (PR #53 + PR #57).
  // Queries a club_memberships são permitidas para resolver o clube principal do utilizador.
  {
    id: "src-club-wrapper-call",
    description:
      "Não chamar helpers de boundary por club no domínio da app. Usa age_group/team helpers.",
    regex: /\buser_can_(?:access|manage)_club\s*\(/g,
  },
  {
    id: "src-club-id-filter",
    description:
      "Não filtrar runtime por club_id como boundary funcional. Usa age_group_id/team_id/game_id/training_session_id.",
    regex: /\.(?:eq|neq|gt|gte|lt|lte|in|is|match)\(\s*["']club_id["']/g,
  },
  {
    id: "src-admin-client",
    description:
      "createAdminClient não autorizado. Usar session client + RLS policies. Se genuinamente necessário (auth.admin API, SSR público, cron), adicionar à allowlist.",
    regex: /createAdminClient\s*\(\)/g,
  },
];

const MIGRATION_RULES = [
  {
    id: "sql-team-tactical-column",
    description:
      "Novas migrations não devem reintroduzir a coluna teams.tactical_system.",
    regex: /\balter\s+table\s+public\.teams\b[\s\S]{0,200}?\btactical_system\b/gi,
  },
  {
    id: "sql-team-tactical-shadow-function",
    description:
      "Novas migrations não devem recriar funções shadow para tactical_system em teams.",
    regex:
      /\bcreate\s+or\s+replace\s+function\s+public\.(?:sync_team_tactical_system|sync_age_group_tactical_system)[a-z_]*\s*\(/gi,
  },
  {
    id: "sql-team-tactical-shadow-trigger",
    description:
      "Novas migrations não devem recriar triggers shadow de tactical_system para teams.",
    regex: /\bcreate\s+trigger\s+\S*tactical_system\S*/gi,
  },
  {
    id: "sql-team-staff-write",
    description:
      "Novas migrations não devem voltar a tratar team_staff como fonte funcional de escrita.",
    regex: /\b(?:insert\s+into|update|delete\s+from)\s+public\.team_staff\b/gi,
  },
  {
    id: "sql-team-staff-source",
    description:
      "Novas migrations não devem usar team_staff como fonte de verdade funcional.",
    regex: /\b(?:from|join)\s+public\.team_staff\b/gi,
  },
  {
    id: "sql-club-wrapper-definition",
    description:
      "Novas migrations não devem criar/redefinir helpers funcionais de club sem revisão explícita.",
    regex:
      /create\s+or\s+replace\s+function\s+public\.(?:user_club_ids|user_can_access_club|user_can_manage_club)\s*\(/gi,
  },
  {
    id: "sql-club-wrapper-usage",
    description:
      "Novas migrations não devem usar user_can_access_club/user_can_manage_club como boundary funcional.",
    regex: /\buser_can_(?:access|manage)_club\s*\(/g,
  },
  // club_memberships é tabela de primeira classe na arquitectura club-first.
  // Migrations podem referenciar club_memberships em RLS policies e auth logic.
  {
    id: "sql-club-boundary-policy",
    description:
      "Novas policies/helpers não devem reintroduzir naming ou boundary centrado em club.",
    regex: /\bclub_boundary_v\d+\b/gi,
  },
  {
    id: "sql-user-default-club",
    description:
      "Novas migrations não devem reintroduzir defaults/guards baseados em user_default_club_id().",
    regex: /\buser_default_club_id\s*\(/g,
  },
];

function listFilesRecursive(rootDir, predicate) {
  const results = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;

    for (const entry of readdirSync(current)) {
      const fullPath = path.join(current, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function toRelative(fullPath) {
  return path.relative(ROOT, fullPath).replaceAll(path.sep, "/");
}

function getMigrationVersion(relativePath) {
  const match = relativePath.match(/supabase\/migrations\/(\d+)_/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function findLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

function normalizeMatch(match) {
  return match.replace(/\s+/g, " ").trim();
}

function collectViolations(relativePath, content, rules, allowedExceptions) {
  const allowed = allowedExceptions.get(relativePath) ?? new Set();
  const violations = [];

  for (const rule of rules) {
    for (const match of content.matchAll(rule.regex)) {
      if (allowed.has(rule.id)) continue;

      violations.push({
        file: relativePath,
        line: findLineNumber(content, match.index ?? 0),
        ruleId: rule.id,
        description: rule.description,
        match: normalizeMatch(match[0]),
      });
    }
  }

  return violations;
}

function formatViolation(violation) {
  return [
    `${violation.file}:${violation.line}`,
    `  rule: ${violation.ruleId}`,
    `  match: ${violation.match}`,
    `  why: ${violation.description}`,
  ].join("\n");
}

const srcFiles = listFilesRecursive(
  SRC_ROOT,
  (fullPath) => /\.(?:ts|tsx|js|jsx)$/.test(fullPath),
);

const migrationFiles = listFilesRecursive(
  MIGRATIONS_ROOT,
  (fullPath) => fullPath.endsWith(".sql"),
).filter((fullPath) => {
  const relativePath = toRelative(fullPath);
  const version = getMigrationVersion(relativePath);
  return typeof version === "number" && version >= MIGRATION_BASELINE;
});

const violations = [];

for (const file of srcFiles) {
  const relativePath = toRelative(file);
  const content = readFileSync(file, "utf8");
  violations.push(
    ...collectViolations(relativePath, content, SRC_RULES, SRC_ALLOWED_EXCEPTIONS),
  );
}

for (const file of migrationFiles) {
  const relativePath = toRelative(file);
  const content = readFileSync(file, "utf8");
  violations.push(
    ...collectViolations(
      relativePath,
      content,
      MIGRATION_RULES,
      MIGRATION_ALLOWED_EXCEPTIONS,
    ),
  );
}

if (violations.length > 0) {
  console.error(
    [
      "Domain boundary guard failed.",
      "team_staff is deprecated. club_memberships is first-class (club-first architecture).",
      "Use age_groups, age_group_staff, club_memberships and teams as the functional boundary.",
      "",
      ...violations.map(formatViolation),
      "",
      "If a technical compatibility exception is genuinely required, update the explicit allowlist in scripts/guard-domain-boundaries.mjs with a narrow justification.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  `Domain boundary guard passed (${srcFiles.length} src files, ${migrationFiles.length} guarded migrations).`,
);
