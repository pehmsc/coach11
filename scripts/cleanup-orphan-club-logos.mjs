#!/usr/bin/env node
/**
 * Limpeza pontual: remove 2 orfaos antigos do bucket club-logos
 * (10036f09.../logo.jpeg e 10036f09.../logo.png), criados pelo
 * caminho legacy {ageGroupId}/logo.{ext}. Apos a unificacao no
 * /api/club/logo, todos os ficheiros sao escritos em club-{clubId}/.
 *
 * Execucao: node --env-file=.env.local scripts/cleanup-orphan-club-logos.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PATHS = [
  "10036f09-4bf7-4198-9ddf-2ae8f79f418f/logo.jpeg",
  "10036f09-4bf7-4198-9ddf-2ae8f79f418f/logo.png",
];

const { data, error } = await admin.storage.from("club-logos").remove(PATHS);

if (error) {
  console.error("Erro ao apagar orfaos:", error);
  process.exit(1);
}

console.log("Removidos:", data?.map((d) => d.name) ?? []);

const { data: listing } = await admin.storage.from("club-logos").list("", { limit: 100 });
console.log("Conteudo actual do bucket club-logos (raiz):");
for (const entry of listing ?? []) {
  console.log(" -", entry.name);
}
