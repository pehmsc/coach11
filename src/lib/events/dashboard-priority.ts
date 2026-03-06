import {
  getPresencePromptState,
  type PresencePromptState,
} from "./presence-window";

export const DASHBOARD_PRIORITY_WINDOW_SIZE = 5;
export const DASHBOARD_CONVOCATION_PRIORITY_HOURS = 48;

type DashboardWindowEvent = {
  sortTs: number;
  isPriority?: boolean;
};

type TrainingDashboardPriorityState = {
  isPriority: boolean;
  presencePromptState: PresencePromptState;
  presenceCtaMode?: "mark" | "close";
};

type GameDashboardPriorityState = {
  isPriority: boolean;
  needsConvocation: boolean;
  convocationCtaMode?: "upcoming" | "overdue";
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getDashboardPriorityWindowStartIndex(
  events: DashboardWindowEvent[],
  anchorTs: number,
  windowSize = DASHBOARD_PRIORITY_WINDOW_SIZE,
) {
  const maxStart = Math.max(0, events.length - windowSize);
  const firstPriorityIndex = events.findIndex((event) => event.isPriority);

  if (firstPriorityIndex !== -1) {
    return clamp(firstPriorityIndex, 0, maxStart);
  }

  const nextUpcomingIndex = events.findIndex((event) => event.sortTs >= anchorTs);
  if (nextUpcomingIndex === -1) {
    return 0;
  }

  return clamp(nextUpcomingIndex, 0, maxStart);
}

export function getTrainingDashboardPriorityState(
  dateValue: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  status: string | null | undefined,
  now = new Date(),
): TrainingDashboardPriorityState {
  const presencePromptState = getPresencePromptState(
    dateValue,
    startTime,
    endTime,
    status,
    now,
  );

  if (presencePromptState === "mark") {
    return {
      isPriority: true,
      presencePromptState,
      presenceCtaMode: "mark",
    };
  }

  if (presencePromptState === "close") {
    return {
      isPriority: true,
      presencePromptState,
      presenceCtaMode: "close",
    };
  }

  return {
    isPriority: false,
    presencePromptState,
  };
}

export function getGameDashboardPriorityState(
  gameDateTime: string | null | undefined,
  status: string | null | undefined,
  hasConvocation: boolean,
  now = new Date(),
): GameDashboardPriorityState {
  if (!gameDateTime || hasConvocation || status === "completed" || status === "cancelled") {
    return {
      isPriority: false,
      needsConvocation: false,
    };
  }

  const gameStartTs = Date.parse(gameDateTime);
  if (Number.isNaN(gameStartTs)) {
    return {
      isPriority: false,
      needsConvocation: false,
    };
  }

  const priorityStartsAtTs =
    gameStartTs - DASHBOARD_CONVOCATION_PRIORITY_HOURS * 60 * 60 * 1000;
  const nowTs = now.getTime();

  if (nowTs < priorityStartsAtTs) {
    return {
      isPriority: false,
      needsConvocation: false,
    };
  }

  return {
    isPriority: true,
    needsConvocation: true,
    convocationCtaMode: nowTs > gameStartTs ? "overdue" : "upcoming",
  };
}
