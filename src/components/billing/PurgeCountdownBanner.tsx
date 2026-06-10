import Link from "next/link";

const DAY_MS = 86_400_000;

export function formatPurgeDateLisbon(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function purgeDaysLeft(iso: string, now: Date): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS),
  );
}

/**
 * Banner de aviso legal RGPD: conta decrescente ate a purga dos dados de uma
 * conta individual com subscricao cancelada. NAO e dispensavel — e um aviso
 * legal, nao uma notificacao de cortesia. Server component: a contagem e
 * calculada por request.
 */
export function PurgeCountdownBanner({ scheduledAt }: { scheduledAt: string }) {
  const target = new Date(scheduledAt);
  if (Number.isNaN(target.getTime())) return null;

  const daysLeft = purgeDaysLeft(scheduledAt, new Date());
  const dateLabel = formatPurgeDateLisbon(scheduledAt);

  return (
    <div role="alert" className="bg-red-600 px-4 py-3 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium leading-snug">
          Os teus dados serão eliminados a <strong>{dateLabel}</strong>
          {daysLeft > 0 ? (
            <>
              {" "}
              — faltam{" "}
              <strong>
                {daysLeft} {daysLeft === 1 ? "dia" : "dias"}
              </strong>
            </>
          ) : null}
          . Reactiva a subscrição para os manter.
        </p>
        <Link
          href="/billing/start"
          className="shrink-0 rounded-lg bg-white px-4 py-2 text-center text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          Reactivar subscrição
        </Link>
      </div>
    </div>
  );
}
