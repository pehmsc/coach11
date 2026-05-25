import { notFound } from "next/navigation";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { ClubCreationWizard } from "@/components/admin/ClubCreationWizard";

export default async function AdminClubsNewPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  return <ClubCreationWizard />;
}
