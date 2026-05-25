import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { AuthRecoveryGate } from "@/components/auth/AuthRecoveryGate";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookies } from "@/lib/supabase/auth-cookie";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { BackofficeHeader } from "@/components/backoffice/BackofficeHeader";

/**
 * Layout isolado do backoffice — sem sidebar/bottomnav da app principal.
 *
 * Gate:
 * - Nao autenticado -> redirect /admin/login.
 * - Autenticado sem flag is_super_coordinator -> notFound() (404).
 *
 * Auto-login: se a sessao Supabase ja esta valida e o utilizador tem
 * is_super_coordinator, entra directamente sem passar pelo /admin/login.
 * O /admin/login propriamente dito vive em (auth)/admin/login/ para
 * nao ser submetido a este gate (evita loop de redirect).
 */
export default async function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (hasSupabaseAuthCookies(cookieStore.getAll())) {
      return <AuthRecoveryGate />;
    }
    redirect("/admin/login");
  }

  const access = await getSuperUserAccess();
  if (!access.ok) {
    if (access.status === 401) {
      redirect("/admin/login");
    }
    notFound();
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metadataAvatar =
    (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
    (typeof metadata.picture === "string" && metadata.picture) ||
    null;

  // O `getSuperUserAccess` ja devolve profile, mas sem avatar_url.
  // Vou buscar o avatar inline (uma query rapida) para o header.
  const { data: avatarRow } = await access.admin
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const avatarUrl =
    (avatarRow && typeof avatarRow.avatar_url === "string"
      ? avatarRow.avatar_url
      : null) || metadataAvatar;

  const topInset = "max(env(safe-area-inset-top, 0px), env(titlebar-area-height, 0px))";

  return (
    <div
      className="min-h-screen bg-slate-50"
      style={{ ["--coach11-top-inset" as string]: topInset }}
    >
      <BackofficeHeader
        fullName={access.profile.full_name}
        email={access.profile.email}
        avatarUrl={avatarUrl}
      />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
