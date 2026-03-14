"use client";

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { SortDir } from "./types";

export function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={12} className="opacity-40" />;
  return dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
}
