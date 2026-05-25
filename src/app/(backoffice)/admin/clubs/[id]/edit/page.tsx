import { notFound } from "next/navigation";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { ClubEditForm } from "@/components/admin/ClubEditForm";

export default async function AdminClubEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  const { id } = await params;
  return <ClubEditForm clubId={id} />;
}
