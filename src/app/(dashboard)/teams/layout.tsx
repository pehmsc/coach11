import { assertMultiTeamAccessOrRedirect } from "@/lib/billing/plan-guard.server";

/**
 * Gate server-side de todo o segmento /teams (lista + /teams/[ageGroupId]/*).
 *
 * /teams e a superficie multi-team: so faz sentido no tier clube. Para o
 * individual (1 escalao) redirige para /dashboard — independente do cookie do
 * proxy, que e best-effort. Esta e a garantia "nem por navegacao directa".
 */
export default async function TeamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertMultiTeamAccessOrRedirect();
  return <>{children}</>;
}
