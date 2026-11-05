#!/usr/bin/env bash
# Valida las migraciones de CARMO en un PostgreSQL LOCAL Y DESECHABLE, junto con el historial
# canónico del proyecto Supabase compartido (DERMAPEX + COAMO, repositorio ramonmorillo/dermapex):
#   1) stubs de Supabase y migraciones canónicas (estado equivalente al de producción),
#   2) migraciones de CARMO (supabase/migrations/*.sql),
#   3) baterías de DERMAPEX/COAMO (no regresión: CARMO no altera su comportamiento),
#   4) baterías de CARMO (db-tests/*.sql): RLS, aislamiento, integridad.
#
# Uso: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/carmo_test \
#      CANONICAL_DIR=../dermapex scripts/test-db.sh
# Se niega a ejecutarse contra Supabase.
set -euo pipefail
: "${DATABASE_URL:?Define DATABASE_URL con una base de datos local vacía}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*|*pooler.supabase*)
    echo "ERROR: DATABASE_URL apunta a Supabase. Solo bases locales desechables." >&2; exit 1;;
esac
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CANONICAL_DIR="$(cd "${CANONICAL_DIR:-$ROOT/../dermapex}" && pwd)"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)

if [ "$("${PSQL[@]}" -tAc "select count(*) from pg_namespace where nspname in ('auth','app_private','carmo_private')")" != "0" ]; then
  echo "ERROR: la base de datos no está vacía. Usa una base nueva." >&2; exit 1
fi

echo "→ Stubs locales de Supabase (canónico)"
"${PSQL[@]}" -f "$CANONICAL_DIR/db-tests/00_local_supabase_stubs.sql"
for m in "$CANONICAL_DIR"/supabase/migrations/*.sql; do echo "→ Canónica $(basename "$m")"; "${PSQL[@]}" -f "$m"; done
for m in "$ROOT"/supabase/migrations/*.sql; do echo "→ CARMO $(basename "$m")"; "${PSQL[@]}" -f "$m"; done
if [ "${SKIP_CANONICAL_TESTS:-0}" != "1" ]; then
  # Las baterías canónicas se ejecutan CON las tablas CARMO presentes (no regresión). Única adaptación,
  # en una copia temporal: el inventario de DERMAPEX (40_*) considera «tabla DERMAPEX» toda tabla de
  # public que no empiece por coag_; se amplía la exclusión a carmo_. El repositorio DERMAPEX no se
  # modifica (ver docs/CARMO_ARCHITECTURE.md §4.4, cambio pendiente de autorización en DERMAPEX).
  TMP_TESTS="$(mktemp -d)"
  trap 'rm -rf "$TMP_TESTS"' EXIT
  cp "$CANONICAL_DIR"/db-tests/[1-9]*.sql "$TMP_TESTS"/
  sed -i "s/c\.relname not like 'coag\\\\_%'/c.relname not like 'coag\\\\_%' and c.relname not like 'carmo\\\\_%'/g" "$TMP_TESTS"/*.sql
  for t in "$TMP_TESTS"/*.sql; do echo "→ No regresión $(basename "$t")"; "${PSQL[@]}" -f "$t"; done
fi
for t in "$ROOT"/db-tests/*.sql; do echo "→ Pruebas CARMO $(basename "$t")"; "${PSQL[@]}" -f "$t"; done
echo "✔ Todas las pruebas de base de datos superadas."
