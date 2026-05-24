import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { maybeApplyPlanTypeRedirect } from "./proxy";

const BASE_URL = "https://coach11.app";

function makeRequest(
  pathname: string,
  cookieValue: string | undefined,
): NextRequest {
  const url = `${BASE_URL}${pathname}`;
  const headers = new Headers();
  if (cookieValue !== undefined) {
    headers.set("cookie", `coach11_plan_type=${cookieValue}`);
  }
  return new NextRequest(url, { headers });
}

describe("maybeApplyPlanTypeRedirect", () => {
  describe("plan_type = 'club' (default quando cookie missing)", () => {
    it.each([
      "/games",
      "/games/abc-123",
      "/games/abc-123/live",
      "/players",
      "/players/xyz/games",
      "/trainings",
      "/trainings/uuid",
      "/competitions",
      "/team",
      "/team/setup",
      "/staff",
    ])("redirige rota legacy %s para /teams", (path) => {
      const response = maybeApplyPlanTypeRedirect(makeRequest(path, "club"));
      expect(response).not.toBeNull();
      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toBe(`${BASE_URL}/teams`);
    });

    it("usa default 'club' quando cookie missing", () => {
      const response = maybeApplyPlanTypeRedirect(
        makeRequest("/games", undefined),
      );
      expect(response).not.toBeNull();
      expect(response?.headers.get("location")).toBe(`${BASE_URL}/teams`);
    });

    it.each([
      "/dashboard",
      "/calendar",
      "/teams",
      "/teams/abc-123",
      "/teams/abc-123/games",
      "/club",
      "/insights",
      "/statistics",
      "/exercises",
      "/notifications",
      "/settings",
      "/admin",
      "/admin/clubs",
    ])("nao toca rota %s no plano 'club'", (path) => {
      expect(maybeApplyPlanTypeRedirect(makeRequest(path, "club"))).toBeNull();
    });

    it("preserva search/query (descartando-o no redirect para evitar levar contexto invalido)", () => {
      const url = `${BASE_URL}/games?filter=open&page=2`;
      const headers = new Headers();
      headers.set("cookie", "coach11_plan_type=club");
      const request = new NextRequest(url, { headers });
      const response = maybeApplyPlanTypeRedirect(request);
      expect(response?.headers.get("location")).toBe(`${BASE_URL}/teams`);
    });
  });

  describe("plan_type = 'individual'", () => {
    it.each([
      "/teams",
      "/teams/abc-123",
      "/teams/abc-123/players/xyz/games",
    ])("redirige rota multi-team %s para /dashboard", (path) => {
      const response = maybeApplyPlanTypeRedirect(
        makeRequest(path, "individual"),
      );
      expect(response).not.toBeNull();
      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toBe(`${BASE_URL}/dashboard`);
    });

    it.each([
      "/dashboard",
      "/calendar",
      "/games",
      "/games/abc-123/live",
      "/players",
      "/trainings",
      "/competitions",
      "/exercises",
      "/notifications",
      "/settings",
    ])("nao toca rota %s no plano 'individual' (rotas single-team validas)", (path) => {
      expect(
        maybeApplyPlanTypeRedirect(makeRequest(path, "individual")),
      ).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("valor de cookie nao reconhecido cai para default 'club'", () => {
      const response = maybeApplyPlanTypeRedirect(
        makeRequest("/games", "enterprise-future-tier"),
      );
      expect(response).not.toBeNull();
      expect(response?.headers.get("location")).toBe(`${BASE_URL}/teams`);
    });

    it("matching de prefixo nao apanha rotas com prefixo apenas parcial", () => {
      // /teams-old nao e /teams nem /teams/...
      expect(
        maybeApplyPlanTypeRedirect(
          makeRequest("/teams-old", "individual"),
        ),
      ).toBeNull();
      // /gamesa nao e /games
      expect(
        maybeApplyPlanTypeRedirect(makeRequest("/gamesa", "club")),
      ).toBeNull();
    });
  });
});
