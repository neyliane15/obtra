#!/usr/bin/env bash
# Aplica as migrações num Postgres local e roda a suíte de testes de banco.
# Uso: supabase/testes/executar.sh [socket]
#      (antes: supabase/testes/preparar-postgres.sh — o `npm run test:banco` faz os dois)
set -euo pipefail
SOCK="${1:-/home/pg/sock}"
BANCO="${BANCO:-obtra}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL=(psql -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -q -X)
# Migrações rodam sem os NOTICE de "already exists" da segunda passada.
export PGOPTIONS="-c client_min_messages=warning"

"${PSQL[@]}" -d postgres -c \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$BANCO';" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $BANCO;" -c "create database $BANCO;" >/dev/null
"${PSQL[@]}" -d "$BANCO" -f "$RAIZ/supabase/testes/00_ambiente_supabase.sql" >/dev/null

for f in "$RAIZ"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -d "$BANCO" -f "$f" >/dev/null
done

# A carga de demonstração, para provar que continua aplicável contra o schema.
if [ -z "${SEM_SEED:-}" ]; then
  for f in "$RAIZ"/supabase/seed/*.sql; do
    [ -e "$f" ] || continue
    echo "→ carga $(basename "$f")"
    "${PSQL[@]}" -d "$BANCO" -f "$f" >/dev/null
  done
fi

# As migrações DE NOVO, por cima do banco pronto e com carga: o `supabase db
# push` e o SQL Editor reaplicam sem dó. Migração que não aguenta a segunda
# passada derruba a suíte aqui, e não na produção.
echo "→ segunda passada das migrações (banco já pronto)"
for f in "$RAIZ"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$BANCO" -f "$f" >/dev/null
done

export PGOPTIONS=""
for f in "$RAIZ"/supabase/testes/[1-9]*.sql; do
  [ -e "$f" ] || continue
  echo "→ $(basename "$f")"
  # O prefixo "psql:arquivo:linha: NOTICE:" some das linhas de "ok"; erros
  # continuam com o local completo.
  "${PSQL[@]}" -d "$BANCO" -f "$f" 2>&1 | sed -u 's/^psql:[^ ]* NOTICE:  //'
  [ "${PIPESTATUS[0]}" -eq 0 ] || exit 1
done
echo "tudo passou"
