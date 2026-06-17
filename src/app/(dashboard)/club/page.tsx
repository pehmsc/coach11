import { Suspense } from "react";
import { assertStaffManagementAccessOrRedirect } from "@/lib/billing/plan-guard.server";
import ClubPageContent from "./ClubPageContent";

/**
 * Wrapper server-side de /club. A pagina em si e client (ClubPageContent), mas
 * o tab de equipa tecnica (?tab=members) e club-only e tem de ser fechado por
 * navegacao directa — algo que so um server boundary garante (o cookie do proxy
 * e best-effort). O tab "Detalhes" (sem ?tab=) fica sempre acessivel ao
 * individual: e a "Equipa" dele.
 */
const CLUB_ONLY_TABS = new Set(["members", "membros"]);

export default async function ClubPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : null;

  if (tab && CLUB_ONLY_TABS.has(tab)) {
    await assertStaffManagementAccessOrRedirect();
  }

  return (
    <Suspense fallback={null}>
      <ClubPageContent />
    </Suspense>
  );
}
