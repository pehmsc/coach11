"use client";

import { useEffect } from "react";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[auth.error]", error);
  }, [error]);

  return (
    <div className="text-center">
      <div className="bg-white rounded-xl shadow-sm p-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Erro de autenticacao
        </h2>
        <p className="text-slate-500 mb-4 text-sm">
          Ocorreu um erro. Tenta novamente.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
