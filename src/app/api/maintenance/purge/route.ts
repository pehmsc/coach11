import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computePurgeAction,
  isPurgeDryRun,
} from "@/lib/club/purge-decision";
import {
  listClubAgeGroupIds,
  snapshotClubDataCounts,
  purgeClubData,
} from "@/lib/club/purge-club-data";
import {
  sendPurgeWarningD30,
  sendPurgeWarningD53,
} from "@/lib/email/purge-warning-emails";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron diario de purga RGPD (Vercel Cron, 03:30 UTC).
 *
 * Para cada clube individual com purga agendada:
 * - envia o aviso devido (d30 a meio da janela, d53 a 7 dias do fim),
 *   idempotente via purge_warning_d30/d53_sent_at;
 * - executa purgas vencidas (data_purge_scheduled_at < now), com as regras
 *   de seguranca re-verificadas DENTRO da operacao;
 * - escreve gdpr_purge_audit (counts por tabela, zero PII).
 *
 * Kill-switch PURGE_DRY_RUN: por omissao a purga NAO elimina nada — regista
 * no audit log os counts que teria eliminado com dry_run=true. So o valor
 * literal "false" activa a eliminacao definitiva (decisao manual).
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = isPurgeDryRun(process.env.PURGE_DRY_RUN);
  const admin = createAdminClient();
  const now = new Date();

  const { data: candidates, error } = await admin
    .from("clubs")
    .select(
      "id, name, plan_type, subscription_status, stripe_customer_id, data_purge_scheduled_at, purge_warning_d30_sent_at, purge_warning_d53_sent_at, billing_email, pending_coordinator_email, pending_coordinator_name",
    )
    .eq("plan_type", "individual")
    .not("data_purge_scheduled_at", "is", null);

  if (error) {
    return NextResponse.json(
      { error: `Erro a carregar clubes: ${error.message}` },
      { status: 500 },
    );
  }

  let warnedD30 = 0;
  let warnedD53 = 0;
  let purged = 0;
  let simulated = 0;
  let failed = 0;

  for (const club of candidates || []) {
    try {
      const action = computePurgeAction(club, now);
      if (action === "none") continue;

      if (action === "warn_d30" || action === "warn_d53") {
        const recipient =
          club.billing_email || club.pending_coordinator_email || null;
        if (!recipient || !club.data_purge_scheduled_at) {
          failed += 1;
          continue;
        }
        const send =
          action === "warn_d30" ? sendPurgeWarningD30 : sendPurgeWarningD53;
        const { sent, warning } = await send({
          to: recipient,
          fullName: club.pending_coordinator_name,
          purgeScheduledAt: club.data_purge_scheduled_at,
        });
        if (!sent) {
          console.warn(
            `[purge-cron] aviso ${action} falhou para clube ${club.id}: ${warning}`,
          );
          failed += 1;
          continue;
        }
        const flagColumn =
          action === "warn_d30"
            ? "purge_warning_d30_sent_at"
            : "purge_warning_d53_sent_at";
        await admin
          .from("clubs")
          .update({ [flagColumn]: new Date().toISOString() })
          .eq("id", club.id);
        if (action === "warn_d30") warnedD30 += 1;
        else warnedD53 += 1;
        continue;
      }

      // action === "purge" — regras de seguranca re-verificadas DENTRO da
      // operacao, sobre uma leitura fresca (o estado pode ter mudado desde
      // o select inicial, e.g. reactivacao processada entretanto).
      const { data: fresh } = await admin
        .from("clubs")
        .select(
          "id, name, plan_type, subscription_status, stripe_customer_id, data_purge_scheduled_at",
        )
        .eq("id", club.id)
        .maybeSingle();

      const eligible =
        !!fresh &&
        fresh.plan_type === "individual" &&
        fresh.subscription_status !== "active" &&
        fresh.subscription_status !== "trialing" &&
        !!fresh.data_purge_scheduled_at &&
        new Date(fresh.data_purge_scheduled_at).getTime() <= now.getTime();

      if (!eligible) {
        console.warn(
          `[purge-cron] clube ${club.id} reprovou re-verificacao de seguranca — purga abortada`,
        );
        continue;
      }

      const ageGroupIds = await listClubAgeGroupIds(admin, fresh.id);
      const counts = await snapshotClubDataCounts(admin, fresh.id, ageGroupIds);

      // Rasto garantido: o audit e escrito MESMO quando a purga falha a
      // meio (eliminacao possivelmente parcial) — nunca pode haver
      // eliminacao sem registo. _status/_error vivem dentro do jsonb
      // deleted_counts para nao exigir migration.
      let purgeError: string | null = null;
      if (!dryRun) {
        try {
          await purgeClubData(admin, fresh.id, ageGroupIds);
        } catch (err) {
          purgeError =
            err instanceof Error ? err.message : "falha desconhecida";
          console.error(
            `[purge-cron] purga do clube ${fresh.id} falhou: ${purgeError}`,
          );
        }
      }

      const status = dryRun ? "simulated" : purgeError ? "failed" : "completed";
      const { error: auditErr } = await admin.from("gdpr_purge_audit").insert({
        club_id: fresh.id,
        club_name: fresh.name,
        stripe_customer_id: fresh.stripe_customer_id,
        trigger_reason: "subscription_canceled",
        scheduled_at: fresh.data_purge_scheduled_at,
        executed_at: new Date().toISOString(),
        dry_run: dryRun,
        deleted_counts: {
          ...counts,
          _status: status,
          ...(purgeError ? { _error: purgeError } : {}),
        },
      });
      if (auditErr) {
        // Audit e prova de conformidade — falha tem de ficar visivel
        console.error(
          `[purge-cron] ERRO ao escrever audit do clube ${fresh.id}: ${auditErr.message}`,
        );
      }

      if (purgeError || auditErr) {
        // Agendamento fica activo: o proximo cron volta a tentar (os deletes
        // sao idempotentes) e a purga so fecha com audit escrito. Purga bem
        // sucedida sem audit tambem NAO limpa — o retry de amanha conta
        // zeros e escreve o rasto em falta.
        failed += 1;
        continue;
      }

      if (dryRun) {
        simulated += 1;
      } else {
        // Limpa o agendamento para a purga nao se repetir no proximo cron.
        await admin
          .from("clubs")
          .update({
            data_purge_scheduled_at: null,
            purge_warning_d30_sent_at: null,
            purge_warning_d53_sent_at: null,
          })
          .eq("id", fresh.id);
        purged += 1;
      }
    } catch (err) {
      console.error(
        `[purge-cron] falha no clube ${club.id}: ${err instanceof Error ? err.message : "desconhecida"}`,
      );
      failed += 1;
    }
  }

  return NextResponse.json({
    dryRun,
    candidates: candidates?.length ?? 0,
    warnedD30,
    warnedD53,
    purged,
    simulated,
    failed,
  });
}
