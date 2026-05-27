import { notFound } from "next/navigation";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { OverdueInvoicesView } from "@/components/admin/OverdueInvoicesView";

export default async function AdminOverduePage() {
  const access = await getSuperUserAccess();
  if (!access.ok) notFound();

  return <OverdueInvoicesView />;
}
