import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

import { buildCsp } from "./src/lib/security/csp";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "hqlqgviiafqfefukodpe.supabase.co";

// Enforce: mantem 'unsafe-inline' no script-src ate ao PR de promocao. O nonce
// por-request e injectado pelo proxy (ver src/proxy.ts) no header report-only,
// como rede de seguranca antes de remover o unsafe-inline. Fonte unica das
// directivas: src/lib/security/csp.ts.
const csp = buildCsp({ allowUnsafeInlineScripts: true });
const cspReportOnly = buildCsp({
  reportOnly: true,
  allowUnsafeInlineScripts: true,
});

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

// Versao para resources embebiveis em iframe same-origin (ex: preview de PDF
// da factura no drawer admin). Substitui X-Frame-Options: DENY -> SAMEORIGIN
// e CSP frame-ancestors 'none' -> 'self'.
const sameOriginEmbeddableSecurityHeaders = securityHeaders.map((header) => {
  if (header.key === "X-Frame-Options") {
    return { key: header.key, value: "SAMEORIGIN" };
  }
  if (header.key === "Content-Security-Policy") {
    return {
      key: header.key,
      value: header.value.replace(
        "frame-ancestors 'none'",
        "frame-ancestors 'self'",
      ),
    };
  }
  if (header.key === "Content-Security-Policy-Report-Only") {
    return {
      key: header.key,
      value: header.value.replace(
        "frame-ancestors 'none'",
        "frame-ancestors 'self'",
      ),
    };
  }
  return header;
});

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
      // Override: PDF stream endpoints precisam de embedding same-origin no
      // iframe do drawer admin / preview de factura. Entrada DEPOIS do catch-all
      // (DENY) para sobrepor X-Frame-Options + CSP frame-ancestors.
      {
        source: "/api/admin/clubs/:clubId/invoices/:invoiceId/pdf",
        headers: sameOriginEmbeddableSecurityHeaders,
      },
      {
        source: "/api/club/invoices/:invoiceId/pdf",
        headers: sameOriginEmbeddableSecurityHeaders,
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

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
