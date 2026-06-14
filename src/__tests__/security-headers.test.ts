/**
 * Asserções de configuração de segurança dos headers HTTP (Bloco B/D).
 *
 * Importa o next.config real e chama headers() — comportamental, não
 * regex: se um refactor remover HSTS, CSP, Permissions-Policy ou
 * X-Content-Type-Options do catch-all, isto falha.
 */

import { describe, it, expect, vi } from "vitest";

import nextConfig from "../../next.config";
import { buildCsp } from "../lib/security/csp";

function scriptSrcOf(csp: string): string {
  const directive = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("script-src"));
  expect(directive, "directiva script-src presente").toBeDefined();
  return directive!;
}

type HeaderEntry = { key: string; value: string };
type RouteHeaders = { source: string; headers: HeaderEntry[] };

async function getCatchAllHeaders(): Promise<Map<string, string>> {
  const routes = (await nextConfig.headers!()) as RouteHeaders[];
  const catchAll = routes.find((route) => route.source === "/(.*)");
  expect(catchAll, "entrada catch-all /(.*) presente").toBeDefined();
  return new Map(catchAll!.headers.map((h) => [h.key, h.value]));
}

describe("security headers (catch-all)", () => {
  it("HSTS com max-age >= 2 anos e includeSubDomains", async () => {
    const headers = await getCatchAllHeaders();
    const hsts = headers.get("Strict-Transport-Security");
    expect(hsts).toBeDefined();
    const maxAge = Number(/max-age=(\d+)/.exec(hsts!)?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(63072000);
    expect(hsts).toContain("includeSubDomains");
  });

  it("CSP presente e sem unsafe-eval", async () => {
    const headers = await getCatchAllHeaders();
    const csp = headers.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("default-src 'self'");
  });

  it("Permissions-Policy nega camera, microphone e geolocation", async () => {
    const headers = await getCatchAllHeaders();
    const policy = headers.get("Permissions-Policy");
    expect(policy).toBeDefined();
    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("geolocation=()");
  });

  it("X-Content-Type-Options nosniff", async () => {
    const headers = await getCatchAllHeaders();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("todas as rotas declaradas incluem o conjunto base de seguranca", async () => {
    const routes = (await nextConfig.headers!()) as RouteHeaders[];
    for (const route of routes) {
      const keys = new Set(route.headers.map((h) => h.key));
      expect(
        keys.has("Strict-Transport-Security"),
        `HSTS em falta na rota ${route.source}`,
      ).toBe(true);
      expect(
        keys.has("Content-Security-Policy"),
        `CSP em falta na rota ${route.source}`,
      ).toBe(true);
    }
  });
});

/**
 * Bloco C — nonces no script-src. Estado REPORT-ONLY: o enforce ainda tolera
 * 'unsafe-inline' (transitorio); o report-only (emitido por-request pelo proxy)
 * ja e nonce-only. No PR de promocao, o enforce passa a nonce-only e estas
 * assercoes endurecem.
 */
describe("CSP script-src (Bloco C — nonce / report-only)", () => {
  it("report-only com nonce: script-src tem o nonce e NAO tem unsafe-inline", () => {
    const scriptSrc = scriptSrcOf(buildCsp({ nonce: "NONCE_TESTE", reportOnly: true }));
    expect(scriptSrc).toContain("'nonce-NONCE_TESTE'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("nonce e unsafe-inline sao mutuamente exclusivos (presenca de nonce remove unsafe-inline)", () => {
    const scriptSrc = scriptSrcOf(buildCsp({ nonce: "ABC", allowUnsafeInlineScripts: true }));
    expect(scriptSrc).toContain("'nonce-ABC'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("enforce (estado report-only) ainda tolera unsafe-inline, nunca unsafe-eval", () => {
    const scriptSrc = scriptSrcOf(buildCsp({ allowUnsafeInlineScripts: true }));
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("style-src mantem unsafe-inline (decisao registada) em enforce e report-only", () => {
    expect(buildCsp({ allowUnsafeInlineScripts: true })).toContain(
      "style-src 'self' 'unsafe-inline'",
    );
    expect(buildCsp({ nonce: "X", reportOnly: true })).toContain(
      "style-src 'self' 'unsafe-inline'",
    );
  });

  it("report-only inclui report-uri quando CSP_REPORT_ONLY_REPORT_URI esta definido", () => {
    vi.stubEnv("CSP_REPORT_ONLY_REPORT_URI", "https://exemplo.report/csp");
    expect(buildCsp({ reportOnly: true, nonce: "Z" })).toContain(
      "report-uri https://exemplo.report/csp",
    );
    vi.unstubAllEnvs();
  });
});
