import { cn } from "@/lib/utils";

type LiveScoreboardCardProps = {
  matchMetaLabel: string;
  homeShortName: string;
  awayShortName: string;
  scoreHome: number;
  scoreAway: number;
  clockSeconds: number;
  currentMinute: number;
  isFinalized: boolean;
  formatClock: (totalSeconds: number) => string;
  className?: string;
};

export function LiveScoreboardCard({
  matchMetaLabel,
  homeShortName,
  awayShortName,
  scoreHome,
  scoreAway,
  clockSeconds,
  currentMinute,
  isFinalized,
  formatClock,
  className,
}: LiveScoreboardCardProps) {
  return (
    <div className={cn("rounded-2xl bg-slate-900 p-5 text-center text-white mb-5", className)}>
      <p className="text-slate-300 text-sm mb-1">{matchMetaLabel}</p>
      <div className="text-3xl md:text-4xl font-black tracking-tight">
        {homeShortName} {scoreHome} – {scoreAway} {awayShortName}
      </div>
      <p className="text-slate-300 text-sm mt-2" suppressHydrationWarning>
        {formatClock(clockSeconds)} · {currentMinute}&apos;
      </p>
      {isFinalized && (
        <span className="mt-2 inline-block text-xs bg-emerald-500 text-white px-3 py-0.5 rounded-full">
          Finalizado
        </span>
      )}
    </div>
  );
}
