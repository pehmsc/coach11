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
}: LiveScoreboardCardProps) {
  return (
    <div className="rounded-2xl bg-slate-900 text-white p-5 mb-5 text-center">
      <p className="text-slate-300 text-sm mb-1">{matchMetaLabel}</p>
      <div className="text-3xl md:text-4xl font-black tracking-tight">
        {homeShortName} {scoreHome} – {scoreAway} {awayShortName}
      </div>
      <p className="text-slate-300 text-sm mt-2">
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
