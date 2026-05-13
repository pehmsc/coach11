import type { ReactNode } from "react";

/**
 * Route group layout para sub-rotas internas do escalão.
 *
 * Wrapper mínimo — actualmente apenas renderiza children. Existe para que
 * PRs futuros (#151+) possam adicionar sub-rotas dentro deste grupo (ex:
 * /teams/[ageGroupId]/games, /trainings, /players) com layout partilhado.
 *
 * Nota técnica: route groups com parênteses não afectam a URL. A pasta
 * (internal) é um agrupamento lógico; /teams/[ageGroupId]/games/page.tsx
 * dentro deste grupo continua a ser servida em /teams/[ageGroupId]/games.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/route-groups
 */
export default function TeamInternalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
