import { notFound } from "next/navigation";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { ClubSnapshotView } from "@/components/admin/ClubSnapshotView";

export default async function AdminClubSnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  const { id } = await params;
  return <ClubSnapshotView clubId={id} />;
}
