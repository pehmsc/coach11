function toUtcDate(sessionDate: Date | string) {
  if (sessionDate instanceof Date) {
    return new Date(
      Date.UTC(
        sessionDate.getUTCFullYear(),
        sessionDate.getUTCMonth(),
        sessionDate.getUTCDate(),
      ),
    );
  }

  const [year, month, day] = sessionDate.split("-").map((value) => Number(value));
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getWeekStartDate(sessionDate: Date) {
  const date = toUtcDate(sessionDate);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

export function formatUtNumber(utNumber: number) {
  return `UT${String(utNumber).padStart(2, "0")}`;
}

export type WeeklyDuplicationSourceSession = {
  clubId: string;
  ageGroupId: string;
  teamId: string;
  sessionDate: string;
  startTime: string;
  endTime?: string | null;
  location?: string | null;
  focus?: string | null;
  intensity?: string | null;
  objective?: string | null;
  material?: string | null;
  fieldArea?: string | null;
  notes?: string | null;
};

export type WeeklyDuplicatedTrainingInsert = {
  club_id: string;
  age_group_id: string;
  team_id: string;
  session_date: string;
  week_start_date: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  ut_number: number;
  title: string;
  status: "scheduled";
  focus: string | null;
  intensity: string | null;
  objective: string | null;
  material: string | null;
  field_area: string | null;
  notes: null;
};

export function duplicateTrainingWeek(input: {
  sourceSessions: WeeklyDuplicationSourceSession[];
  numberOfWeeks: number;
  startingUtNumber: number;
}) {
  if (!Number.isInteger(input.numberOfWeeks) || input.numberOfWeeks < 1) {
    throw new Error("numberOfWeeks must be a positive integer");
  }

  if (!Number.isInteger(input.startingUtNumber) || input.startingUtNumber < 1) {
    throw new Error("startingUtNumber must be a positive integer");
  }

  const sourceSessions = [...input.sourceSessions].sort((left, right) => {
    const dateCompare = left.sessionDate.localeCompare(right.sessionDate);
    if (dateCompare !== 0) return dateCompare;
    return left.startTime.localeCompare(right.startTime);
  });

  let nextUtNumber = input.startingUtNumber;
  const createdSessions: WeeklyDuplicatedTrainingInsert[] = [];

  for (let weekIndex = 1; weekIndex <= input.numberOfWeeks; weekIndex += 1) {
    for (const session of sourceSessions) {
      const duplicatedDate = addDays(toUtcDate(session.sessionDate), weekIndex * 7);
      const utNumber = nextUtNumber;
      nextUtNumber += 1;

      createdSessions.push({
        club_id: session.clubId,
        age_group_id: session.ageGroupId,
        team_id: session.teamId,
        session_date: toIsoDate(duplicatedDate),
        week_start_date: toIsoDate(getWeekStartDate(duplicatedDate)),
        start_time: session.startTime,
        end_time: session.endTime ?? null,
        location: session.location ?? null,
        ut_number: utNumber,
        title: formatUtNumber(utNumber),
        status: "scheduled",
        focus: session.focus ?? null,
        intensity: session.intensity ?? null,
        objective: session.objective ?? null,
        material: session.material ?? null,
        field_area: session.fieldArea ?? null,
        notes: null,
      });
    }
  }

  return {
    createdSessions,
    utRange: {
      from: input.startingUtNumber,
      to: createdSessions.length > 0 ? nextUtNumber - 1 : input.startingUtNumber,
    },
  };
}
