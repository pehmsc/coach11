export function PublicRateLimitedState() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-white p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          Demasiados pedidos
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Este link público está temporariamente limitado. Tenta novamente
          dentro de instantes.
        </p>
      </div>
    </main>
  );
}
