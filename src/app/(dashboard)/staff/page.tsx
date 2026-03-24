import { redirect } from "next/navigation";

/**
 * A página /staff foi substituída pelo tab Membros em /club.
 * Redirecionar para manter compatibilidade com links existentes.
 */
export default function StaffPage() {
  redirect("/club?tab=members");
}
