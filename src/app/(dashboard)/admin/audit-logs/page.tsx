import { notFound } from "next/navigation";
import { AuditLogsAdminPanel } from "@/components/admin/AuditLogsAdminPanel";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";

export default async function AdminAuditLogsPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <AuditLogsAdminPanel />
    </div>
  );
}
