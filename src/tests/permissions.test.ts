import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  ALL_PERMISSION_AREAS,
  AREA_LABELS,
  PERMISSION_TEMPLATES,
} from "../lib/auth/permissions-shared";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
type TableSeed = Record<string, Row[]>;

const ORIGINAL_SUPER_COORDINATOR_EMAIL =
  process.env.SUPER_COORDINATOR_EMAIL;

function cloneRow<T extends Row>(row: T): T {
  return { ...row };
}

function clearDynamicMocks() {
  vi.unmock("@/lib/auth/beta-access");
  vi.unmock("@/lib/auth/permissions");
  vi.unmock("@/lib/auth/team-context");
  vi.unmock("@/lib/http/respond-internal-error");
  vi.unmock("@/lib/supabase/admin");
  vi.unmock("@/lib/supabase/server");
}

function createMockAdmin(seed: TableSeed = {}) {
  const tables = new Map(
    Object.entries(seed).map(([table, rows]) => [
      table,
      rows.map((row) => cloneRow(row)),
    ]),
  );
  const upsertCalls: Array<{
    table: string;
    rows: Row[];
    options: { onConflict?: string } | undefined;
  }> = [];

  const readRows = (table: string) =>
    (tables.get(table) ?? []).map((row) => cloneRow(row));

  const writeRows = (table: string, rows: Row[]) => {
    tables.set(
      table,
      rows.map((row) => cloneRow(row)),
    );
  };

  const filterRows = (
    table: string,
    filters: Array<{ column: string; value: unknown }>,
  ) =>
    readRows(table).filter((row) =>
      filters.every(({ column, value }) => row[column] === value),
    );

  const createBuilder = (table: string) => {
    const filters: Array<{ column: string; value: unknown }> = [];

    const builder = {
      select(columns?: string) {
        void columns;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, value });
        return builder;
      },
      async maybeSingle() {
        const [row] = filterRows(table, filters);
        return { data: row ?? null, error: null };
      },
      async upsert(
        rows: Row[],
        options?: {
          onConflict?: string;
        },
      ) {
        const nextRows = readRows(table);
        upsertCalls.push({
          table,
          rows: rows.map((row) => cloneRow(row)),
          options,
        });

        const onConflictKeys = options?.onConflict
          ?.split(",")
          .map((key) => key.trim())
          .filter(Boolean);

        rows.forEach((row) => {
          if (!onConflictKeys || onConflictKeys.length === 0) {
            nextRows.push(cloneRow(row));
            return;
          }

          const existingIndex = nextRows.findIndex((existingRow) =>
            onConflictKeys.every((key) => existingRow[key] === row[key]),
          );

          if (existingIndex >= 0) {
            nextRows[existingIndex] = {
              ...nextRows[existingIndex],
              ...cloneRow(row),
            };
            return;
          }

          nextRows.push(cloneRow(row));
        });

        writeRows(table, nextRows);
        return { data: rows, error: null };
      },
      then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
        onfulfilled?:
          | ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null,
      ) {
        return Promise.resolve({
          data: filterRows(table, filters),
          error: null,
        }).then(onfulfilled, onrejected);
      },
    };

    return builder;
  };

  return {
    admin: {
      from: vi.fn((table: string) => createBuilder(table)),
    },
    getRows: (table: string) => readRows(table),
    upsertCalls,
  };
}

async function loadPermissionsModule(
  superCoordinatorEmail = "master@example.com",
) {
  clearDynamicMocks();
  vi.resetModules();
  process.env.SUPER_COORDINATOR_EMAIL = superCoordinatorEmail;
  const betaAccessModule = await import("../lib/auth/beta-access");
  vi.doMock("@/lib/auth/beta-access", () => betaAccessModule);

  return import("../lib/auth/permissions");
}

async function loadCheckPermissionModule(options: {
  user: { id: string; email?: string | null } | null;
  context?: { ageGroup: { id: string } | null; teamId: string | null };
  allowed?: boolean;
}) {
  clearDynamicMocks();
  vi.resetModules();

  const authGetUser = vi.fn().mockResolvedValue({
    data: { user: options.user },
  });
  const createClient = vi.fn(async () => ({
    auth: { getUser: authGetUser },
  }));
  const admin = { from: vi.fn() };
  const createAdminClient = vi.fn(() => admin);
  const resolveUserTeamContext = vi.fn().mockResolvedValue(
    options.context ?? {
      ageGroup: { id: "age-1" },
      teamId: "team-1",
    },
  );
  const hasPermission = vi
    .fn()
    .mockResolvedValue(options.allowed ?? true);

  vi.doMock("@/lib/supabase/server", () => ({ createClient }));
  vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient }));
  vi.doMock("@/lib/auth/team-context", () => ({
    resolveUserTeamContext,
  }));
  vi.doMock("@/lib/auth/permissions", () => ({
    hasPermission,
  }));

  const permissionModule = await import("../lib/auth/require-permission");

  return {
    ...permissionModule,
    admin,
    authGetUser,
    createAdminClient,
    createClient,
    hasPermission,
    resolveUserTeamContext,
  };
}

async function loadPermissionsRouteModule(options: {
  admin: ReturnType<typeof createMockAdmin>["admin"];
  user: { id: string; email?: string | null } | null;
  superCoordinatorEmail?: string;
}) {
  clearDynamicMocks();
  vi.resetModules();
  process.env.SUPER_COORDINATOR_EMAIL =
    options.superCoordinatorEmail ?? "master@example.com";

  const betaAccessModule = await import("../lib/auth/beta-access");
  const authGetUser = vi.fn().mockResolvedValue({
    data: { user: options.user },
  });
  const createClient = vi.fn(async () => ({
    auth: { getUser: authGetUser },
  }));
  const createAdminClient = vi.fn(() => options.admin);
  const respondInternalError = vi.fn((_scope: string, error: unknown) =>
    Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    ),
  );

  vi.doMock("@/lib/supabase/server", () => ({ createClient }));
  vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient }));
  vi.doMock("@/lib/auth/permissions", () => ({
    ALL_PERMISSION_AREAS,
    PERMISSION_TEMPLATES,
  }));
  vi.doMock("@/lib/auth/beta-access", () => betaAccessModule);
  vi.doMock("@/lib/http/respond-internal-error", () => ({
    respondInternalError,
  }));

  const routeModule = await import("../app/api/permissions/[staffId]/route");

  return {
    ...routeModule,
    authGetUser,
    createAdminClient,
    createClient,
    respondInternalError,
  };
}

afterEach(() => {
  clearDynamicMocks();
  vi.clearAllMocks();
  vi.resetModules();
});

afterAll(() => {
  if (ORIGINAL_SUPER_COORDINATOR_EMAIL === undefined) {
    delete process.env.SUPER_COORDINATOR_EMAIL;
    return;
  }

  process.env.SUPER_COORDINATOR_EMAIL = ORIGINAL_SUPER_COORDINATOR_EMAIL;
});

describe("ALL_PERMISSION_AREAS", () => {
  it("não contém áreas duplicadas", () => {
    expect(new Set(ALL_PERMISSION_AREAS).size).toBe(
      ALL_PERMISSION_AREAS.length,
    );
  });
});

describe("AREA_LABELS", () => {
  it("tem labels para todas as áreas", () => {
    expect(Object.keys(AREA_LABELS).sort()).toEqual(
      [...ALL_PERMISSION_AREAS].sort(),
    );
  });

  it("não contém labels para áreas extra", () => {
    ALL_PERMISSION_AREAS.forEach((area) => {
      expect(AREA_LABELS[area]).toBeTruthy();
    });
  });
});

describe("PERMISSION_TEMPLATES", () => {
  it("principal tem can_read em todas as áreas e RWED na maioria", () => {
    ALL_PERMISSION_AREAS.forEach((area) => {
      const perm = PERMISSION_TEMPLATES.principal[area];
      expect(perm.can_read).toBe(true);
    });
    // Áreas com acesso completo de escrita
    expect(PERMISSION_TEMPLATES.principal.trainings.can_write).toBe(true);
    expect(PERMISSION_TEMPLATES.principal.exercises.can_write).toBe(true);
    expect(PERMISSION_TEMPLATES.principal.games.can_delete).toBe(true);
    // Áreas restritas
    expect(PERMISSION_TEMPLATES.principal.statistics.can_write).toBe(false);
    expect(PERMISSION_TEMPLATES.principal.registrations.can_write).toBe(false);
  });

  it("adjunto tem RWE em trainings e attendance", () => {
    expect(PERMISSION_TEMPLATES.adjunto.trainings).toEqual({
      can_read: true,
      can_write: true,
      can_edit: true,
      can_delete: false,
    });
    expect(PERMISSION_TEMPLATES.adjunto.attendance).toEqual({
      can_read: true,
      can_write: true,
      can_edit: true,
      can_delete: false,
    });
  });

  it("adjunto tem RW em games", () => {
    expect(PERMISSION_TEMPLATES.adjunto.games).toEqual({
      can_read: true,
      can_write: true,
      can_edit: false,
      can_delete: false,
    });
  });

  it("adjunto tem apenas R em statistics, documents, registrations", () => {
    ["statistics", "documents", "registrations"].forEach((area) => {
      expect(
        PERMISSION_TEMPLATES.adjunto[
          area as "statistics" | "documents" | "registrations"
        ],
      ).toEqual({
        can_read: true,
        can_write: false,
        can_edit: false,
        can_delete: false,
      });
    });
  });

  it("estagiario tem RW apenas em attendance", () => {
    expect(PERMISSION_TEMPLATES.estagiario.attendance).toEqual({
      can_read: true,
      can_write: true,
      can_edit: false,
      can_delete: false,
    });
  });

  it("estagiario tem apenas R em todas as outras áreas", () => {
    ALL_PERMISSION_AREAS.filter((area) => area !== "attendance").forEach(
      (area) => {
        expect(PERMISSION_TEMPLATES.estagiario[area]).toEqual({
          can_read: true,
          can_write: false,
          can_edit: false,
          can_delete: false,
        });
      },
    );
  });

  it("todas as áreas de ALL_PERMISSION_AREAS estão cobertas em cada template", () => {
    Object.values(PERMISSION_TEMPLATES).forEach((template) => {
      expect(Object.keys(template).sort()).toEqual(
        [...ALL_PERMISSION_AREAS].sort(),
      );
    });
  });
});

describe("isMasterAdmin", () => {
  it("retorna true para SUPER_COORDINATOR_EMAIL", async () => {
    const { isMasterAdmin } = await loadPermissionsModule(
      "master@example.com",
    );

    expect(isMasterAdmin("master@example.com")).toBe(true);
  });

  it("retorna false para qualquer outro email", async () => {
    const { isMasterAdmin } = await loadPermissionsModule(
      "master@example.com",
    );

    expect(isMasterAdmin("other@example.com")).toBe(false);
  });

  it("retorna false para string vazia", async () => {
    const { isMasterAdmin } = await loadPermissionsModule(
      "master@example.com",
    );

    expect(isMasterAdmin("")).toBe(false);
  });

  it("é case-insensitive no comportamento actual", async () => {
    const { isMasterAdmin } = await loadPermissionsModule(
      "Master.Admin@Example.com",
    );

    expect(isMasterAdmin("MASTER.ADMIN@EXAMPLE.COM")).toBe(true);
  });
});

describe("isClubCoordinator", () => {
  it("retorna true quando o utilizador coordena o escalão", async () => {
    const { isClubCoordinator } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_groups: [{ id: "age-1", coordinator_id: "coord-1" }],
    });

    await expect(
      isClubCoordinator(admin as never, "coord-1", "age-1"),
    ).resolves.toBe(true);
  });

  it("retorna false quando o utilizador não coordena o escalão", async () => {
    const { isClubCoordinator } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_groups: [{ id: "age-1", coordinator_id: "coord-1" }],
    });

    await expect(
      isClubCoordinator(admin as never, "coord-2", "age-1"),
    ).resolves.toBe(false);
  });
});

describe("isPrincipalCoach", () => {
  it("retorna true quando o utilizador é treinador principal do escalão", async () => {
    const { isPrincipalCoach } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-1",
          age_group_id: "age-1",
          profile_id: "coach-1",
          role: "coach",
        },
      ],
    });

    await expect(
      isPrincipalCoach(admin as never, "coach-1", "age-1"),
    ).resolves.toBe(true);
  });

  it("retorna false para outro papel ou escalão", async () => {
    const { isPrincipalCoach } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-1",
          age_group_id: "age-1",
          profile_id: "coach-1",
          role: "assistant",
        },
      ],
    });

    await expect(
      isPrincipalCoach(admin as never, "coach-1", "age-1"),
    ).resolves.toBe(false);
  });
});

describe("hasPermission", () => {
  it("Master Admin tem permissão em qualquer área e operação", async () => {
    const { hasPermission } = await loadPermissionsModule(
      "master@example.com",
    );
    const { admin } = createMockAdmin();

    await expect(
      hasPermission(admin as never, {
        userId: "user-1",
        userEmail: "MASTER@EXAMPLE.COM",
        ageGroupId: "age-1",
        area: "documents",
        operation: "delete",
      }),
    ).resolves.toBe(true);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("Coordenador do Clube tem permissão em tudo no seu clube", async () => {
    const { hasPermission } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_groups: [{ id: "age-1", coordinator_id: "coord-1" }],
    });

    await expect(
      hasPermission(admin as never, {
        userId: "coord-1",
        userEmail: "coord@example.com",
        ageGroupId: "age-1",
        area: "players",
        operation: "delete",
      }),
    ).resolves.toBe(true);
  });

  it("Coordenador do Clube NÃO tem permissão de escrita noutro clube", async () => {
    const { hasPermission } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_groups: [{ id: "age-2", coordinator_id: "coord-2" }],
    });

    await expect(
      hasPermission(admin as never, {
        userId: "coord-1",
        userEmail: "coord@example.com",
        ageGroupId: "age-2",
        area: "players",
        operation: "write",
      }),
    ).resolves.toBe(false);
  });

  it("Treinador Principal com permissão na tabela pode executar operação", async () => {
    const { hasPermission } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-coach",
          age_group_id: "age-1",
          profile_id: "coach-1",
          role: "coach",
        },
      ],
      staff_permissions: [
        {
          staff_id: "staff-coach",
          area: "live_events",
          can_read: true,
          can_write: true,
          can_edit: true,
          can_delete: true,
        },
      ],
    });

    await expect(
      hasPermission(admin as never, {
        userId: "coach-1",
        userEmail: "coach@example.com",
        ageGroupId: "age-1",
        area: "live_events",
        operation: "delete",
      }),
    ).resolves.toBe(true);
  });

  it("Treinador Principal NÃO tem write noutro escalão", async () => {
    const { hasPermission } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-coach",
          age_group_id: "age-1",
          profile_id: "coach-1",
          role: "coach",
        },
      ],
    });

    await expect(
      hasPermission(admin as never, {
        userId: "coach-1",
        userEmail: "coach@example.com",
        ageGroupId: "age-2",
        area: "trainings",
        operation: "write",
      }),
    ).resolves.toBe(false);
  });

  it("Adjunto com permissão write em trainings pode escrever", async () => {
    const { hasPermission } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-adjunto",
          age_group_id: "age-1",
          profile_id: "adjunto-1",
          role: "assistant",
        },
      ],
      staff_permissions: [
        {
          staff_id: "staff-adjunto",
          area: "trainings",
          can_read: true,
          can_write: true,
          can_edit: true,
          can_delete: false,
        },
      ],
    });

    await expect(
      hasPermission(admin as never, {
        userId: "adjunto-1",
        userEmail: "adjunto@example.com",
        ageGroupId: "age-1",
        area: "trainings",
        operation: "write",
      }),
    ).resolves.toBe(true);
  });

  it("Adjunto sem permissão write em games NÃO pode escrever", async () => {
    const { hasPermission } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-adjunto",
          age_group_id: "age-1",
          profile_id: "adjunto-1",
          role: "assistant",
        },
      ],
      staff_permissions: [
        {
          staff_id: "staff-adjunto",
          area: "games",
          can_read: true,
          can_write: false,
          can_edit: false,
          can_delete: false,
        },
      ],
    });

    await expect(
      hasPermission(admin as never, {
        userId: "adjunto-1",
        userEmail: "adjunto@example.com",
        ageGroupId: "age-1",
        area: "games",
        operation: "write",
      }),
    ).resolves.toBe(false);
  });

  it("Adjunto pode ler qualquer área (read sempre true)", async () => {
    const { hasPermission } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-adjunto",
          age_group_id: "age-1",
          profile_id: "adjunto-1",
          role: "assistant",
        },
      ],
      staff_permissions: [
        {
          staff_id: "staff-adjunto",
          area: "documents",
          can_read: true,
          can_write: false,
          can_edit: false,
          can_delete: false,
        },
      ],
    });

    await expect(
      hasPermission(admin as never, {
        userId: "adjunto-1",
        userEmail: "adjunto@example.com",
        ageGroupId: "age-1",
        area: "documents",
        operation: "read",
      }),
    ).resolves.toBe(true);
  });

  it("Estagiário com apenas read NÃO pode write", async () => {
    const { hasPermission } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-estagiario",
          age_group_id: "age-1",
          profile_id: "intern-1",
          role: "intern",
        },
      ],
      staff_permissions: [
        {
          staff_id: "staff-estagiario",
          area: "players",
          can_read: true,
          can_write: false,
          can_edit: false,
          can_delete: false,
        },
      ],
    });

    await expect(
      hasPermission(admin as never, {
        userId: "intern-1",
        userEmail: "intern@example.com",
        ageGroupId: "age-1",
        area: "players",
        operation: "write",
      }),
    ).resolves.toBe(false);
  });

  it("User sem staff association não pode escrever", async () => {
    const { hasPermission } = await loadPermissionsModule();
    const { admin } = createMockAdmin({
      age_groups: [{ id: "age-1", coordinator_id: "coord-1" }],
    });

    await expect(
      hasPermission(admin as never, {
        userId: "user-without-staff",
        userEmail: "user@example.com",
        ageGroupId: "age-1",
        area: "attendance",
        operation: "write",
      }),
    ).resolves.toBe(false);
  });
});

describe("createPermissionsFromTemplate", () => {
  it("cria registos para todas as áreas do template principal", async () => {
    const { createPermissionsFromTemplate } = await loadPermissionsModule();
    const mockAdmin = createMockAdmin();

    await createPermissionsFromTemplate(
      mockAdmin.admin as never,
      "staff-principal",
      "principal",
    );

    expect(mockAdmin.getRows("staff_permissions")).toEqual(
      ALL_PERMISSION_AREAS.map((area) => ({
        staff_id: "staff-principal",
        area,
        ...PERMISSION_TEMPLATES.principal[area],
      })),
    );
  });

  it("cria registos para todas as áreas do template adjunto", async () => {
    const { createPermissionsFromTemplate } = await loadPermissionsModule();
    const mockAdmin = createMockAdmin();

    await createPermissionsFromTemplate(
      mockAdmin.admin as never,
      "staff-adjunto",
      "adjunto",
    );

    expect(mockAdmin.getRows("staff_permissions")).toEqual(
      ALL_PERMISSION_AREAS.map((area) => ({
        staff_id: "staff-adjunto",
        area,
        ...PERMISSION_TEMPLATES.adjunto[area],
      })),
    );
  });

  it("cria registos para todas as áreas do template estagiario", async () => {
    const { createPermissionsFromTemplate } = await loadPermissionsModule();
    const mockAdmin = createMockAdmin();

    await createPermissionsFromTemplate(
      mockAdmin.admin as never,
      "staff-estagiario",
      "estagiario",
    );

    expect(mockAdmin.getRows("staff_permissions")).toEqual(
      ALL_PERMISSION_AREAS.map((area) => ({
        staff_id: "staff-estagiario",
        area,
        ...PERMISSION_TEMPLATES.estagiario[area],
      })),
    );
  });

  it("upsert não duplica registos existentes", async () => {
    const { createPermissionsFromTemplate } = await loadPermissionsModule();
    const mockAdmin = createMockAdmin({
      staff_permissions: [
        {
          staff_id: "staff-estagiario",
          area: "attendance",
          can_read: false,
          can_write: false,
          can_edit: false,
          can_delete: false,
        },
      ],
    });

    await createPermissionsFromTemplate(
      mockAdmin.admin as never,
      "staff-estagiario",
      "estagiario",
    );

    expect(mockAdmin.getRows("staff_permissions")).toHaveLength(
      ALL_PERMISSION_AREAS.length,
    );
    expect(
      mockAdmin.getRows("staff_permissions").find((row) => row.area === "attendance"),
    ).toEqual({
      staff_id: "staff-estagiario",
      area: "attendance",
      ...PERMISSION_TEMPLATES.estagiario.attendance,
    });
  });
});

describe("checkPermission", () => {
  it("retorna allowed:true para user com permissão", async () => {
    const { checkPermission, hasPermission } = await loadCheckPermissionModule({
      user: { id: "user-1", email: "user@example.com" },
      allowed: true,
    });

    await expect(
      checkPermission("players", "write"),
    ).resolves.toMatchObject({
      allowed: true,
      userId: "user-1",
      ageGroupId: "age-1",
      teamId: "team-1",
    });
    expect(hasPermission).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        userEmail: "user@example.com",
        area: "players",
        operation: "write",
      }),
    );
  });

  it("retorna allowed:false com response 403 para user sem permissão", async () => {
    const { checkPermission } = await loadCheckPermissionModule({
      user: { id: "user-1", email: "user@example.com" },
      allowed: false,
    });

    const result = await checkPermission("players", "delete");

    expect(result.allowed).toBe(false);
    if (result.allowed) {
      throw new Error("Esperava um resultado de falha.");
    }

    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toEqual({
      error: "Sem permissão para esta operação",
    });
  });

  it("retorna allowed:false com response 401 para user não autenticado", async () => {
    const { checkPermission, createAdminClient } =
      await loadCheckPermissionModule({
        user: null,
      });

    const result = await checkPermission("players", "read");

    expect(result.allowed).toBe(false);
    if (result.allowed) {
      throw new Error("Esperava um resultado de falha.");
    }

    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({
      error: "Não autenticado",
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe("GET /api/permissions/[staffId]", () => {
  it("retorna permissões do staff member", async () => {
    const mockAdmin = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-1",
          age_group_id: "age-1",
          profile_id: "adjunto-1",
          role: "assistant",
          club_id: "club-1",
        },
      ],
      age_groups: [{ id: "age-1", coordinator_id: "coord-1" }],
      staff_permissions: [
        {
          staff_id: "staff-1",
          area: "trainings",
          can_read: true,
          can_write: true,
          can_edit: true,
          can_delete: false,
        },
        {
          staff_id: "staff-1",
          area: "documents",
          can_read: true,
          can_write: false,
          can_edit: false,
          can_delete: false,
        },
      ],
    });
    const { GET } = await loadPermissionsRouteModule({
      admin: mockAdmin.admin,
      user: { id: "coord-1", email: "coord@example.com" },
    });

    const response = await GET(new Request("http://localhost/api/permissions"), {
      params: Promise.resolve({ staffId: "staff-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      permissions: mockAdmin.getRows("staff_permissions"),
      staffRecord: {
        id: "staff-1",
        age_group_id: "age-1",
        profile_id: "adjunto-1",
        role: "assistant",
        club_id: "club-1",
      },
      canManage: true,
    });
  });

  it("retorna 403 se caller não é coordenador do clube", async () => {
    const mockAdmin = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-1",
          age_group_id: "age-1",
          profile_id: "adjunto-1",
          role: "assistant",
          club_id: "club-1",
        },
      ],
      age_groups: [{ id: "age-1", coordinator_id: "coord-1" }],
    });
    const { GET } = await loadPermissionsRouteModule({
      admin: mockAdmin.admin,
      user: { id: "outsider-1", email: "outsider@example.com" },
    });

    const response = await GET(new Request("http://localhost/api/permissions"), {
      params: Promise.resolve({ staffId: "staff-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Sem permissão",
    });
  });

  it("retorna 404 se staffId não existe", async () => {
    const mockAdmin = createMockAdmin();
    const { GET } = await loadPermissionsRouteModule({
      admin: mockAdmin.admin,
      user: { id: "coord-1", email: "coord@example.com" },
    });

    const response = await GET(new Request("http://localhost/api/permissions"), {
      params: Promise.resolve({ staffId: "missing-staff" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Membro não encontrado",
    });
  });
});

describe("PUT /api/permissions/[staffId]", () => {
  it("actualiza permissões com array de permissões", async () => {
    const mockAdmin = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-1",
          age_group_id: "age-1",
          profile_id: "adjunto-1",
          role: "assistant",
          club_id: "club-1",
        },
      ],
      age_groups: [{ id: "age-1", coordinator_id: "coord-1" }],
    });
    const { PUT } = await loadPermissionsRouteModule({
      admin: mockAdmin.admin,
      user: { id: "coord-1", email: "coord@example.com" },
    });

    const permissions = [
      {
        area: "trainings",
        can_read: true,
        can_write: true,
        can_edit: true,
        can_delete: false,
      },
      {
        area: "documents",
        can_read: true,
        can_write: false,
        can_edit: false,
        can_delete: false,
      },
    ];

    const response = await PUT(
      new Request("http://localhost/api/permissions/staff-1", {
        method: "PUT",
        body: JSON.stringify({ permissions }),
      }),
      {
        params: Promise.resolve({ staffId: "staff-1" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockAdmin.getRows("staff_permissions")).toEqual(
      permissions.map((permission) => ({
        staff_id: "staff-1",
        ...permission,
      })),
    );
  });

  it("aplica template por nome", async () => {
    const mockAdmin = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-1",
          age_group_id: "age-1",
          profile_id: "adjunto-1",
          role: "assistant",
          club_id: "club-1",
        },
      ],
      age_groups: [{ id: "age-1", coordinator_id: "coord-1" }],
    });
    const { PUT } = await loadPermissionsRouteModule({
      admin: mockAdmin.admin,
      user: { id: "coord-1", email: "coord@example.com" },
    });

    const response = await PUT(
      new Request("http://localhost/api/permissions/staff-1", {
        method: "PUT",
        body: JSON.stringify({ template: "adjunto" }),
      }),
      {
        params: Promise.resolve({ staffId: "staff-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(mockAdmin.getRows("staff_permissions")).toEqual(
      ALL_PERMISSION_AREAS.map((area) => ({
        staff_id: "staff-1",
        area,
        ...PERMISSION_TEMPLATES.adjunto[area],
      })),
    );
  });

  it("retorna 403 se caller não é coordenador", async () => {
    const mockAdmin = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-1",
          age_group_id: "age-1",
          profile_id: "adjunto-1",
          role: "assistant",
          club_id: "club-1",
        },
      ],
      age_groups: [{ id: "age-1", coordinator_id: "coord-1" }],
    });
    const { PUT } = await loadPermissionsRouteModule({
      admin: mockAdmin.admin,
      user: { id: "outsider-1", email: "outsider@example.com" },
    });

    const response = await PUT(
      new Request("http://localhost/api/permissions/staff-1", {
        method: "PUT",
        body: JSON.stringify({ template: "adjunto" }),
      }),
      {
        params: Promise.resolve({ staffId: "staff-1" }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Sem permissão",
    });
  });

  it("permite alterar permissões de treinador principal (sem RWED fixo)", async () => {
    const mockAdmin = createMockAdmin({
      age_group_staff: [
        {
          id: "staff-coach",
          age_group_id: "age-1",
          profile_id: "coach-1",
          role: "coach",
          club_id: "club-1",
        },
      ],
      age_groups: [{ id: "age-1", coordinator_id: "coord-1" }],
    });
    const { PUT } = await loadPermissionsRouteModule({
      admin: mockAdmin.admin,
      user: { id: "coord-1", email: "coord@example.com" },
    });

    const response = await PUT(
      new Request("http://localhost/api/permissions/staff-coach", {
        method: "PUT",
        body: JSON.stringify({ template: "principal" }),
      }),
      {
        params: Promise.resolve({ staffId: "staff-coach" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
  });
});
