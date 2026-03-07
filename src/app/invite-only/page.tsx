"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { createClient } from "@/lib/supabase/client";
import { clearClientCaches } from "@/lib/query/cache-clear";

function InviteOnlyContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const reason = useMemo(() => searchParams.get("reason"), [searchParams]);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.signOut().catch(() => null).finally(() => {
      clearClientCaches(queryClient);
    });
  }, [queryClient]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <ShieldAlert size={28} />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">Beta por convite</h1>
        <p className="mt-3 text-sm text-slate-600">
          O acesso ao Coach11 nesta fase esta restrito a utilizadores convidados por email.
        </p>
        {reason === "beta_access_required" && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            O email autenticado nao tem um convite beta ativo.
          </p>
        )}
        <div className="mt-6 space-y-3 text-sm">
          <p className="text-slate-500">
            Se recebeste convite, entra com esse mesmo email ou usa o link enviado.
          </p>
          <div className="flex justify-center">
            <StickyBackLink
              href="/login"
              label="Voltar ao login"
              sticky={false}
              wrapperClassName="bg-transparent px-0 py-0"
            />
          </div>
        </div>
      </div>
    </main>
  );
}

export default function InviteOnlyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <InviteOnlyContent />
    </Suspense>
  );
}
