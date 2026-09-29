import { differenceInCalendarDays, addDays, format } from 'date-fns'
import { dataLocal } from './formato'

export interface SituacaoPrazo {
  /** Há dados suficientes para calcular. */
  definido: boolean
  decorridos: number
  total: number
  restantes: number
  /** 0–100, limitado. */
  percentual: number
  atrasado: boolean
  termino: string | null
}

/**
 * Prazo da obra: dias decorridos desde o início sobre o prazo total.
 * O total vem de `prazo_dias`; sem ele, da diferença até `previsao_termino`.
 */
export function calcularPrazo(
  obra: { data_inicio: string | null; prazo_dias: number | null; previsao_termino: string | null },
  hoje: Date = new Date(),
): SituacaoPrazo {
  const inicio = dataLocal(obra.data_inicio)
  const previsao = dataLocal(obra.previsao_termino)
  let total = obra.prazo_dias ?? null
  if ((total === null || total <= 0) && inicio && previsao) {
    total = differenceInCalendarDays(previsao, inicio)
  }
  if (!inicio || !total || total <= 0) {
    return { definido: false, decorridos: 0, total: 0, restantes: 0, percentual: 0, atrasado: false, termino: obra.previsao_termino }
  }
  const decorridos = Math.max(0, differenceInCalendarDays(hoje, inicio))
  const termino = previsao ?? addDays(inicio, total)
  const restantes = differenceInCalendarDays(termino, hoje)
  return {
    definido: true,
    decorridos,
    total,
    restantes,
    percentual: Math.min(100, Math.round((decorridos / total) * 100)),
    atrasado: restantes < 0,
    termino: format(termino, 'yyyy-MM-dd'),
  }
}

/** Previsão de término a partir do início e do prazo em dias. */
export function previsaoPorPrazo(inicio: string | null, prazoDias: number | null): string | null {
  const d = dataLocal(inicio)
  if (!d || !prazoDias || prazoDias <= 0) return null
  return format(addDays(d, prazoDias), 'yyyy-MM-dd')
}
