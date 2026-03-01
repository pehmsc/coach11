"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuditLogItem = {
  id: string;
  actor_id: string | null;
  action: string;
  game_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  actor: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

export function AuditLogsAdminPanel() {
  const [actionFilter, setActionFilter] = useState("all");
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter]);

  async function loadLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("action", actionFilter);

      const res = await fetch(`/api/admin/audit-logs/list?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(payload?.error || "Não foi possível carregar os logs.");
        setLogs([]);
        return;
      }

      setLogs(Array.isArray(payload?.logs) ? (payload.logs as AuditLogItem[]) : []);
    } catch {
      toast.error("Erro de ligação ao carregar os logs.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity size={16} />
          Admin · Audit Logs
        </CardTitle>
        <CardDescription>
          Últimos 200 eventos auditáveis com filtro simples por ação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="space-y-1.5 block">
          <span className="text-sm font-medium text-slate-700">Ação</span>
          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="all">Todas</option>
            <option value="correct_locked_convocation">correct_locked_convocation</option>
            <option value="confirm_convocation">confirm_convocation</option>
            <option value="toggle_convocation_player">toggle_convocation_player</option>
            <option value="update_convocation_lineup">update_convocation_lineup</option>
            <option value="update_convocation_kits">update_convocation_kits</option>
            <option value="update_convocation_tactical">update_convocation_tactical</option>
          </select>
        </label>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            A carregar audit logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Sem logs para este filtro.
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{log.action}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {log.actor?.full_name || log.actor?.email || "Sistema"}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {new Date(log.created_at).toLocaleString("pt-PT")}
                  </p>
                </div>
                <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <p>Game ID: {log.game_id || "—"}</p>
                  <p>Actor ID: {log.actor_id || "—"}</p>
                </div>
                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">
                  {JSON.stringify(log.payload || {}, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
