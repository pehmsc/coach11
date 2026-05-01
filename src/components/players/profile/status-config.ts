// Mantém-se em paralelo com a constante na page.tsx do plantel até a
// PR 2 unificar — entretanto duplicamos para não introduzir cross-file
// dependencies inesperadas no PR 1.
export const PLAYER_STATUS_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  active: { label: "Activo", color: "bg-emerald-100 text-emerald-700" },
  injured: { label: "Lesionado", color: "bg-orange-100 text-orange-700" },
  suspended: { label: "Suspenso", color: "bg-red-100 text-red-700" },
  inactive: { label: "Indisponível", color: "bg-slate-100 text-slate-500" },
};
