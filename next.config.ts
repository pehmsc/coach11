import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "hqlqgviiafqfefukodpe.supabase.co";

function normalizeOrigin(value: string | undefined | null) {
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

function parseOriginList(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter((entry): entry is string => !!entry);
}

function toSocketOrigin(origin: string) {
  if (origin.startsWith("https://")) return origin.replace("https://", "wss://");
  if (origin.startsWith("http://")) return origin.replace("http://", "ws://");
  return origin;
}

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://${supabaseHost} https://lh3.googleusercontent.com https://tile.openstreetmap.org`,
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

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
      ...parseOriginList(process.env.CSP_REPORT_ONLY_CONNECT_ORIGINS),
    ].filter((value): value is string => !!value),
  ),
];

const reportOnlyDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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

if (process.env.CSP_REPORT_ONLY_REPORT_URI?.trim()) {
  reportOnlyDirectives.push(`report-uri ${process.env.CSP_REPORT_ONLY_REPORT_URI.trim()}`);
}

const cspReportOnly = reportOnlyDirectives.join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: csp },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Type",
            value: "application/manifest+json; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/offline.html",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Type",
            value: "text/html; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Type",
            value: "font/woff2",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
