/**
 * Fonte unica das directivas de Content-Security-Policy (Bloco C).
 *
 * Importado tanto pelo `next.config.ts` (Node, build-time, sem nonce) como
 * pelo `src/proxy.ts` (edge runtime, por-request, com nonce). Mantem-se
 * edge-safe: so leituras literais de `process.env.*` (inlined no bundle) e
 * Web Crypto / btoa globais — sem APIs de Node.
 *
 * O `script-src` deixa de depender de `'unsafe-inline'`: os scripts legitimos
 * do Next sao carimbados com um nonce por-request (ver app-render do Next, que
 * le o nonce do header CSP da request). `style-src 'unsafe-inline'` mantem-se
 * por decisao (bibliotecas injectam estilos inline; o payoff de XSS esta nos
 * scripts).
 */

const DEFAULT_SUPABASE_HOST = "hqlqgviiafqfefukodpe.supabase.co";

function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function parseOriginList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter((entry): entry is string => !!entry);
}

function getPostHogAssetsOrigin(origin: string | null): string | null {
  if (!origin) return null;

  try {
    const parsed = new URL(origin);

    if (parsed.hostname === "app.posthog.com") {
      return "https://us-assets.i.posthog.com";
    }

    if (/^(eu|eu-assets)\.i\.posthog\.com$/i.test(parsed.hostname)) {
      return "https://eu-assets.i.posthog.com";
    }

    if (/^(us|us-assets)\.i\.posthog\.com$/i.test(parsed.hostname)) {
      return "https://us-assets.i.posthog.com";
    }
  } catch {
    return null;
  }

  return null;
}

function toSocketOrigin(origin: string): string {
  if (origin.startsWith("https://")) return origin.replace("https://", "wss://");
  if (origin.startsWith("http://")) return origin.replace("http://", "ws://");
  return origin;
}

function getSupabaseHost(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return DEFAULT_SUPABASE_HOST;
  try {
    return new URL(url).hostname;
  } catch {
    return DEFAULT_SUPABASE_HOST;
  }
}

/**
 * Constroi o token de directiva `script-src`.
 *
 * - `nonce` presente -> acrescenta `'nonce-<...>'`. Os browsers ignoram
 *   `'unsafe-inline'` quando ha nonce/hash, pelo que nonce e unsafe-inline sao
 *   mutuamente exclusivos na pratica.
 * - `allowUnsafeInline` controla explicitamente o fallback legacy. Mantem-se
 *   true apenas no enforce do PR report-only; alvo final e false em todo o lado.
 */
function buildScriptSrc(options: {
  nonce?: string;
  allowUnsafeInline: boolean;
  posthogAssetsOrigin: string | null;
}): string {
  const sources = ["'self'"];
  if (options.nonce) {
    sources.push(`'nonce-${options.nonce}'`);
  } else if (options.allowUnsafeInline) {
    sources.push("'unsafe-inline'");
  }
  if (options.posthogAssetsOrigin) {
    sources.push(options.posthogAssetsOrigin);
  }
  return `script-src ${sources.join(" ")}`;
}

export type CspBuildOptions = {
  /** Nonce por-request. Quando presente, o `script-src` deixa de usar unsafe-inline. */
  nonce?: string;
  /**
   * Selecciona o conjunto alargado de origens img/connect configuravel por env
   * (`CSP_REPORT_ONLY_*`). Usado pelo header `Content-Security-Policy-Report-Only`.
   */
  reportOnly?: boolean;
  /**
   * Permite `'unsafe-inline'` no `script-src` quando nao ha nonce. Transitorio:
   * fica true so no enforce legacy do PR report-only. Alvo final: false.
   */
  allowUnsafeInlineScripts?: boolean;
};

/**
 * Constroi a string completa de CSP. Determinista para um dado nonce/env,
 * pelo que o nonce e injectado pelo proxy (por-request) e o next.config chama
 * sem nonce para as rotas estaticas.
 */
export function buildCsp(options: CspBuildOptions = {}): string {
  const { nonce, reportOnly = false, allowUnsafeInlineScripts = false } = options;

  const supabaseHost = getSupabaseHost();
  const posthogOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_POSTHOG_HOST);
  const posthogAssetsOrigin = getPostHogAssetsOrigin(posthogOrigin);
  const sentryOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);

  const scriptSrc = buildScriptSrc({
    nonce,
    allowUnsafeInline: allowUnsafeInlineScripts,
    posthogAssetsOrigin,
  });

  if (!reportOnly) {
    const connectSources = [
      "'self'",
      `https://${supabaseHost}`,
      `wss://${supabaseHost}`,
      ...new Set(
        [posthogOrigin, posthogAssetsOrigin, sentryOrigin].filter(
          (value): value is string => !!value,
        ),
      ),
    ];

    return [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://${supabaseHost} https://lh3.googleusercontent.com https://tile.openstreetmap.org`,
      `connect-src ${connectSources.join(" ")}`,
      "worker-src 'self'",
      "manifest-src 'self'",
      "font-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; ");
  }

  // Report-only: origens img/connect alargadas e configuraveis por env.
  const reportOnlySupabaseOrigin = normalizeOrigin(
    process.env.CSP_REPORT_ONLY_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const reportOnlyImgOrigins = [
    "https://lh3.googleusercontent.com",
    "https://tile.openstreetmap.org",
    ...parseOriginList(process.env.CSP_REPORT_ONLY_IMG_ORIGINS),
  ];
  const reportOnlyImgSources = [
    "'self'",
    "data:",
    "blob:",
    ...new Set(
      [reportOnlySupabaseOrigin, ...reportOnlyImgOrigins].filter(
        (value): value is string => !!value,
      ),
    ),
  ];
  const reportOnlyConnectSources = [
    "'self'",
    ...new Set(
      [
        reportOnlySupabaseOrigin,
        reportOnlySupabaseOrigin ? toSocketOrigin(reportOnlySupabaseOrigin) : null,
        posthogOrigin,
        posthogAssetsOrigin,
        sentryOrigin,
        ...parseOriginList(process.env.CSP_REPORT_ONLY_CONNECT_ORIGINS),
      ].filter((value): value is string => !!value),
    ),
  ];

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${reportOnlyImgSources.join(" ")}`,
    `connect-src ${reportOnlyConnectSources.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ];

  const reportUri = process.env.CSP_REPORT_ONLY_REPORT_URI?.trim();
  if (reportUri) {
    directives.push(`report-uri ${reportUri}`);
  }

  return directives.join("; ");
}

/** Header em que o proxy expoe o nonce para a app o poder ler via `headers()`. */
export const NONCE_HEADER = "x-nonce";

/**
 * Gera um nonce base64 por-request. Edge-safe: usa Web Crypto + btoa globais,
 * sem `Buffer` nem APIs de Node. CPU-only — preserva a propriedade "proxy sem I/O".
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
