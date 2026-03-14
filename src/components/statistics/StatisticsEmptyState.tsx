"use client";

import { BarChart2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function StatisticsLoadingSkeleton() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export function StatisticsEmptyState() {
  return (
    <div className="p-4 md:p-8 text-center py-16">
      <BarChart2 size={40} className="text-slate-300 mx-auto mb-3" />
      <p className="text-slate-700 font-semibold mb-2">Sem dados disponíveis</p>
      <p className="text-slate-500 text-sm">
        Adiciona jogadores ao plantel para ver estatísticas.
      </p>
    </div>
  );
}
