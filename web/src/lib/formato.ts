import { format, parseISO, isValid, formatDistanceToNowStrict } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** 1536 → "1,5 KB". Base 1024, pt-BR. */
export function formatarBytes(bytes: number, casas = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = Math.floor(Math.log(bytes) / Math.log(1024))
  i = Math.min(Math.max(i, 0), unidades.length - 1)
  const valor = bytes / 1024 ** i
  const c = i === 0 ? 0 : valor >= 100 ? 0 : casas
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })} ${unidades[i]}`
}

/** Percentual de uso, limitado entre 0 e 100. */
export function percentualUso(usado: number, limite: number): number {
  if (!limite || limite <= 0) return 0
  return Math.min(100, Math.max(0, (usado / limite) * 100))
}

/** Interpreta 'YYYY-MM-DD' como data local (sem deslocamento de fuso). */
export function dataLocal(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = iso.length === 10 ? parseISO(`${iso}T12:00:00`) : parseISO(iso)
  return isValid(d) ? d : null
}

export function formatarData(iso: string | null | undefined, padrao = 'dd/MM/yyyy'): string {
  const d = dataLocal(iso)
  return d ? format(d, padrao, { locale: ptBR }) : '—'
}

export function diaDaSemana(iso: string | null | undefined): string {
  const d = dataLocal(iso)
  return d ? format(d, 'EEEE', { locale: ptBR }) : ''
}

export function formatarDataExtensa(iso: string | null | undefined): string {
  return formatarData(iso, "d 'de' MMMM 'de' yyyy")
}

export function formatarRelativo(iso: string | null | undefined): string {
  const d = dataLocal(iso)
  return d ? formatDistanceToNowStrict(d, { locale: ptBR, addSuffix: true }) : ''
}

export function hojeISO(agora = new Date()): string {
  return format(agora, 'yyyy-MM-dd')
}

/** 'HH:MM:SS' → 'HH:MM' */
export function formatarHora(h: string | null | undefined): string {
  return h ? h.slice(0, 5) : ''
}

/** Código do relatório: 38 → "RD-38". */
export function codigoRelatorio(n: number): string {
  return `RD-${n}`
}

/** Nº do relatório com zeros à esquerda: 7 → "007". */
export function numeroRelatorio(n: number): string {
  return String(n).padStart(3, '0')
}

export function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const a = partes[0]?.[0] ?? ''
  const b = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (a + b).toUpperCase() || '?'
}

export function capitalizar(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

/** Só dígitos — para links de WhatsApp. Acrescenta 55 a números nacionais. */
export function telefoneWhatsApp(tel: string | null | undefined): string {
  const d = (tel ?? '').replace(/\D/g, '')
  if (!d) return ''
  return d.length <= 11 ? `55${d}` : d
}

/** Minúsculas sem acento, para busca. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Valor em reais. */
export function formatarMoeda(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? Number(v) : v
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Aceita "1.234,56", "1234.56" ou número; devolve número ou null. */
export function lerNumero(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = v.trim().replace(/\s/g, '').replace(/^R\$/, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
