import { defineConfig } from "vitest/config";
import path from "node:path";

const aliasMap = {
  "@": path.resolve(__dirname, "./src"),
};

export default defineConfig({
  // Vitest projects: separar testes de UI (jsdom + alias) de testes de
  // lógica pura (node, sem alias). Esta separação é crítica porque alguns
  // testes existentes usam `vi.doMock("@/...")` que depende de não haver
  // alias resolution para o mock-lookup funcionar.
  test: {
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    projects: [
      {
        extends: true,
        resolve: {
          alias: aliasMap,
        },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["**/*.test.tsx"],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts"],
        },
      },
    ],
  },
});
