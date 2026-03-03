import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PublicLinksAdminPanel } from "@/components/admin/PublicLinksAdminPanel";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";

export default async function AdminPublicLinksPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-white/95 pb-2 backdrop-blur">
        <Link
          href="/settings"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 transition-colors hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Voltar às Configurações
        </Link>
      </div>
      <PublicLinksAdminPanel />
    </div>
  );
}
