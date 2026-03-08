"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-PT">
      <body className="min-h-screen bg-slate-950 text-slate-50">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
          <p className="text-sm uppercase tracking-[0.24em] text-red-300">
            Erro inesperado
          </p>
          <h1 className="mt-4 text-3xl font-semibold">
            Ocorreu um problema ao carregar a aplicação.
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            O erro foi registado para análise. Tenta novamente.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-8 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-emerald-400"
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
