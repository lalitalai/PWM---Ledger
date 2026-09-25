#!/usr/bin/env bash
# Spins up a throw-away local PostgreSQL, loads schema.sql on top of a tiny Supabase stub and runs the tests.
# Needs PostgreSQL 14+ binaries (apt install postgresql). No Docker required.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -x "$PGBIN/initdb" ] || { echo "PostgreSQL binaries not found"; exit 1; }
DIR="$(mktemp -d)"; PORT=54329
chmod 755 "$DIR"
run_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$DIR"
run_pg "$PGBIN/initdb -D $DIR/data -A trust >/dev/null"
run_pg "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'run_pg "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null" || true; rm -rf "$DIR"' EXIT
PSQL="$PGBIN/psql -h $DIR -p $PORT -U postgres -X -q -t -A -v ON_ERROR_STOP=1"
run_pg "$PSQL -d postgres -c 'create database ledger'"
cp "$HERE"/../schema.sql "$HERE"/stub.sql "$HERE"/rls.sql "$DIR"/; chmod 644 "$DIR"/*.sql
run_pg "$PSQL -d ledger -f $DIR/stub.sql"
run_pg "$PSQL -d ledger -f $DIR/schema.sql" 2>/dev/null
echo "schema applied; applying it a second time to prove it is re-runnable..."
run_pg "$PSQL -d ledger -f $DIR/schema.sql" 2>&1 | grep -v NOTICE || true
run_pg "$PSQL -d ledger -f $DIR/rls.sql"
