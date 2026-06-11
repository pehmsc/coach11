#!/usr/bin/env bash
# Camada DB do regression pack (Bloco D): arranca um Postgres local limpo,
# aplica o baseline + migrations pós-baseline + fixtures e corre os testes
# pgTAP de supabase/tests/.
#
# O schema base do projecto é anterior às migrations (era dashboard), por isso
# o replay do zero é impossível — a fundação local é o baseline dump
# (supabase/baseline/schema.sql, regenerável com scripts/db/refresh-baseline.sh).
#
# O Supabase CLI aplica migrations automaticamente no arranque, o que falharia
# sem o baseline; o arranque é feito num workdir scratch só com o config.toml
# (sem migrations) e o resto é aplicado por psql pela ordem correcta.
#
# Nunca toca em produção: tudo corre contra 127.0.0.1:54322.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
BASELINE_DIR="$REPO_ROOT/supabase/baseline"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/supabase"
cp "$REPO_ROOT/supabase/config.toml" "$WORK/supabase/config.toml"
cp -R "$REPO_ROOT/supabase/tests" "$WORK/supabase/tests"

cd "$WORK"

echo "==> base local limpa"
supabase stop --no-backup >/dev/null 2>&1 || true
supabase db start

PSQL=(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1)

# Os default privileges locais (GRANT automatico a anon/authenticated/
# service_role em cada CREATE) dariam grants que producao nao tem — em
# producao os REVOKEs das migrations de hardening ja correram e o dump
# exprime o ACL final exacto. Suspende-los durante o restore garante
# fidelidade; repostos a seguir para as migrations pos-baseline se
# comportarem como em producao.
echo "==> suspender default privileges (fidelidade de ACLs)"
"${PSQL[@]}" <<'SQL'
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
SQL

echo "==> baseline ($(cat "$BASELINE_DIR/VERSION"))"
"${PSQL[@]}" -f "$BASELINE_DIR/schema.sql"

echo "==> repor default privileges"
"${PSQL[@]}" <<'SQL'
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
SQL

BASELINE_VERSION="$(cat "$BASELINE_DIR/VERSION")"
echo "==> migrations pos-baseline"
applied=0
for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  if [[ "$v" > "$BASELINE_VERSION" ]]; then
    echo "    $(basename "$f")"
    "${PSQL[@]}" -f "$f"
    applied=$((applied + 1))
  fi
done
echo "    ${applied} aplicadas"

echo "==> fixtures"
"${PSQL[@]}" -c "create extension if not exists pgtap;"
"${PSQL[@]}" -f "$BASELINE_DIR/fixtures.sql"

echo "==> pgTAP"
supabase test db
