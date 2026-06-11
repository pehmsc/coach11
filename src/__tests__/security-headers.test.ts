/**
 * Asserções de configuração de segurança dos headers HTTP (Bloco B/D).
 *
 * Importa o next.config real e chama headers() — comportamental, não
 * regex: se um refactor remover HSTS, CSP, Permissions-Policy ou
 * X-Content-Type-Options do catch-all, isto falha.
 */

import { describe, it, expect } from "vitest";

import nextConfig from "../../next.config";

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
