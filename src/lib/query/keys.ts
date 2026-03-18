export const queryKeys = {
  meContext: () => ["me-context"] as const,
  players: () => ["players"] as const,
  attendance: {
    root: () => ["attendance"] as const,
    today: (date: string) => ["attendance", "today", date] as const,
  },
  statistics: {
    root: () => ["statistics"] as const,
    players: (ageGroupId: string) =>
      ["statistics", "players", ageGroupId] as const,
    attendanceDaily: (ageGroupId: string) =>
      ["statistics", "attendance-daily", ageGroupId] as const,
  },
  join: {
    status: (code: string | null) => ["join", "status", code ?? ""] as const,
  },
};
