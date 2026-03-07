import { notFound } from "next/navigation";
import { AuditLogsAdminPanel } from "@/components/admin/AuditLogsAdminPanel";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";

export default async function AdminAuditLogsPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <StickyBackLink href="/settings" label="Voltar às Configurações" />
      <AuditLogsAdminPanel />
    </div>
  );
}
