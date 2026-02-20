"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function InvitePage({
  searchParams,
}: {
  searchParams: { code?: string; email?: string };
}) {
  const code = (searchParams.code ?? "").trim();
  const email = (searchParams.email ?? "").trim();

  useEffect(() => {
    if (code) localStorage.setItem("inviteCode", code);
    if (email) localStorage.setItem("inviteEmail", email);
  }, [code, email]);

  if (!code) return <div>Convite inválido</div>;

  const qs = new URLSearchParams();
  qs.set("code", code);
  if (email) qs.set("email", email);

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">
        Convite Coach<span className="text-emerald-500">11</span>
      </h1>

      <div className="mt-4 rounded-xl border p-4 bg-white">
        <div className="text-xs text-slate-500">Código</div>
        <div className="font-mono text-lg font-extrabold tracking-widest">
          {code}
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        <Link
          className="rounded-xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white"
          href={`/register?${qs.toString()}`}
        >
          Criar conta e aceitar →
        </Link>

        <Link
          className="rounded-xl border px-4 py-3 text-center font-semibold"
          href={`/login?${qs.toString()}`}
        >
          Já tenho conta — entrar →
        </Link>
      </div>
    </main>
  );
}
