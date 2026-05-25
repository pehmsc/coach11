import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { ClubsAdminPanel } from "@/components/admin/ClubsAdminPanel";

export default async function AdminClubsPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Voltar ao Admin
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Clubes</h1>
        <p className="text-sm text-slate-500">
          Lista de todos os clubes (clube sales-led e treinador individual).
        </p>
      </div>

      <ClubsAdminPanel />
    </div>
  );
}
