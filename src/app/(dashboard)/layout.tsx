import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/layout/BottomNav";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Buscar perfil do utilizador
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metadataAvatar =
    (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
    (typeof metadata.picture === "string" && metadata.picture) ||
    null;
  const avatarUrl =
    (profile && "avatar_url" in profile && typeof profile.avatar_url === "string"
      ? profile.avatar_url
      : null) || metadataAvatar;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar — visível apenas em desktop */}
      <Sidebar profile={profile} avatarUrl={avatarUrl} />

      {/* Conteúdo principal */}
      <main className="pb-20 md:pb-0 md:ml-64">{children}</main>

      {/* Navegação inferior — visível apenas em mobile */}
      <BottomNav profileId={profile?.id} />
    </div>
  );
}
