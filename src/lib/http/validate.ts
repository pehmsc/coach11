import { NextResponse } from "next/server";
import type { ZodSchema, ZodError } from "zod";

function formatZodErrors(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns `{ data }` on success or `{ error }` with a 400 NextResponse on failure.
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      error: NextResponse.json(
        { error: "Corpo do pedido inválido (JSON esperado)." },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      error: NextResponse.json(
        { error: formatZodErrors(result.error) },
        { status: 400 },
      ),
    };
  }

  return { data: result.data };
}

/**
 * Parse and validate URL search params against a Zod schema.
 * Returns `{ data }` on success or `{ error }` with a 400 NextResponse on failure.
 */
export function parseSearchParams<T>(
  request: Request,
  schema: ZodSchema<T>,
): { data: T; error?: never } | { data?: never; error: NextResponse } {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  const result = schema.safeParse(params);
  if (!result.success) {
    return {
      error: NextResponse.json(
        { error: formatZodErrors(result.error) },
        { status: 400 },
      ),
    };
  }

  return { data: result.data };
}
