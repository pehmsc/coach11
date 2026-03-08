import "server-only";

import { unstable_noStore as noStore } from "next/cache";

export const POSTHOG_ADMIN_METRICS_PERIOD_DAYS = 7;
const TREND_SERIES_DAYS = 14;

type PostHogDailyRow = {
  date: string;
  value: number;
};

export type AdminMetricCardData = {
  headlineValue: number;
  comparisonValue: number;
  delta: number | null;
  series: PostHogDailyRow[];
};

export type AdminObservabilityMetrics =
  | {
      configured: true;
      periodDays: number;
      dau: AdminMetricCardData;
      convocationCreated: AdminMetricCardData;
      attendanceMarked: AdminMetricCardData;
    }
  | {
      configured: false;
      reason: "missing_config" | "query_failed";
      periodDays: number;
      message: string;
      missingKeys?: string[];
    };

function getPostHogApiHost() {
  const explicitHost = process.env.POSTHOG_API_HOST?.trim();
  if (explicitHost) {
    return explicitHost.replace(/\/+$/, "");
  }

  const ingestHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  if (!ingestHost) return null;

  try {
    const parsed = new URL(ingestHost);
    if (parsed.hostname === "eu.i.posthog.com") {
      return "https://eu.posthog.com";
    }
    if (parsed.hostname === "us.i.posthog.com") {
      return "https://us.posthog.com";
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function getPostHogQueryConfig() {
  const apiHost = getPostHogApiHost();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim() || null;
  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim() || null;
  const missingKeys = [
    ...(apiHost ? [] : ["POSTHOG_API_HOST (ou NEXT_PUBLIC_POSTHOG_HOST)"]),
    ...(projectId ? [] : ["POSTHOG_PROJECT_ID"]),
    ...(personalApiKey ? [] : ["POSTHOG_PERSONAL_API_KEY"]),
  ];

  if (missingKeys.length > 0) {
    return {
      configured: false as const,
      missingKeys,
    };
  }

  return {
    configured: true as const,
    apiHost,
    projectId,
    personalApiKey,
  };
}

function toDayString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDaySeries(days: number) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (days - 1 - index));
    return toDayString(day);
  });
}

function parseNumericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parsePostHogRows(payload: unknown): PostHogDailyRow[] {
  if (!payload || typeof payload !== "object") return [];

  const row = payload as {
    results?: unknown;
    columns?: unknown;
  };
  const results = Array.isArray(row.results) ? row.results : [];
  const columns = Array.isArray(row.columns) ? row.columns : [];

  if (results.length === 0) return [];

  if (Array.isArray(results[0])) {
    const dateIndex = columns.findIndex((value) => value === "date");
    const valueIndex = columns.findIndex((value) => value === "value");

    return results
      .map((entry) => {
        if (!Array.isArray(entry)) return null;

        const date =
          typeof entry[dateIndex] === "string" ? entry[dateIndex] : null;
        if (!date) return null;

        return {
          date,
          value: parseNumericValue(entry[valueIndex]),
        };
      })
      .filter((entry): entry is PostHogDailyRow => !!entry);
  }

  return results
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;

      const value = entry as Record<string, unknown>;
      const date = typeof value.date === "string" ? value.date : null;
      if (!date) return null;

      return {
        date,
        value: parseNumericValue(value.value),
      };
    })
    .filter((entry): entry is PostHogDailyRow => !!entry);
}

function fillMissingDays(rows: PostHogDailyRow[], days: number) {
  const valuesByDay = new Map(rows.map((row) => [row.date, row.value]));

  return buildDaySeries(days).map((date) => ({
    date,
    value: valuesByDay.get(date) ?? 0,
  }));
}

function sumValues(rows: PostHogDailyRow[]) {
  return rows.reduce((total, row) => total + row.value, 0);
}

function computeDelta(currentValue: number, previousValue: number) {
  if (previousValue === 0) {
    if (currentValue === 0) return 0;
    return null;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}

function buildRollingMetric(rows: PostHogDailyRow[], periodDays: number): AdminMetricCardData {
  const currentSlice = rows.slice(-periodDays);
  const previousSlice = rows.slice(-(periodDays * 2), -periodDays);
  const headlineValue = sumValues(currentSlice);
  const comparisonValue = sumValues(previousSlice);

  return {
    headlineValue,
    comparisonValue,
    delta: computeDelta(headlineValue, comparisonValue),
    series: rows,
  };
}

function buildDauMetric(rows: PostHogDailyRow[]): AdminMetricCardData {
  const today = rows.at(-1)?.value ?? 0;
  const yesterday = rows.at(-2)?.value ?? 0;

  return {
    headlineValue: today,
    comparisonValue: yesterday,
    delta: computeDelta(today, yesterday),
    series: rows,
  };
}

async function runPostHogDailyQuery(query: string) {
  const config = getPostHogQueryConfig();
  if (!config) {
    throw new Error("posthog_metrics_missing_config");
  }

  const response = await fetch(
    `${config.apiHost}/api/projects/${config.projectId}/query/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.personalApiKey}`,
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query,
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`posthog_query_failed:${response.status}:${body}`);
  }

  return response.json();
}

function buildDauQuery(windowStartIso: string) {
  return `
    SELECT
      toString(toDate(timestamp)) AS date,
      uniq(distinct_id) AS value
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= toDateTime('${windowStartIso}')
      AND properties.area = 'dashboard'
    GROUP BY date
    ORDER BY date ASC
  `;
}

function buildEventCountQuery(eventName: string, windowStartIso: string) {
  return `
    SELECT
      toString(toDate(timestamp)) AS date,
      count() AS value
    FROM events
    WHERE event = '${eventName}'
      AND timestamp >= toDateTime('${windowStartIso}')
    GROUP BY date
    ORDER BY date ASC
  `;
}

export async function getAdminObservabilityMetrics(
  periodDays = POSTHOG_ADMIN_METRICS_PERIOD_DAYS,
): Promise<AdminObservabilityMetrics> {
  noStore();

  const config = getPostHogQueryConfig();
  if (!config.configured) {
    return {
      configured: false,
      reason: "missing_config",
      periodDays,
      message: `Faltam variáveis no runtime: ${config.missingKeys.join(", ")}.`,
      missingKeys: config.missingKeys,
    };
  }

  const queryStart = new Date();
  queryStart.setUTCHours(0, 0, 0, 0);
  queryStart.setUTCDate(queryStart.getUTCDate() - (TREND_SERIES_DAYS - 1));
  const windowStartIso = queryStart.toISOString();

  try {
    const [dauResult, convocationResult, attendanceResult] = await Promise.all([
      runPostHogDailyQuery(buildDauQuery(windowStartIso)),
      runPostHogDailyQuery(buildEventCountQuery("convocation_created", windowStartIso)),
      runPostHogDailyQuery(buildEventCountQuery("attendance_marked", windowStartIso)),
    ]);

    const dauSeries = fillMissingDays(parsePostHogRows(dauResult), TREND_SERIES_DAYS);
    const convocationSeries = fillMissingDays(
      parsePostHogRows(convocationResult),
      TREND_SERIES_DAYS,
    );
    const attendanceSeries = fillMissingDays(
      parsePostHogRows(attendanceResult),
      TREND_SERIES_DAYS,
    );

    return {
      configured: true,
      periodDays,
      dau: buildDauMetric(dauSeries),
      convocationCreated: buildRollingMetric(convocationSeries, periodDays),
      attendanceMarked: buildRollingMetric(attendanceSeries, periodDays),
    };
  } catch (error) {
    console.error("[posthog.admin.metrics]", error);
    return {
      configured: false,
      reason: "query_failed",
      periodDays,
      message:
        "Não foi possível consultar o PostHog neste momento. Confirma o POSTHOG_PROJECT_ID, a Personal API Key e faz redeploy se alteraste envs no Vercel.",
    };
  }
}
