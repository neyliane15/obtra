#!/usr/bin/env bash
# Sobe o Obtra inteiro na máquina, sem Docker e sem projeto na nuvem.
#
#   Postgres  ← migrações + carga demo + master (senha obtra123)
#   PostgREST ← a mesma API REST do Supabase, com a RLS valendo
#   portão    ← faz o papel do Kong + GoTrue + Storage (ferramentas/local/portao.mjs)
#
# Uso: ferramentas/local/subir.sh    (depois: npm run dev)
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BANCO="${BANCO:-obtra_app}"
SOCK="${SOCK:-/home/pg/sock}"
PORTA_REST="${PORTA_REST:-54330}"
PORTA_PORTAO="${PORTA_PORTAO:-54321}"
SEGREDO="${JWT_SEGREDO:-segredo-local-do-obtra-com-pelo-menos-32-caracteres}"
TMP="${TMPDIR:-/tmp}/obtra-local"
ARQUIVOS="$RAIZ/.local-storage"
mkdir -p "$TMP"

command -v postgrest >/dev/null 2>&1 || {
  echo "postgrest não está no PATH. Baixe o binário estático de" >&2
  echo "https://github.com/PostgREST/postgrest/releases e ponha em /usr/local/bin." >&2
  exit 1
}

"$RAIZ/supabase/testes/preparar-postgres.sh" >/dev/null

# Derruba o que estiver rodando (por pidfile, não por pkill -f).
for arquivo in "$TMP/postgrest.pid" "$TMP/portao.pid"; do
  [ -f "$arquivo" ] && kill "$(cat "$arquivo")" 2>/dev/null || true
  rm -f "$arquivo"
done
for porta in "$PORTA_REST" "$PORTA_PORTAO"; do
  for _ in $(seq 1 40); do
    (exec 3<>"/dev/tcp/127.0.0.1/$porta") 2>/dev/null || break
    exec 3<&- 3>&-
    sleep 0.25
  done
done

PSQL=(psql -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -q -X)
export PGOPTIONS="-c client_min_messages=warning"
echo "→ banco $BANCO do zero"
"${PSQL[@]}" -d postgres -c \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$BANCO';" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $BANCO;" -c "create database $BANCO;" >/dev/null
"${PSQL[@]}" -d "$BANCO" -f "$RAIZ/supabase/testes/00_ambiente_supabase.sql" >/dev/null
for f in "$RAIZ"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -d "$BANCO" -f "$f" >/dev/null
done
for f in "$RAIZ"/supabase/seed/*.sql; do
  echo "→ carga $(basename "$f")"
  "${PSQL[@]}" -d "$BANCO" -f "$f" >/dev/null
done
"${PSQL[@]}" -d "$BANCO" -f "$RAIZ/ferramentas/local/preparar.sql" >/dev/null
unset PGOPTIONS

# Banco novo = arquivos antigos órfãos.
rm -rf "$ARQUIVOS"
mkdir -p "$ARQUIVOS"

cat > "$TMP/postgrest.conf" <<CONF
db-uri = "postgres://authenticator@/$BANCO?host=$SOCK"
db-schemas = "public"
db-extra-search-path = "public, extensions"
db-anon-role = "anon"
jwt-secret = "$SEGREDO"
server-port = $PORTA_REST
server-host = "127.0.0.1"
db-pool = 10
CONF

postgrest "$TMP/postgrest.conf" > "$TMP/postgrest.log" 2>&1 &
echo $! > "$TMP/postgrest.pid"
JWT_SEGREDO="$SEGREDO" PORTA="$PORTA_PORTAO" POSTGREST="http://127.0.0.1:$PORTA_REST" \
  BANCO="$BANCO" SOCK="$SOCK" PASTA_ARQUIVOS="$ARQUIVOS" \
  nohup node "$RAIZ/ferramentas/local/portao.mjs" > "$TMP/portao.log" 2>&1 &
echo $! > "$TMP/portao.pid"

# A anon key é um JWT (role anon) assinado com o mesmo segredo — igual ao
# Supabase. Datas fixas: o .env.local não muda a cada subida.
ANON_KEY="$(SEGREDO="$SEGREDO" node -e '
const { createHmac } = require("node:crypto");
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const c = b({ alg: "HS256", typ: "JWT" }) + "." + b({ iss: "supabase-local", role: "anon", iat: 1767225600, exp: 4102444800 });
process.stdout.write(c + "." + createHmac("sha256", process.env.SEGREDO).update(c).digest("base64url"));
')"

pronto=nao
for _ in $(seq 1 60); do
  if curl -fsS -H "apikey: $ANON_KEY" "http://127.0.0.1:$PORTA_PORTAO/rest/v1/" >/dev/null 2>&1; then
    pronto=sim; break
  fi
  sleep 0.5
done
if [ "$pronto" != sim ]; then
  echo "a API não subiu. Fim dos logs:" >&2
  tail -5 "$TMP/postgrest.log" "$TMP/portao.log" >&2
  exit 1
fi

cat > "$RAIZ/.env.local" <<ENV
# Gerado por ferramentas/local/subir.sh — ambiente local, não é projeto de verdade.
VITE_SUPABASE_URL=http://127.0.0.1:$PORTA_PORTAO
VITE_SUPABASE_ANON_KEY=$ANON_KEY
ENV

# Fotos e capas da demonstração, pelo mesmo caminho do app.
SOCK="$SOCK" BANCO="$BANCO" node "$RAIZ/ferramentas/local/fotos-demo/carregar.mjs" \
  || echo "aviso: as fotos da demo não foram carregadas (o resto está no ar)" >&2

echo
echo "no ar:"
echo "  URL       http://127.0.0.1:$PORTA_PORTAO   (logs em $TMP)"
echo "  anon key  $ANON_KEY"
echo "  .env.local gravado em $RAIZ/.env.local"
echo
echo "  entrar (senha obtra123):"
echo "    master@obtra.app                      master"
echo "    admin@construtoraaurora.com.br        admin — Construtora Aurora"
echo "    engenheiro@construtoraaurora.com.br   colaborador — Construtora Aurora"
echo "    cliente@exemplo.com                   cliente — Residencial Vista Azul"
echo "    admin@betaengenharia.com.br           admin — Beta Engenharia"
echo
echo "agora: npm run dev    (prova de fumaça: node ferramentas/local/fumaca.mjs)"
