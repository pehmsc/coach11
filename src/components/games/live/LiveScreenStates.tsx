import { AlertCircle } from "lucide-react";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Skeleton } from "@/components/ui/skeleton";

type LockedStateProps = {
  backHref: string;
};

type ErrorStateProps = {
  message: string;
};

export function LiveLoadingState() {
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-32 w-full rounded-xl" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function LiveErrorState({ message }: ErrorStateProps) {
  return (
    <div className="p-4 text-center py-16">
      <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
      <p className="text-slate-700">{message}</p>
    </div>
  );
}

export function LiveLockedState({ backHref }: LockedStateProps) {
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <StickyBackLink
        href={backHref}
        label="Voltar"
        wrapperClassName="-mx-4 mb-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8"
      />
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
        O live deste jogo só fica disponível 10 minutos antes do início.
      </div>
    </div>
  );
}
