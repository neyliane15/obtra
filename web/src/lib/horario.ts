/** 'HH:MM' ou 'HH:MM:SS' → minutos desde 00:00. */
export function paraMinutos(h: string | null | undefined): number | null {
  if (!h) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(h)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh > 23 || mm > 59) return null
  return hh * 60 + mm
}

/**
 * Minutos trabalhados: (saída − entrada) − (fim − início do intervalo).
 * Aceita virada de meia-noite na jornada. Intervalo incompleto é ignorado.
 */
export function minutosTrabalhados(
  entrada: string | null | undefined,
  saida: string | null | undefined,
  intervaloInicio?: string | null,
  intervaloFim?: string | null,
): number | null {
  const e = paraMinutos(entrada)
  const s = paraMinutos(saida)
  if (e === null || s === null) return null
  let total = s - e
  if (total < 0) total += 24 * 60
  const ii = paraMinutos(intervaloInicio)
  const ifi = paraMinutos(intervaloFim)
  if (ii !== null && ifi !== null && ifi > ii) total -= ifi - ii
  return Math.max(0, total)
}

/** 480 → "08h00". */
export function formatarDuracao(min: number | null): string {
  if (min === null) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`
}
