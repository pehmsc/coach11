#!/usr/bin/env bash
# Regenera o baseline da camada DB a partir do schema REMOTO (schema-only,
# zero dados — sem PII). Correr depois de novas migrations chegarem a
# produção via "npx supabase db push"; commitar schema.sql + VERSION.
#
# Usa as credenciais guardadas pelo "supabase link" (pode pedir a password
# da base se não estiverem no keychain).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

supabase db dump --linked -f supabase/baseline/schema.sql

latest="$(basename "$(ls supabase/migrations/*.sql | tail -1)" | cut -d_ -f1)"
echo "$latest" > supabase/baseline/VERSION

echo "Baseline actualizado para a versao $latest"
echo "Commitar: supabase/baseline/schema.sql + supabase/baseline/VERSION"
