import Link from "next/link";

export default function InvitePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // aceita code, inviteCode, invite_code (qualquer um)
  const raw = (searchParams.code ??
    searchParams.inviteCode ??
    searchParams.invite_code ??
    "") as string;

  const code = decodeURIComponent(raw).trim().toUpperCase();

  const rawEmail = (searchParams.email ?? "") as string;
  const email = decodeURIComponent(rawEmail).trim();

  if (!code) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Convite inválido</h1>
        <p className="mt-2 text-sm text-slate-600">
          O link não traz o código. Pede ao coordenador para reenviar.
        </p>

        {/* Debug útil (podes remover depois) */}
        <pre className="mt-4 rounded-xl bg-slate-100 p-3 text-xs overflow-auto">
          {JSON.stringify(searchParams, null, 2)}
        </pre>

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
