import { notFound } from "next/navigation";
import { PublicLinksAdminPanel } from "@/components/admin/PublicLinksAdminPanel";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";

export default async function AdminPublicLinksPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <PublicLinksAdminPanel />
    </div>
  );
}
