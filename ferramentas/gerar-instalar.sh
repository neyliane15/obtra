#!/usr/bin/env bash
# Junta as migrações num único supabase/instalar.sql, para colar no SQL Editor.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAIDA="$RAIZ/supabase/instalar.sql"
{
  echo "-- Obtra — instalação completa do banco (gerado por ferramentas/gerar-instalar.sh)."
  echo "-- Cole TUDO no SQL Editor do Supabase e clique Run. Pode rodar de novo sem problema."
  for f in "$RAIZ"/supabase/migrations/*.sql; do
    echo; echo "-- ============================================================"
    echo "-- $(basename "$f")"
    echo "-- ============================================================"
    cat "$f"
  done
} > "$SAIDA"
echo "gerado $SAIDA"
