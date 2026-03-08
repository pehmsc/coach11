import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

type InternalErrorContext = {
  request?: Request;
  userId?: string | null;
  ageGroupId?: string | null;
  teamId?: string | null;
  gameId?: string | null;
  extra?: Record<string, unknown>;
};

function sanitizeErrorForLog(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (!error || typeof error !== "object") {
    return { value: error };
  }

  const row = error as Record<string, unknown>;
  return {
    code: row.code,
    message: row.message,
    details: row.details,
    hint: row.hint,
  };
}

function createCorrelationId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeContextRecord(value: Record<string, unknown> | undefined) {
  if (!value) return null;

  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null) return true;
      if (typeof entry === "string") return entry.trim().length > 0;
      return typeof entry === "number" || typeof entry === "boolean";
    }),
  );
}

function getRequestPath(request: Request | undefined) {
  if (!request) return null;

  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

export function respondInternalError(
  endpointTag: string,
  error: unknown,
  context?: InternalErrorContext,
) {
  const correlationId = createCorrelationId();
  const requestPath = getRequestPath(context?.request);
  const sanitizedExtra = sanitizeContextRecord(context?.extra);

  console.error(`[${endpointTag}]`, {
    correlationId,
    method: context?.request?.method ?? null,
    path: requestPath,
    userId: context?.userId ?? null,
    ageGroupId: context?.ageGroupId ?? null,
    teamId: context?.teamId ?? null,
    gameId: context?.gameId ?? null,
    extra: sanitizedExtra,
    error: sanitizeErrorForLog(error),
  });

  Sentry.withScope((scope) => {
    scope.setTag("handled", "true");
    scope.setTag("endpoint_tag", endpointTag);
    scope.setTag("correlation_id", correlationId);

    if (context?.request?.method) {
      scope.setTag("http_method", context.request.method);
    }
    if (requestPath) {
      scope.setTag("http_path", requestPath);
    }
    if (context?.ageGroupId) {
      scope.setTag("age_group_id", context.ageGroupId);
    }
    if (context?.teamId) {
      scope.setTag("team_id", context.teamId);
    }
    if (context?.gameId) {
      scope.setTag("game_id", context.gameId);
    }
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }

    scope.setContext("api_error", {
      endpointTag,
      correlationId,
      method: context?.request?.method ?? "unknown",
      path: requestPath ?? "unknown",
      ...sanitizeErrorForLog(error),
    });

    if (sanitizedExtra && Object.keys(sanitizedExtra).length > 0) {
      scope.setContext("request_extra", sanitizedExtra);
    }

    Sentry.captureException(
      error instanceof Error ? error : new Error(`handled_api_error:${endpointTag}`),
    );
  });

  // SEC-10: expor o correlationId apenas em desenvolvimento para facilitar debug.
  // Em produção o ID mantém-se nos logs do servidor mas não é exposto ao cliente.
  const isDev = process.env.NODE_ENV === "development";

  return NextResponse.json(
    { error: "Erro interno do servidor.", ...(isDev && { correlationId }) },
    { status: 500 },
  );
}
