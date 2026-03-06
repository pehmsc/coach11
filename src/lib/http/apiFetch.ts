export class ApiFetchError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiFetchError";
    this.status = status;
    this.data = data;
  }
}

type ApiFetchInit = RequestInit & {
  signal?: AbortSignal;
};

function toErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "string" && data.trim().length > 0) return data;

  if (data && typeof data === "object" && "error" in data) {
    const candidate = (data as { error?: unknown }).error;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return fallback;
}

function parsePayloadFromText(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiFetch<T>(url: string, init: ApiFetchInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: init.credentials ?? "include",
  });

  const text = await response.text();
  const payload = parsePayloadFromText(text);

  if (!response.ok) {
    const message = toErrorMessage(
      payload,
      `Pedido falhou com status ${response.status}.`,
    );
    throw new ApiFetchError(message, response.status, payload);
  }

  return payload as T;
}
