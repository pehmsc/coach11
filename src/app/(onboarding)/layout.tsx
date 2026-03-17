import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookies } from "@/lib/supabase/auth-cookie";
import { AuthRecoveryGate } from "@/components/auth/AuthRecoveryGate";

export default async function OnboardingLayout({
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
    redirect("/login");
  }

  return <>{children}</>;
}
