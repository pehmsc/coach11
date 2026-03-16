import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EXERCISE_CATEGORIES,
  MAX_EXERCISE_IMAGE_BYTES,
  createExerciseSchema,
  resolveExerciseImageExtension,
  validateExerciseImageUpload,
} from "../lib/exercises/shared";
import { getNextUtNumber, getWeekStartDate, formatUtLabel } from "../lib/trainings/ut-numbering";
import {
  buildWeeklyDuplicatedTrainings,
  type WeeklyDuplicationSourceSession,
  type WeeklyDuplicatedTrainingInsert,
} from "../lib/trainings/weekly-duplication";

const categoryLabelsSource = readFileSync(
  new URL("../components/exercises/category-labels.ts", import.meta.url),
  "utf8",
);

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function extractCategoryLabelKeys() {
  return Array.from(categoryLabelsSource.matchAll(/^\s*([a-z_]+):\s*"/gm)).map(
    (match) => match[1],
  );
}

function createSupabaseMock(result: { ut_number: number | null } | null) {
  const builder = {
    select: vi.fn(() => builder),
    filter: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
  };

  return {
    builder,
    supabase: {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient,
  };
}

function buildSourceWeek(): WeeklyDuplicationSourceSession[] {
  return [
    {
      age_group_id: "age-1",
      team_id: "team-1",
      session_date: "2026-01-05",
      start_time: "18:30",
      end_time: "20:00",
      location: "Campo A",
      focus: "technical",
      intensity: "high",
      objective: "Saida de bola",
      material: "Bolas",
      field_area: "Meio campo",
    },
    {
      age_group_id: "age-1",
      team_id: "team-1",
      session_date: "2026-01-07",
      start_time: "18:30",
      end_time: "20:00",
      location: "Campo A",
      focus: "tactical",
      intensity: "medium",
      objective: "Pressao",
      material: "Coletes",
      field_area: "2/3 campo",
    },
    {
      age_group_id: "age-1",
      team_id: "team-1",
      session_date: "2026-01-09",
      start_time: "18:30",
      end_time: "20:00",
      location: "Campo B",
      focus: "finishing",
      intensity: "high",
      objective: "Finalizacao",
      material: "Balizas",
      field_area: "Ultimo terco",
    },
  ];
}

describe("Exercise Library", () => {
  it("exercise categories sao 13 no total", () => {
    expect(EXERCISE_CATEGORIES).toHaveLength(13);
  });

  it("category labels cobrem todas as categorias", () => {
    expect(extractCategoryLabelKeys().sort()).toEqual([...EXERCISE_CATEGORIES].sort());
  });

  it("category labels exportam CATEGORY_OPTIONS a partir das labels", () => {
    expect(categoryLabelsSource).toContain(
      "export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS)",
    );
  });

  it("exercise form valida nome obrigatorio", () => {
    const parsed = createExerciseSchema.safeParse({
      name: "",
      category: "technical",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.flatten().fieldErrors.name).toContain("Nome é obrigatório");
  });

  it("exercise form valida categoria obrigatoria", () => {
    const parsed = createExerciseSchema.safeParse({
      name: "Rondo",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.flatten().fieldErrors.category).toBeTruthy();
  });

  it("exercise form aceita payload minimo valido", () => {
    const parsed = createExerciseSchema.safeParse({
      name: "Finalizacao 3x2",
      category: "finishing",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error("Expected createExerciseSchema to accept a valid payload");
    }
    expect(parsed.data.rest_minutes).toBe(0);
  });

  it("upload aceita jpg", () => {
    expect(
      validateExerciseImageUpload({
        fileName: "exercicio.jpg",
        mimeType: "image/jpeg",
        size: 1024,
      }),
    ).toMatchObject({
      ok: true,
      extension: "jpg",
      contentType: "image/jpeg",
    });
  });

  it("upload aceita png por extensao quando o mime nao vem preenchido", () => {
    expect(
      validateExerciseImageUpload({
        fileName: "diagrama.png",
        size: 1024,
      }),
    ).toMatchObject({
      ok: true,
      extension: "png",
      contentType: "image/png",
    });
  });

  it("upload aceita webp", () => {
    expect(
      validateExerciseImageUpload({
        fileName: "diagrama.webp",
        mimeType: "image/webp",
        size: 1024,
      }),
    ).toMatchObject({
      ok: true,
      extension: "webp",
      contentType: "image/webp",
    });
  });

  it("upload rejeita ficheiros fora de jpg png webp", () => {
    expect(
      validateExerciseImageUpload({
        fileName: "diagrama.svg",
        mimeType: "image/svg+xml",
        size: 1024,
      }),
    ).toEqual({
      ok: false,
      error: "invalid_type",
    });
  });

  it("upload rejeita ficheiros acima de 5MB", () => {
    expect(
      validateExerciseImageUpload({
        fileName: "diagrama.png",
        mimeType: "image/png",
        size: MAX_EXERCISE_IMAGE_BYTES + 1,
      }),
    ).toEqual({
      ok: false,
      error: "too_large",
    });
  });

  it("resolveExerciseImageExtension normaliza jpeg para jpg", () => {
    expect(resolveExerciseImageExtension("diagrama.jpeg")).toBe("jpg");
  });
});

describe("Weekly Duplication", () => {
  it("formatUtLabel retorna null para valores invalidos", () => {
    expect(formatUtLabel(null)).toBe(null);
    expect(formatUtLabel(undefined)).toBe(null);
    expect(formatUtLabel(0)).toBe(null);
  });

  it("formatUtLabel formata com zero padding", () => {
    expect(formatUtLabel(1)).toBe("UT01");
    expect(formatUtLabel(12)).toBe("UT12");
    expect(formatUtLabel(100)).toBe("UT100");
  });

  it("getNextUtNumber retorna 1 quando nao existem treinos", async () => {
    const mock = createSupabaseMock(null);

    await expect(getNextUtNumber(mock.supabase, "club-1", "age-1")).resolves.toBe(1);
    expect(mock.builder.filter).toHaveBeenCalledWith("club_id", "eq", "club-1");
    expect(mock.builder.eq).toHaveBeenCalledWith("age_group_id", "age-1");
  });

  it("getNextUtNumber retorna max+1 quando existem treinos", async () => {
    const mock = createSupabaseMock({ ut_number: 9 });

    await expect(getNextUtNumber(mock.supabase, "club-1", "age-1")).resolves.toBe(10);
  });

  it("getWeekStartDate retorna segunda-feira para segunda", () => {
    expect(formatDate(getWeekStartDate(new Date("2026-01-05T12:00:00Z")))).toBe("2026-01-05");
  });

  it("getWeekStartDate retorna segunda-feira para quarta", () => {
    expect(formatDate(getWeekStartDate(new Date("2026-01-07T12:00:00Z")))).toBe("2026-01-05");
  });

  it("getWeekStartDate para domingo retorna segunda anterior", () => {
    expect(formatDate(getWeekStartDate(new Date("2026-01-11T12:00:00Z")))).toBe("2026-01-05");
  });

  it("duplicacao cria N por M treinos", () => {
    const result = buildWeeklyDuplicatedTrainings({
      sourceSessions: buildSourceWeek(),
      numberOfWeeks: 4,
      nextUtNumber: 4,
    });

    expect(result.sessions).toHaveLength(12);
    expect(result.utRange).toEqual({ from: 4, to: 15 });
  });

  it("ut_numbers sao sequenciais apos duplicacao", () => {
    const result = buildWeeklyDuplicatedTrainings({
      sourceSessions: buildSourceWeek(),
      numberOfWeeks: 2,
      nextUtNumber: 4,
    });

    expect(result.sessions.map((session: WeeklyDuplicatedTrainingInsert) => session.ut_number)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(result.sessions.map((session: WeeklyDuplicatedTrainingInsert) => session.title)).toEqual([
      "UT04",
      "UT05",
      "UT06",
      "UT07",
      "UT08",
      "UT09",
    ]);
  });

  it("datas duplicadas caem nos dias corretos da semana", () => {
    const result = buildWeeklyDuplicatedTrainings({
      sourceSessions: buildSourceWeek(),
      numberOfWeeks: 2,
      nextUtNumber: 4,
    });

    expect(result.sessions.map((session: WeeklyDuplicatedTrainingInsert) => session.session_date)).toEqual([
      "2026-01-12",
      "2026-01-14",
      "2026-01-16",
      "2026-01-19",
      "2026-01-21",
      "2026-01-23",
    ]);
  });

  it("week_start_date e recalculado para cada sessao duplicada", () => {
    const result = buildWeeklyDuplicatedTrainings({
      sourceSessions: buildSourceWeek(),
      numberOfWeeks: 2,
      nextUtNumber: 4,
    });

    expect(result.sessions.map((session: WeeklyDuplicatedTrainingInsert) => session.week_start_date)).toEqual([
      "2026-01-12",
      "2026-01-12",
      "2026-01-12",
      "2026-01-19",
      "2026-01-19",
      "2026-01-19",
    ]);
  });

  it("duplicacao copia metadados relevantes e limpa notes", () => {
    const result = buildWeeklyDuplicatedTrainings({
      sourceSessions: buildSourceWeek(),
      numberOfWeeks: 1,
      nextUtNumber: 4,
    });

    expect(result.sessions[0]).toMatchObject({
      age_group_id: "age-1",
      team_id: "team-1",
      start_time: "18:30",
      end_time: "20:00",
      location: "Campo A",
      focus: "technical",
      intensity: "high",
      objective: "Saida de bola",
      material: "Bolas",
      field_area: "Meio campo",
      status: "scheduled",
      notes: null,
    });
  });

  it("formatUtLabel cria o prefixo UT com zero padding", () => {
    expect(formatUtLabel(4)).toBe("UT04");
    expect(formatUtLabel(15)).toBe("UT15");
  });
});
