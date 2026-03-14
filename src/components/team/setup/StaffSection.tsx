"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Plus, Users } from "lucide-react";

interface StaffSectionProps {
  isSuperCoordinator: boolean;
}

export function StaffSection({ isSuperCoordinator }: StaffSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users size={16} /> Equipa Técnica
        </CardTitle>
        <CardDescription className="mt-1">
          {isSuperCoordinator
            ? "A tua conta super coordinator pode convidar staff sem limite neste escalão."
            : "Depois de criares o escalão, já podes convidar a equipa técnica a partir da área dedicada."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          {isSuperCoordinator
            ? "Os convites beta continuam separados e exclusivos das ferramentas admin."
            : "Coordenadores beta normais podem convidar a equipa técnica dentro da regra ativa do escalão."}
        </p>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <Link href="/staff">
            <Plus size={14} className="mr-1" /> Convidar
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
