import { NextResponse } from "next/server";

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

export function respondInternalError(endpointTag: string, error: unknown) {
  const correlationId = createCorrelationId();
  console.error(`[${endpointTag}]`, {
    correlationId,
    error: sanitizeErrorForLog(error),
  });

  // SEC-10: expor o correlationId apenas em desenvolvimento para facilitar debug.
  // Em produção o ID mantém-se nos logs do servidor mas não é exposto ao cliente.
  const isDev = process.env.NODE_ENV === "development";

  return NextResponse.json(
    { error: "Erro interno do servidor.", ...(isDev && { correlationId }) },
    { status: 500 },
  );
}
