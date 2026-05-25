import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { BetaInvitesManager } from "@/components/admin/BetaInvitesManager";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";

export default async function AdminBetaInvitesPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft size={14} aria-hidden="true" />
        Voltar ao Admin
      </Link>
      <BetaInvitesManager />
    </div>
  );
}
