import { describe, expect, it } from "vitest";
import {
  getAppNavSectionsForPlan,
  getMobileAppNavSectionsForPlan,
  MOBILE_FOOTER_NAV_ITEMS,
} from "./nav-config";

describe("nav-config — conditional ao plan_type", () => {
  describe("getAppNavSectionsForPlan('club') (sales-led, multi-team cleanup A)", () => {
    const sections = getAppNavSectionsForPlan("club");
    const mainItems = sections.find((s) => s.id === "main")?.items ?? [];
    const mainIds = mainItems.map((i) => i.id);

    it("inclui Equipas como entrada principal", () => {
      expect(mainIds).toContain("teams");
    });

    it("inclui Clube (gestao de membros/escaloes)", () => {
      expect(mainIds).toContain("club");
    });

    it("remove items single-team legacy (Plantel/Jogos/Treinos/Competicoes)", () => {
      expect(mainIds).not.toContain("players");
      expect(mainIds).not.toContain("games");
      expect(mainIds).not.toContain("trainings");
      expect(mainIds).not.toContain("competitions");
    });

    it("inclui items globais (Dashboard, Calendar, Notif, Insights, Stats, Exercises)", () => {
      expect(mainIds).toContain("dashboard");
      expect(mainIds).toContain("calendar");
      expect(mainIds).toContain("notifications");
      expect(mainIds).toContain("insights");
      expect(mainIds).toContain("statistics");
      expect(mainIds).toContain("exercises");
    });

    it("inclui Configuracoes na seccao settings", () => {
      const settings = sections.find((s) => s.id === "settings");
      expect(settings?.items.map((i) => i.id)).toEqual(["settings"]);
    });
  });

  describe("getAppNavSectionsForPlan('individual') (self-service, single-team)", () => {
    const sections = getAppNavSectionsForPlan("individual");
    const mainItems = sections.find((s) => s.id === "main")?.items ?? [];
    const mainIds = mainItems.map((i) => i.id);

    it("inclui items single-team directos (Plantel/Jogos/Treinos/Competicoes)", () => {
      expect(mainIds).toContain("players");
      expect(mainIds).toContain("games");
      expect(mainIds).toContain("trainings");
      expect(mainIds).toContain("competitions");
    });

    it("remove Equipas (irrelevante quando ha 1 escalao)", () => {
      expect(mainIds).not.toContain("teams");
    });

    it("remove Clube (treinador individual nao tem hierarquia de clube)", () => {
      expect(mainIds).not.toContain("club");
    });

    it("inclui items globais (Dashboard, Calendar, Notif, Insights, Stats, Exercises)", () => {
      expect(mainIds).toContain("dashboard");
      expect(mainIds).toContain("calendar");
      expect(mainIds).toContain("notifications");
      expect(mainIds).toContain("insights");
      expect(mainIds).toContain("statistics");
      expect(mainIds).toContain("exercises");
    });
  });

  describe("default ('club') quando planType e omitido", () => {
    it("getAppNavSectionsForPlan() comporta-se como 'club'", () => {
      const def = getAppNavSectionsForPlan();
      const club = getAppNavSectionsForPlan("club");
      expect(def.map((s) => s.items.map((i) => i.id))).toEqual(
        club.map((s) => s.items.map((i) => i.id)),
      );
    });

    it("getMobileAppNavSectionsForPlan() comporta-se como 'club'", () => {
      const def = getMobileAppNavSectionsForPlan();
      const club = getMobileAppNavSectionsForPlan("club");
      expect(def.map((s) => s.items.map((i) => i.id))).toEqual(
        club.map((s) => s.items.map((i) => i.id)),
      );
    });
  });

  describe("isolamento entre planos (planos NAO partilham referencias)", () => {
    it("mutar resultado de 'club' nao afecta 'individual'", () => {
      const club = getAppNavSectionsForPlan("club");
      club[0].items.length = 0;
      const individual = getAppNavSectionsForPlan("individual");
      expect(individual[0].items.length).toBeGreaterThan(0);
    });

    it("getAppNavSectionsForPlan devolve clones independentes em cada call", () => {
      const a = getAppNavSectionsForPlan("club");
      const b = getAppNavSectionsForPlan("club");
      expect(a).not.toBe(b);
      expect(a[0].items).not.toBe(b[0].items);
    });
  });

  describe("getMobileAppNavSectionsForPlan — espelha as decisoes do desktop", () => {
    it("'club' mobile remove items single-team legacy", () => {
      const ids =
        getMobileAppNavSectionsForPlan("club")
          .find((s) => s.id === "main")
          ?.items.map((i) => i.id) ?? [];
      expect(ids).toContain("teams");
      expect(ids).not.toContain("players");
      expect(ids).not.toContain("games");
      expect(ids).not.toContain("trainings");
    });

    it("'individual' mobile inclui items single-team directos", () => {
      const ids =
        getMobileAppNavSectionsForPlan("individual")
          .find((s) => s.id === "main")
          ?.items.map((i) => i.id) ?? [];
      expect(ids).toContain("players");
      expect(ids).toContain("games");
      expect(ids).toContain("trainings");
      expect(ids).toContain("competitions");
      expect(ids).not.toContain("teams");
    });
  });

  describe("MOBILE_FOOTER_NAV_ITEMS (footer fixo agnostico ao plano)", () => {
    it("contem exactamente Dashboard, Calendario, Estatisticas", () => {
      expect(MOBILE_FOOTER_NAV_ITEMS.map((i) => i.id)).toEqual([
        "dashboard",
        "calendar",
        "statistics",
      ]);
    });
  });
});
