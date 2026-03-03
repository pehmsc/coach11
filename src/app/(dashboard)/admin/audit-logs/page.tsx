import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { AuditLogsAdminPanel } from "@/components/admin/AuditLogsAdminPanel";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";

export default async function AdminAuditLogsPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/settings"
          className="relative z-10 inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
          style={{ ["WebkitAppRegion" as string]: "no-drag" }}
        >
          <ArrowLeft size={16} />
          Voltar às Configurações
        </Link>
      </div>
      <AuditLogsAdminPanel />
    </div>
  );
}
