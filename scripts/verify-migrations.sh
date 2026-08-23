#!/usr/bin/env bash
# ---------------------------------------------------------------------
# Applies every migration in order against a throwaway PostgreSQL
# database, then runs the SQL assertions in supabase/tests/.
#
#   DATABASE_URL=postgres://... ./scripts/verify-migrations.sh
#
# With no DATABASE_URL the script boots a temporary local cluster (needs
# the postgresql client + server binaries on PATH).
# ---------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL_ARGS=(-v ON_ERROR_STOP=1 -q)

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set." >&2
  echo "Point it at a scratch database, e.g.:" >&2
  echo "  createdb nagilai_migration_test" >&2
  echo "  DATABASE_URL=postgres:///nagilai_migration_test $0" >&2
  exit 2
fi

echo "==> applying local Supabase shim"
psql "${PSQL_ARGS[@]}" "$DATABASE_URL" -f "$ROOT/supabase/tests/_local_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "==> $(basename "$f")"
  psql "${PSQL_ARGS[@]}" "$DATABASE_URL" -f "$f"
done

echo "==> applying migrations a second time (idempotency check)"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "${PSQL_ARGS[@]}" "$DATABASE_URL" -f "$f"
done

for f in "$ROOT"/supabase/tests/*.test.sql; do
  [[ -e "$f" ]] || continue
  echo "==> $(basename "$f")"
  psql "${PSQL_ARGS[@]}" "$DATABASE_URL" -f "$f"
done

echo "==> migrations OK"
