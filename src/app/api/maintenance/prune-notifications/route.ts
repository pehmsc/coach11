import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const dynamic = "force-dynamic";

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseRatio(value: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(value || "");
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

function getExpectedSecret() {
  return (
    process.env.NOTIFICATIONS_MAINTENANCE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.NOTIFICATIONS_PRUNE_SECRET?.trim() ||
    null
  );
}

function isAuthorized(request: Request, expectedSecret: string) {
  const authorization = request.headers.get("authorization")?.trim();
  const maintenanceSecret = request.headers.get("x-maintenance-secret")?.trim();
  return (
    authorization === `Bearer ${expectedSecret}` ||
    maintenanceSecret === expectedSecret
  );
}

async function runPrune(request: Request) {
  const expectedSecret = getExpectedSecret();
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Secret de manutenção não configurado." },
      { status: 500 },
    );
  }

  if (!isAuthorized(request, expectedSecret)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const ttlDays = parsePositiveInteger(process.env.NOTIFICATIONS_TTL_DAYS, 90);
    const maxDeleteRatio = parseRatio(process.env.NOTIFICATIONS_PRUNE_MAX_RATIO, 0.35);
    const ratioGuardMinTotal = parsePositiveInteger(
      process.env.NOTIFICATIONS_PRUNE_GUARD_MIN_TOTAL,
      100,
    );

    const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();
    const admin = createAdminClient();

    const [{ count: totalCount, error: totalError }, { count: candidateCount, error: candidateError }] =
      await Promise.all([
        admin.from("notifications").select("id", { count: "exact", head: true }),
        admin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .lt("created_at", cutoff),
      ]);

    if (totalError) {
      return respondInternalError("api.maintenance.prune-notifications.total", totalError);
    }
    if (candidateError) {
      return respondInternalError(
        "api.maintenance.prune-notifications.candidates",
        candidateError,
      );
    }

    const total = totalCount ?? 0;
    const candidates = candidateCount ?? 0;
    const deleteRatio = total > 0 ? candidates / total : 0;

    if (candidates === 0) {
      console.info("[notifications.prune]", {
        cutoff,
        ttlDays,
        total,
        candidates,
        deleted: 0,
      });

      return NextResponse.json({
        success: true,
        ttlDays,
        cutoff,
        total,
        candidates,
        deleted: 0,
      });
    }

    if (total >= ratioGuardMinTotal && deleteRatio > maxDeleteRatio) {
      console.warn("[notifications.prune.guard_blocked]", {
        cutoff,
        ttlDays,
        total,
        candidates,
        deleteRatio,
        maxDeleteRatio,
      });

      return NextResponse.json(
        {
          error: "Safety guard bloqueou o prune de notificações.",
          ttlDays,
          cutoff,
          total,
          candidates,
          deleteRatio,
          maxDeleteRatio,
        },
        { status: 409 },
      );
    }

    const { data, error } = await admin.rpc("prune_notifications_before", {
      p_cutoff: cutoff,
    });

    if (error) {
      return respondInternalError("api.maintenance.prune-notifications.delete", error);
    }

    const deleted = typeof data === "number" ? data : Number(data || 0);

    console.info("[notifications.prune]", {
      cutoff,
      ttlDays,
      total,
      candidates,
      deleted,
      deleteRatio,
      maxDeleteRatio,
    });

    return NextResponse.json({
      success: true,
      ttlDays,
      cutoff,
      total,
      candidates,
      deleted,
      deleteRatio,
      maxDeleteRatio,
    });
  } catch (error) {
    return respondInternalError("api.maintenance.prune-notifications", error);
  }
}

export async function GET(request: Request) {
  return runPrune(request);
}

export async function POST(request: Request) {
  return runPrune(request);
}
