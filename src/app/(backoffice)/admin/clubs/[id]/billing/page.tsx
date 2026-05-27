import { notFound } from "next/navigation";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { ClubBillingView } from "@/components/admin/ClubBillingView";

export default async function AdminClubBillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  const { id } = await params;
  return <ClubBillingView clubId={id} />;
}
