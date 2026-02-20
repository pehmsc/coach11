"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function InviteClient() {
  const sp = useSearchParams();

  const raw =
    sp.get("code") ?? sp.get("inviteCode") ?? sp.get("invite_code") ?? "";

  const code = decodeURIComponent(raw).trim().toUpperCase();
  const email = decodeURIComponent(sp.get("email") ?? "").trim();

  useEffect(() => {
    if (code) localStorage.setItem("inviteCode", code);
    if (email) localStorage.setItem("inviteEmail", email);
  }, [code, email]);

  if (!code) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Convite inválido</h1>
        <p className="mt-2 text-sm text-slate-600">
          O link não traz o código. Pede ao coordenador para reenviar.
        </p>
        <Link className="mt-4 inline-block underline" href="/login">
          Ir para login
        </Link>
      </main>
    );
  }

  const qs = new URLSearchParams();
  qs.set("code", code);
  if (email) qs.set("email", email);

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-extrabold tracking-tight">
        Convite <span className="text-emerald-500">Coach11</span>
      </h1>

      <div className="mt-5 rounded-2xl border bg-white p-4">
        <p className="text-xs text-slate-500">Código</p>
        <p className="mt-1 font-mono text-lg font-extrabold tracking-widest">
          {code}
        </p>
        {email ? (
          <p className="mt-3 text-xs text-slate-500">
            Email do convite: <span className="font-medium">{email}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3">
        <Link
          href={`/register?${qs.toString()}`}
          className="rounded-2xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white"
        >
          Criar conta e aceitar →
        </Link>

        <Link
          href={`/login?${qs.toString()}`}
          className="rounded-2xl border px-4 py-3 text-center font-semibold"
        >
          Já tenho conta — entrar →
        </Link>
      </div>
    </main>
  );
}
