import { describe, expect, it } from "vitest";
import {
  formatUtLabel,
  getTrainingDisplayTitle,
  getWeekStartDate,
  parseUtNumberInput,
  toIsoDate,
} from "./ut-numbering";
import { buildWeeklyDuplicatedTrainings } from "./weekly-duplication";

describe("training ut numbering helpers", () => {
  it("formats ut labels with leading zeroes", () => {
    expect(formatUtLabel(1)).toBe("UT01");
    expect(formatUtLabel(12)).toBe("UT12");
    expect(formatUtLabel(null)).toBeNull();
  });

  it("builds the display title without duplicating the ut label", () => {
    expect(getTrainingDisplayTitle({ ut_number: 4, title: "Treino ofensivo" })).toBe(
      "UT04 Treino ofensivo",
    );
    expect(getTrainingDisplayTitle({ ut_number: 4, title: "UT04" })).toBe("UT04");
    expect(getTrainingDisplayTitle({ title: "Treino" })).toBe("Treino");
  });

  it("parses ut input safely", () => {
    expect(parseUtNumberInput("7")).toBe(7);
    expect(parseUtNumberInput("")).toBeNull();
    expect(parseUtNumberInput("0")).toBeNull();
    expect(parseUtNumberInput("abc")).toBeNull();
  });

  it("computes the monday of the training week", () => {
    expect(toIsoDate(getWeekStartDate(new Date("2026-01-07T12:00:00Z")))).toBe("2026-01-05");
    expect(toIsoDate(getWeekStartDate(new Date("2026-01-11T12:00:00Z")))).toBe("2026-01-05");
  });
});

describe("buildWeeklyDuplicatedTrainings", () => {
  it("duplicates multiple weeks and auto-increments ut numbers", () => {
    const result = buildWeeklyDuplicatedTrainings({
      numberOfWeeks: 2,
      nextUtNumber: 4,
      sourceSessions: [
        {
          age_group_id: "age-group-1",
          team_id: "team-1",
          session_date: "2026-01-05",
          start_time: "18:30",
          end_time: "20:00",
          location: "Campo 1",
          objective: "Posse",
          focus: "tactical",
          intensity: "medium",
          material: "Bolas",
          field_area: "Meio-campo",
        },
        {
          age_group_id: "age-group-1",
          team_id: "team-1",
          session_date: "2026-01-07",
          start_time: "18:30",
          end_time: "20:00",
          location: "Campo 1",
        },
      ],
    });

    expect(result.created).toBe(4);
    expect(result.utRange).toEqual({ from: 4, to: 7 });
    expect(result.firstSessionDate).toBe("2026-01-12");
    expect(result.lastSessionDate).toBe("2026-01-21");
    expect(result.sessions.map((session) => session.ut_number)).toEqual([4, 5, 6, 7]);
    expect(result.sessions.map((session) => session.title)).toEqual([
      "UT04",
      "UT05",
      "UT06",
      "UT07",
    ]);
    expect(result.sessions[0]?.week_start_date).toBe("2026-01-12");
    expect(result.sessions[0]?.notes).toBeNull();
    expect(result.sessions[0]?.objective).toBe("Posse");
  });
});
