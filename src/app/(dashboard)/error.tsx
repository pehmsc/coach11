"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard.error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
      <div className="bg-white rounded-xl shadow-sm p-8 max-w-md w-full">
        <div className="text-4xl mb-4">&#9888;&#65039;</div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Algo correu mal
        </h2>
        <p className="text-slate-500 mb-6 text-sm">
          Ocorreu um erro inesperado. Tenta novamente ou contacta o suporte se o
          problema persistir.
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
