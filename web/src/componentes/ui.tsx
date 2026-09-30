import {
  forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { CalendarDays, Clock, Loader2, X } from 'lucide-react'
import type { Tom } from '@/lib/rotulos'
import { iniciais } from '@/lib/formato'
import { useTitulo } from '@/lib/titulo'

/* ---------------------------------------------------------------- Botão -- */
type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'ambar' | 'claro'

const VARIANTES: Record<VarianteBotao, string> = {
  primario:
    'bg-marinho-900 text-white hover:bg-marinho-800 active:bg-marinho-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_1px_2px_rgb(6_18_42/0.3)]',
  secundario: 'bg-white text-marinho-900 border border-linha-forte hover:border-marinho-300 hover:bg-marinho-50',
  fantasma: 'text-tinta-suave hover:bg-marinho-50 hover:text-marinho-900',
  perigo: 'bg-perigo-600 text-white hover:brightness-110',
  ambar: 'bg-ambar-500 text-marinho-950 hover:bg-ambar-400',
  claro: 'bg-white/10 text-white border border-white/15 hover:bg-white/15',
}

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao
  tamanho?: 'p' | 'm' | 'g'
  carregando?: boolean
  icone?: ReactNode
  apenasIcone?: boolean
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  { variante = 'primario', tamanho = 'm', carregando, icone, apenasIcone, className, children, disabled, type = 'button', ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background,border,color,filter] duration-150 select-none',
        'disabled:opacity-55',
        tamanho === 'p' && (apenasIcone ? 'size-7' : 'h-7 px-2.5 text-xs'),
        tamanho === 'm' && (apenasIcone ? 'size-[34px]' : 'h-[34px] px-3.5 text-[12.5px]'),
        tamanho === 'g' && (apenasIcone ? 'size-10' : 'h-10 px-5 text-[13px]'),
        VARIANTES[variante],
        className,
      )}
      {...resto}
    >
      {carregando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : icone}
      {children}
    </button>
  )
})

/* ---------------------------------------------------------------- Campos -- */
export function Campo({
  rotulo, erro, dica, children, className, htmlFor, obrigatorio,
}: {
  rotulo: ReactNode
  erro?: string | null
  dica?: ReactNode
  children: ReactNode
  className?: string
  htmlFor?: string
  obrigatorio?: boolean
}) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="rotulo flex items-center gap-1">
        {rotulo}
        {obrigatorio && <span className="text-ambar-600" aria-hidden>*</span>}
      </label>
      {children}
      {erro ? (
        <p className="text-xs text-perigo-600" role="alert">{erro}</p>
      ) : dica ? (
        <p className="text-xs text-tinta-fraca">{dica}</p>
      ) : null}
    </div>
  )
}

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }>(
  function Entrada({ className, invalido, ...p }, ref) {
    return <input ref={ref} aria-invalid={invalido || undefined} className={clsx('campo', className)} {...p} />
  },
)

export const Selecao = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Selecao(
  { className, ...p }, ref,
) {
  return <select ref={ref} className={clsx('campo', className)} {...p} />
})

export const AreaTexto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function AreaTexto(
  { className, ...p }, ref,
) {
  return <textarea ref={ref} className={clsx('campo', className)} {...p} />
})

/* ----------------------------------------------------- Data e hora -- */
/*
 * O <input type="date|time"> nativo mostra o formato do idioma do NAVEGADOR
 * (mm/dd/aaaa, 07:00 PM…), não o da página. Estes campos mostram sempre
 * dd/mm/aaaa e 24 h, aceitam digitação só com números e mantêm o seletor
 * nativo de calendário no botão ao lado.
 */
function isoParaBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
function brParaIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br)
  if (!m) return null
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const data = new Date(a, mes - 1, d)
  if (a < 1900 || data.getFullYear() !== a || data.getMonth() !== mes - 1 || data.getDate() !== d) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}
function mascaraData(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

interface PropsData {
  valor: string
  aoMudar: (iso: string) => void
  id?: string
  readOnly?: boolean
  disabled?: boolean
  invalido?: boolean
  min?: string
  max?: string
  className?: string
  'aria-label'?: string
}

export function EntradaData({ valor, aoMudar, id, readOnly, disabled, invalido, min, max, className, ...aria }: PropsData) {
  const [texto, setTexto] = useState(() => isoParaBr(valor))
  const [erro, setErro] = useState(false)
  const nativo = useRef<HTMLInputElement>(null)
  const focado = useRef(false)
  useEffect(() => {
    if (!focado.current) setTexto(isoParaBr(valor))
  }, [valor])
  const bloqueado = readOnly || disabled
  return (
    <div className={clsx('relative', className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={texto}
        readOnly={readOnly}
        disabled={disabled}
        aria-invalid={invalido || erro || undefined}
        aria-label={aria['aria-label']}
        className="campo num pr-9"
        onFocus={() => (focado.current = true)}
        onChange={(e) => {
          const t = mascaraData(e.target.value)
          setTexto(t)
          setErro(false)
          if (!t) aoMudar('')
          const iso = brParaIso(t)
          if (iso) aoMudar(iso)
        }}
        onBlur={() => {
          focado.current = false
          if (!texto) return
          const iso = brParaIso(texto)
          if (!iso) {
            setErro(true)
            setTimeout(() => {
              setErro(false)
              setTexto(isoParaBr(valor))
            }, 1200)
          }
        }}
      />
      <input
        ref={nativo}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={valor}
        min={min}
        max={max}
        onChange={(e) => {
          aoMudar(e.target.value)
          setTexto(isoParaBr(e.target.value))
        }}
        className="pointer-events-none absolute right-0 bottom-0 h-px w-px opacity-0"
      />
      <button
        type="button"
        disabled={bloqueado}
        onClick={() => {
          const el = nativo.current as (HTMLInputElement & { showPicker?: () => void }) | null
          try {
            el?.showPicker?.()
          } catch {
            el?.click()
          }
        }}
        className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded text-tinta-fraca hover:bg-marinho-50 hover:text-marinho-700 disabled:pointer-events-none disabled:opacity-60"
        aria-label="Abrir calendário"
        title="Abrir calendário"
      >
        <CalendarDays className="size-3.5" />
      </button>
    </div>
  )
}

function mascaraHora(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`
}
/** "7" → "07:00", "730" → "07:30", "0715" → "07:15"; inválida → null. */
export function completarHora(t: string): string | null {
  const d = t.replace(/\D/g, '')
  if (!d) return ''
  let h: number, m: number
  if (d.length <= 2) [h, m] = [Number(d), 0]
  else if (d.length === 3) [h, m] = [Number(d.slice(0, 1)), Number(d.slice(1))]
  else [h, m] = [Number(d.slice(0, 2)), Number(d.slice(2, 4))]
  if (h > 23 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function EntradaHora({
  valor, aoMudar, id, readOnly, disabled, className, ...aria
}: { valor: string; aoMudar: (hhmm: string) => void; id?: string; readOnly?: boolean; disabled?: boolean; className?: string; 'aria-label'?: string }) {
  const [texto, setTexto] = useState(valor)
  const [erro, setErro] = useState(false)
  const focado = useRef(false)
  useEffect(() => {
    if (!focado.current) setTexto(valor)
  }, [valor])
  function passo(delta: number) {
    const [h, m] = (completarHora(texto) || '00:00').split(':').map(Number)
    const total = ((h! * 60 + m! + delta) % 1440 + 1440) % 1440
    const novo = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    setTexto(novo)
    aoMudar(novo)
  }
  return (
    <div className={clsx('relative', className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="--:--"
        maxLength={5}
        value={texto}
        readOnly={readOnly}
        disabled={disabled}
        aria-invalid={erro || undefined}
        aria-label={aria['aria-label']}
        title="Hora no formato 24 h (↑/↓ ajusta de 15 em 15 min)"
        className="campo num pr-8 font-mono !text-[12.5px] tracking-wide"
        onFocus={() => (focado.current = true)}
        onKeyDown={(e) => {
          if (readOnly || disabled) return
          if (e.key === 'ArrowUp') { e.preventDefault(); passo(15) }
          if (e.key === 'ArrowDown') { e.preventDefault(); passo(-15) }
        }}
        onChange={(e) => {
          const t = mascaraHora(e.target.value)
          setTexto(t)
          setErro(false)
          if (!t) aoMudar('')
          else if (t.length === 5) {
            const c = completarHora(t)
            if (c) aoMudar(c)
          }
        }}
        onBlur={() => {
          focado.current = false
          const c = completarHora(texto)
          if (c === null) {
            setErro(true)
            setTimeout(() => {
              setErro(false)
              setTexto(valor)
            }, 1200)
          } else {
            setTexto(c)
            if (c !== valor) aoMudar(c)
          }
        }}
      />
      <Clock className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-tinta-fraca" aria-hidden />
    </div>
  )
}

export function CampoData({
  rotulo, erro, dica, obrigatorio, className, ...p
}: PropsData & { rotulo: string; erro?: string | null; dica?: ReactNode; obrigatorio?: boolean }) {
  const id = useId()
  return (
    <Campo rotulo={rotulo} erro={erro} dica={dica} htmlFor={id} obrigatorio={obrigatorio} className={className}>
      <EntradaData id={id} invalido={!!erro} {...p} />
    </Campo>
  )
}

export function CampoHora({
  rotulo, className, ...p
}: { rotulo: string; valor: string; aoMudar: (v: string) => void; readOnly?: boolean; className?: string }) {
  const id = useId()
  return (
    <Campo rotulo={rotulo} htmlFor={id} className={className}>
      <EntradaHora id={id} {...p} />
    </Campo>
  )
}

/** Campo com rótulo já ligado ao input. */
export function CampoTexto({
  rotulo, erro, dica, obrigatorio, className, ...p
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: string | null; dica?: ReactNode; obrigatorio?: boolean }) {
  const id = useId()
  return (
    <Campo rotulo={rotulo} erro={erro} dica={dica} htmlFor={id} obrigatorio={obrigatorio} className={className}>
      <Entrada id={id} invalido={!!erro} required={obrigatorio} {...p} />
    </Campo>
  )
}

export function Interruptor({
  ligado, aoMudar, rotulo, descricao, desabilitado,
}: {
  ligado: boolean
  aoMudar: (v: boolean) => void
  rotulo: string
  descricao?: string
  desabilitado?: boolean
}) {
  return (
    <label className={clsx('flex items-start gap-3', desabilitado ? 'opacity-60' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        disabled={desabilitado}
        onClick={() => aoMudar(!ligado)}
        className={clsx(
          'relative mt-0.5 h-[18px] w-[32px] shrink-0 rounded-full border transition-colors',
          ligado ? 'border-marinho-700 bg-marinho-700' : 'border-linha-forte bg-linha',
        )}
      >
        <span
          className={clsx(
            'absolute top-[2px] size-3 rounded-full bg-white shadow transition-transform',
            ligado ? 'translate-x-[15px]' : 'translate-x-[2px]',
          )}
        />
      </button>
      <span className="flex flex-col">
        <span className="text-[12.5px] font-medium text-tinta">{rotulo}</span>
        {descricao && <span className="text-xs text-tinta-fraca">{descricao}</span>}
      </span>
    </label>
  )
}

/* --------------------------------------------------------------- Selo -- */
const TONS: Record<Tom, string> = {
  marinho: 'bg-marinho-50 text-marinho-700 ring-marinho-200',
  ambar: 'bg-ambar-50 text-ambar-700 ring-ambar-100',
  ok: 'bg-ok-50 text-ok-600 ring-ok-600/20',
  perigo: 'bg-perigo-50 text-perigo-600 ring-perigo-600/20',
  aviso: 'bg-aviso-50 text-aviso-600 ring-aviso-600/20',
  neutro: 'bg-papel text-tinta-suave ring-linha-forte',
}
const PONTOS: Record<Tom, string> = {
  marinho: 'bg-marinho-500',
  ambar: 'bg-ambar-500',
  ok: 'bg-ok-600',
  perigo: 'bg-perigo-600',
  aviso: 'bg-aviso-600',
  neutro: 'bg-tinta-fraca',
}

export function Selo({ tom = 'neutro', children, ponto = true, className }: { tom?: Tom; children: ReactNode; ponto?: boolean; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex h-[20px] items-center gap-1.5 rounded-full px-2 text-[10.5px] font-semibold tracking-wide whitespace-nowrap ring-1 ring-inset',
        TONS[tom],
        className,
      )}
    >
      {ponto && <span className={clsx('size-1.5 rounded-full', PONTOS[tom])} aria-hidden />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------- Cartão -- */
export function Cartao({
  children, className, titulo, acao, codigo, semPadding, marcas,
}: {
  children: ReactNode
  className?: string
  titulo?: ReactNode
  acao?: ReactNode
  /** pequeno código técnico no canto (ex.: "A-01") */
  codigo?: string
  semPadding?: boolean
  marcas?: boolean
}) {
  return (
    <section className={clsx('cartao', marcas && 'cantoneiras', className)}>
      {(titulo || acao) && (
        <header className="flex items-center justify-between gap-3 border-b border-linha px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {codigo && <span className="font-mono text-[10px] font-medium text-marinho-400">{codigo}</span>}
            <h2 className="truncate font-display text-[13.5px] font-bold text-marinho-900">{titulo}</h2>
          </div>
          {acao}
        </header>
      )}
      <div className={clsx(!semPadding && 'p-4')}>{children}</div>
    </section>
  )
}

/* ---------------------------------------------------- Cabeçalho página -- */
export function CabecalhoPagina({
  titulo, subtitulo, acoes, sobretitulo, voltar, tituloAba,
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  acoes?: ReactNode
  sobretitulo?: ReactNode
  voltar?: ReactNode
  /** título da aba do navegador (padrão: o título, se for texto) */
  tituloAba?: string
}) {
  useTitulo(tituloAba ?? (typeof titulo === 'string' ? titulo : undefined))
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between anim-subir">
      <div className="min-w-0">
        {voltar}
        {sobretitulo && (
          <div className="rotulo mb-1.5 flex items-center gap-2 text-marinho-500">
            <span className="h-px w-5 bg-ambar-500" aria-hidden />
            {sobretitulo}
          </div>
        )}
        <h1 className="truncate font-display text-2xl font-extrabold text-marinho-900 sm:text-[26px]">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-[12.5px] text-tinta-suave">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}

/* -------------------------------------------------------------- Vazio -- */
export function Vazio({
  titulo, descricao, acao, icone, compacto,
}: {
  titulo: string
  descricao?: ReactNode
  acao?: ReactNode
  icone?: ReactNode
  compacto?: boolean
}) {
  return (
    <div
      className={clsx(
        'milimetrado cantoneiras flex flex-col items-center justify-center rounded-lg border border-dashed border-linha-forte text-center',
        compacto ? 'px-4 py-8' : 'px-6 py-14',
      )}
    >
      <div className="relative mb-4">
        <svg width="88" height="64" viewBox="0 0 88 64" fill="none" aria-hidden className="text-marinho-300">
          <path d="M4 58h80" stroke="currentColor" strokeDasharray="3 3" />
          <path d="M14 58V26l16-10 16 10v32" stroke="currentColor" />
          <path d="M46 58V34h26v24" stroke="currentColor" />
          <path d="M24 58V44h12v14" stroke="currentColor" />
          <path d="M52 40h6M62 40h6M52 48h6M62 48h6" stroke="currentColor" />
          <path d="M8 22v-8M8 8v2M4 14h8" stroke="#F29A2E" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="76" cy="14" r="5" stroke="currentColor" strokeDasharray="2 2" />
        </svg>
        {icone && (
          <span className="absolute -right-3 -bottom-1 flex size-7 items-center justify-center rounded-full border border-linha bg-white text-marinho-600 shadow-suave">
            {icone}
          </span>
        )}
      </div>
      <p className="font-display text-[14px] font-bold text-marinho-900">{titulo}</p>
      {descricao && <p className="mt-1 max-w-sm text-[12.5px] text-tinta-suave">{descricao}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}

/* ---------------------------------------------------------- Esqueleto -- */
export function Esqueleto({ className }: { className?: string }) {
  return <div className={clsx('esqueleto', className)} aria-hidden />
}

export function CarregandoPagina({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-tinta-fraca" role="status">
      <Loader2 className="size-5 animate-spin text-marinho-500" />
      <span className="rotulo">{texto}</span>
    </div>
  )
}

/* ---------------------------------------------------------- Progresso -- */
export function Progresso({
  valor, tom = 'marinho', className, altura = 6, rotuloAcessivel,
}: {
  valor: number
  tom?: 'marinho' | 'ambar' | 'perigo' | 'ok'
  className?: string
  altura?: number
  rotuloAcessivel?: string
}) {
  const cor = { marinho: 'bg-marinho-600', ambar: 'bg-ambar-500', perigo: 'bg-perigo-600', ok: 'bg-ok-600' }[tom]
  const v = Math.max(0, Math.min(100, valor))
  return (
    <div
      className={clsx('relative w-full overflow-hidden rounded-full bg-marinho-50 ring-1 ring-inset ring-linha', className)}
      style={{ height: altura }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={rotuloAcessivel}
    >
      <div className={clsx('h-full rounded-full transition-[width] duration-500', cor)} style={{ width: `${v}%` }} />
    </div>
  )
}

/* -------------------------------------------------------------- Abas -- */
export function Abas<T extends string>({
  abas, atual, aoMudar, className,
}: {
  abas: { id: T; rotulo: string; icone?: ReactNode; contagem?: number }[]
  atual: T
  aoMudar: (id: T) => void
  className?: string
}) {
  return (
    <div className={clsx('rolagem-fina -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <div role="tablist" className="flex min-w-max gap-1 border-b border-linha">
        {abas.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={a.id === atual}
            onClick={() => aoMudar(a.id)}
            className={clsx(
              'relative -mb-px flex h-10 items-center gap-1.5 px-3 text-[12.5px] font-medium transition-colors',
              a.id === atual ? 'text-marinho-900' : 'text-tinta-fraca hover:text-marinho-700',
            )}
          >
            {a.icone}
            {a.rotulo}
            {a.contagem !== undefined && (
              <span className={clsx('num rounded-full px-1.5 text-[10px] font-semibold', a.id === atual ? 'bg-marinho-900 text-white' : 'bg-marinho-50 text-tinta-suave')}>
                {a.contagem}
              </span>
            )}
            {a.id === atual && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-marinho-900" />}
            {a.id === atual && <span className="absolute right-2 -bottom-[3px] size-[5px] rotate-45 bg-ambar-500" />}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- Avatar -- */
export function Avatar({ nome, tamanho = 30, className }: { nome: string | null | undefined; tamanho?: number; className?: string }) {
  const paleta = ['#10294D', '#1E3A8A', '#173766', '#2B55B8', '#0B1F3A']
  let h = 0
  for (const c of nome ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (
    <span
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ring-2 ring-white', className)}
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.38, background: paleta[h % paleta.length] }}
      aria-hidden
    >
      {iniciais(nome)}
    </span>
  )
}

/* -------------------------------------------------------------- Modal -- */
export function Modal({
  aberto, aoFechar, titulo, descricao, children, rodape, largura = 'md', codigo,
}: {
  aberto: boolean
  aoFechar: () => void
  titulo: ReactNode
  descricao?: ReactNode
  children: ReactNode
  rodape?: ReactNode
  largura?: 'sm' | 'md' | 'lg' | 'xl'
  codigo?: string
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  // o pai costuma passar uma função nova a cada render: guardada numa ref, ela
  // não reabre o efeito (que devolveria o foco ao 1º campo a cada tecla)
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar
  useEffect(() => {
    if (!aberto) return
    const anterior = document.activeElement as HTMLElement | null
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar.current()
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setTimeout(() => {
      const c = caixa.current
      if (!c || c.contains(document.activeElement)) return // autoFocus já agiu
      const visivel = (el: HTMLElement) => el.offsetParent !== null && !(el as HTMLInputElement).disabled
      const foco =
        [...c.querySelectorAll<HTMLElement>('[data-corpo] :is(input:not([type=hidden]):not([type=file]):not([readonly]):not([aria-hidden]), select, textarea)')].find(visivel) ??
        c.querySelector<HTMLElement>('footer button:first-child') ??
        c.querySelector<HTMLElement>('button')
      foco?.focus()
    }, 20)
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
      anterior?.focus?.()
    }
  }, [aberto])
  if (!aberto) return null
  const larg = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[largura]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="anim-aparecer absolute inset-0 bg-marinho-950/45 backdrop-blur-[2px]" onClick={aoFechar} aria-hidden />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className={clsx(
          'cantoneiras anim-subir relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-flutuante ring-1 ring-marinho-900/10 [--cor-cantoneira:var(--color-marinho-200)] sm:rounded-2xl',
          larg,
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-gradient-to-r from-marinho-900 via-marinho-600 to-marinho-900" />
        <header className="flex items-start justify-between gap-5 border-b border-linha px-6 pt-7 pb-5 sm:px-8">
          <div className="min-w-0">
            {codigo && <div className="mb-2 font-mono text-[10px] tracking-[0.14em] text-marinho-400">{codigo}</div>}
            <h2 id={idTitulo} className="font-display text-[17px] font-bold leading-snug text-marinho-900">{titulo}</h2>
            {descricao && <p className="mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed text-tinta-suave">{descricao}</p>}
          </div>
          <Botao variante="fantasma" apenasIcone tamanho="p" onClick={aoFechar} aria-label="Fechar" icone={<X className="size-4" />} className="-mr-2 -mt-1" />
        </header>
        <div data-corpo className="rolagem-fina flex-1 overflow-y-auto px-6 py-6 sm:px-8">{children}</div>
        {rodape && (
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-linha bg-papel/60 px-6 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-b-2xl sm:px-8 sm:pb-5">
            {rodape}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ----------------------------------------------------- Linha de dados -- */
export function Dado({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      <dt className="rotulo">{rotulo}</dt>
      <dd className="text-[13px] text-tinta">{children || <span className="text-tinta-fraca">—</span>}</dd>
    </div>
  )
}

export function Erro({ mensagem, aoTentar }: { mensagem: string; aoTentar?: () => void }) {
  return (
    <div className="rounded-lg border border-perigo-600/25 bg-perigo-50 px-4 py-3 text-[12.5px] text-perigo-600" role="alert">
      <strong className="font-semibold">Não foi possível carregar.</strong> {mensagem}
      {aoTentar && (
        <button className="ml-2 font-semibold underline underline-offset-2" onClick={aoTentar}>
          Tentar de novo
        </button>
      )}
    </div>
  )
}
