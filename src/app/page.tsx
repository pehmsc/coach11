import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthRecoveryGate } from "@/components/auth/AuthRecoveryGate";
import { hasSupabaseAuthCookies } from "@/lib/supabase/auth-cookie";
import { createClient } from "@/lib/supabase/server";
import LandingPage from "@/components/public/LandingPage";

export default async function Home() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  if (hasSupabaseAuthCookies(cookieStore.getAll())) {
    return <AuthRecoveryGate />;
  }

  return <LandingPage />;
}
