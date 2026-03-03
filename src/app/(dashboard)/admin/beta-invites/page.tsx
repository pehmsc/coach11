import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { BetaInvitesManager } from "@/components/admin/BetaInvitesManager";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";

export default async function AdminBetaInvitesPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <div
        className="sticky top-0 z-[80] isolate -mx-4 bg-slate-50/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/90 md:-mx-8 md:px-8"
        style={{ ["WebkitAppRegion" as string]: "no-drag" }}
      >
        <div className="flex flex-wrap items-center gap-3 pointer-events-auto">
          <Link
            href="/settings"
            className="relative z-10 inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
            style={{ ["WebkitAppRegion" as string]: "no-drag" }}
          >
            <ArrowLeft size={16} />
            Voltar às Configurações
          </Link>
        </div>
      </div>
      <BetaInvitesManager />
    </div>
  );
}
