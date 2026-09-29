#!/usr/bin/env bash
# Sobe um Postgres descartável para rodar a suíte de banco.
#
# Por que existe: as migrações do Obtra dependem de RLS, de triggers e de
# funções SECURITY DEFINER. Nada disso se prova lendo SQL — é preciso um banco
# de verdade, com troca de usuário. Este script cria um cluster do zero, então
# pode ser rodado em máquina limpa e num container recém-criado.
#
# Uso: supabase/testes/preparar-postgres.sh   (idempotente)
set -euo pipefail

VERSAO="${PG_VERSAO:-16}"
BIN="/usr/lib/postgresql/$VERSAO/bin"
DONO="${PG_DONO:-pg}"
BASE="/home/$DONO"
DADOS="$BASE/pgdata"
SOCK="$BASE/sock"

[ -d "$BIN" ] || { echo "Postgres $VERSAO não encontrado em $BIN" >&2; exit 1; }

# O Postgres se recusa a rodar como root, daí o usuário dedicado.
id -u "$DONO" >/dev/null 2>&1 || useradd -m "$DONO"

comoDono() { su "$DONO" -c "PATH=$BIN:\$PATH $1"; }

if comoDono "pg_ctl -D $DADOS status" >/dev/null 2>&1; then
  echo "Postgres já está de pé em $SOCK"
else
  rm -rf "$DADOS" "$SOCK"
  mkdir -p "$SOCK"
  chown -R "$DONO" "$BASE"
  comoDono "initdb -D $DADOS -U postgres --auth=trust" >/dev/null
  # listen_addresses vazio: só socket local. Este banco é de teste e não tem
  # por que aceitar conexão de rede.
  comoDono "pg_ctl -D $DADOS -o '-k $SOCK -c listen_addresses=' -l $DADOS/log start -w" >/dev/null
  echo "Postgres $VERSAO no ar em $SOCK"
fi

echo "$SOCK"
