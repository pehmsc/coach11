"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { GameStats } from "./types";

interface YellowCardAlertProps {
  yellowAlerts: GameStats[];
}

export function YellowCardAlert({ yellowAlerts }: YellowCardAlertProps) {
  if (yellowAlerts.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 text-sm">Alerta de cartões amarelos</p>
            <p className="text-amber-700 text-xs mt-0.5">
              {yellowAlerts
                .map((s) => `${s.player.first_name} ${s.player.last_name} (${s.amarelos}🟨)`)
                .join(", ")}{" "}
              — próximo do limite de suspensão.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
