import { notFound } from "next/navigation";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { ClubsAdminPanel } from "@/components/admin/ClubsAdminPanel";

export default async function AdminClubsPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <StickyBackLink href="/admin" label="Voltar ao Admin">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clubes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lista de todos os clubes (clube sales-led e treinador individual).
          </p>
        </div>
      </StickyBackLink>

      <ClubsAdminPanel />
    </div>
  );
}
