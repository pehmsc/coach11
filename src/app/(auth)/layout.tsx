export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <p className="text-4xl font-bold">
            <span className="text-slate-900">COACH</span>
            <span className="text-emerald-600">11</span>
          </p>
          <p className="text-slate-500 text-sm mt-1">
            Plataforma de gestão desportiva
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
