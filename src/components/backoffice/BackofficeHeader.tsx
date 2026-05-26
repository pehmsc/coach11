"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearClientCaches } from "@/lib/query/cache-clear";
import { UserAvatar } from "@/components/layout/UserAvatar";

interface Props {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export function BackofficeHeader({ fullName, email, avatarUrl }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut().catch(() => null);
    clearClientCaches(queryClient);
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 text-slate-100">
      <div
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3"
        style={{ paddingTop: "calc(0.75rem + var(--coach11-top-inset, 0px))" }}
      >
        <Link
          href="/admin"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <ShieldCheck size={18} className="text-emerald-400" />
          <span className="text-white">Backoffice · Coach</span>
          <span className="-ml-1.5 text-emerald-400">11</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <p className="text-xs font-medium text-slate-100">
              {fullName || email || "Admin"}
            </p>
            {email && fullName ? (
              <p className="text-[10px] text-slate-400">{email}</p>
            ) : null}
          </div>
          <UserAvatar
            fullName={fullName}
            avatarUrl={avatarUrl}
            size="sm"
            className="size-8 border border-slate-700"
            fallbackClassName="bg-slate-700 text-slate-100"
          />
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-60"
            aria-label="Sair do backoffice"
          >
            <LogOut size={14} aria-hidden="true" />
            {signingOut ? "A sair..." : "Sair"}
          </button>
        </div>
      </div>
    </header>
  );
}
