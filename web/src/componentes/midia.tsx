import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, Download, ImageOff, ImagePlus, Loader2, Trash2, X } from 'lucide-react'
import { useUrlAssinada } from '@/lib/armazenamento'
import { formatarData, plural } from '@/lib/formato'
import type { Foto } from '@/tipos/banco'
import { Botao, Progresso } from './ui'

/* ------------------------------------------------------ Imagem assinada -- */
export function ImagemAssinada({
  caminho, alt, className, classeImg, fallback,
}: {
  caminho: string | null | undefined
  alt: string
  className?: string
  classeImg?: string
  fallback?: ReactNode
}) {
  const { data: url, isLoading } = useUrlAssinada(caminho)
  const [carregou, setCarregou] = useState(false)
  const [falhou, setFalhou] = useState(false)
  if (!caminho || falhou || (!isLoading && !url)) {
    return (
      <div className={clsx('flex items-center justify-center bg-marinho-50 text-marinho-300', className)}>
        {fallback ?? <ImageOff className="size-5" aria-hidden />}
      </div>
    )
  }
  return (
    <div className={clsx('relative overflow-hidden bg-marinho-50', className)}>
      {!carregou && <div className="esqueleto absolute inset-0 rounded-none" />}
      {url && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setCarregou(true)}
          onError={() => setFalhou(true)}
          className={clsx('size-full object-cover transition-opacity duration-300', carregou ? 'opacity-100' : 'opacity-0', classeImg)}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------- Galeria -- */
export function Galeria({
  fotos, aoExcluir, aoLegendar, colunas = 'normal', vazio,
}: {
  fotos: Foto[]
  aoExcluir?: (f: Foto) => void
  aoLegendar?: (f: Foto, legenda: string) => void
  colunas?: 'normal' | 'compacta'
  vazio?: ReactNode
}) {
  const [aberta, setAberta] = useState<number | null>(null)
  if (!fotos.length) return <>{vazio}</>
  return (
    <>
      <ul
        className={clsx(
          'grid gap-2.5',
          colunas === 'normal' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
        )}
      >
        {fotos.map((f, i) => (
          <li key={f.id} className="group relative">
            <button
              type="button"
              onClick={() => setAberta(i)}
              className="block w-full overflow-hidden rounded-md border border-linha bg-white p-1 shadow-suave transition hover:border-marinho-300 hover:shadow-cartao"
              aria-label={`Ampliar foto${f.legenda ? `: ${f.legenda}` : ''}`}
            >
              <ImagemAssinada caminho={f.thumb_path} alt={f.legenda ?? 'Foto da obra'} className="aspect-[4/3] w-full rounded-[4px]" classeImg="transition-transform duration-500 group-hover:scale-[1.03]" />
            </button>
            {aoLegendar ? (
              <input
                defaultValue={f.legenda ?? ''}
                placeholder="Adicionar legenda…"
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v !== (f.legenda ?? '')) aoLegendar(f, v)
                }}
                className="mt-1 w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-tinta-suave placeholder:text-tinta-fraca hover:border-linha focus:border-marinho-300 focus:bg-white focus:outline-none"
                aria-label="Legenda da foto"
              />
            ) : (
              f.legenda && <p className="mt-1 line-clamp-2 px-1 text-xs text-tinta-suave">{f.legenda}</p>
            )}
            {aoExcluir && (
              <button
                type="button"
                onClick={() => aoExcluir(f)}
                className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-white/95 text-perigo-600 opacity-0 shadow-suave ring-1 ring-linha transition group-hover:opacity-100 focus:opacity-100 max-sm:opacity-100"
                aria-label="Excluir foto"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {aberta !== null && <Lightbox fotos={fotos} indice={aberta} aoMudar={setAberta} aoFechar={() => setAberta(null)} />}
    </>
  )
}

/* ------------------------------------------------------------- Lightbox -- */
export function Lightbox({
  fotos, indice, aoMudar, aoFechar,
}: {
  fotos: Foto[]
  indice: number
  aoMudar: (i: number) => void
  aoFechar: () => void
}) {
  const foto = fotos[indice]
  const { data: url, isLoading } = useUrlAssinada(foto?.path)
  const { data: urlMini } = useUrlAssinada(foto?.thumb_path)
  const toque = useRef<number | null>(null)
  const anterior = useCallback(() => aoMudar((indice - 1 + fotos.length) % fotos.length), [indice, fotos.length, aoMudar])
  const proxima = useCallback(() => aoMudar((indice + 1) % fotos.length), [indice, fotos.length, aoMudar])
  // pré-carrega a vizinha
  useUrlAssinada(fotos[(indice + 1) % fotos.length]?.path)

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
      if (e.key === 'ArrowLeft') anterior()
      if (e.key === 'ArrowRight') proxima()
    }
    document.addEventListener('keydown', tecla)
    const o = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = o
    }
  }, [aoFechar, anterior, proxima])

  if (!foto) return null
  return createPortal(
    <div className="anim-aparecer fixed inset-0 z-[70] flex flex-col bg-marinho-950/95 text-white" role="dialog" aria-modal="true" aria-label="Visualizador de fotos">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] tracking-widest text-marinho-300 num">
            FOTO {String(indice + 1).padStart(2, '0')} / {String(fotos.length).padStart(2, '0')} · {formatarData(foto.criado_em)}
          </p>
          {foto.legenda && <p className="truncate text-[13px] text-white/90">{foto.legenda}</p>}
        </div>
        <div className="flex items-center gap-1">
          {url && (
            <a href={url} download target="_blank" rel="noopener" className="flex size-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10" aria-label="Abrir original">
              <Download className="size-4" />
            </a>
          )}
          <button onClick={aoFechar} className="flex size-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
      </header>
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-4 sm:px-16"
        onClick={(e) => e.target === e.currentTarget && aoFechar()}
        onTouchStart={(e) => (toque.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const x0 = toque.current
          const x1 = e.changedTouches[0]?.clientX
          if (x0 !== null && x1 !== undefined && Math.abs(x1 - x0) > 50) (x1 < x0 ? proxima : anterior)()
          toque.current = null
        }}
      >
        {(url || urlMini) && (
          <img key={foto.id} src={url ?? urlMini ?? ''} alt={foto.legenda ?? 'Foto'} className="anim-aparecer max-h-full max-w-full rounded-sm object-contain shadow-2xl" />
        )}
        {isLoading && !urlMini && <Loader2 className="size-6 animate-spin text-white/60" />}
        {fotos.length > 1 && (
          <>
            <button onClick={anterior} className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:left-4" aria-label="Foto anterior">
              <ChevronLeft className="size-5" />
            </button>
            <button onClick={proxima} className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:right-4" aria-label="Próxima foto">
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------- Envio de fotos -- */
export interface ProgressoEnvio {
  total: number
  feitos: number
  falhas: number
}

/** Área de soltar/selecionar fotos com barra de progresso. */
export function EnvioDeFotos({
  aoEnviar, progresso, compacto, rotulo = 'Adicionar fotos',
}: {
  aoEnviar: (arquivos: File[]) => void
  progresso: ProgressoEnvio | null
  compacto?: boolean
  rotulo?: string
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)
  const enviando = !!progresso && progresso.feitos + progresso.falhas < progresso.total
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault()
        setArrastando(false)
        const arqs = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
        if (arqs.length) aoEnviar(arqs)
      }}
      className={clsx(
        'rounded-lg border border-dashed transition-colors',
        arrastando ? 'border-marinho-500 bg-marinho-50' : 'border-linha-forte bg-papel/50',
        compacto ? 'p-3' : 'p-4',
      )}
    >
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const arqs = [...(e.target.files ?? [])]
          if (arqs.length) aoEnviar(arqs)
          e.target.value = ''
        }}
      />
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Botao variante="secundario" icone={<ImagePlus className="size-4" />} onClick={() => entrada.current?.click()} disabled={enviando}>
          {rotulo}
        </Botao>
        <p className="text-center text-xs text-tinta-fraca sm:text-left">
          {enviando
            ? `Comprimindo e enviando ${progresso!.feitos + progresso!.falhas + 1} de ${progresso!.total}…`
            : 'Arraste aqui ou selecione. Comprimidas no aparelho (WebP 1600 px) antes de enviar.'}
        </p>
      </div>
      {progresso && (
        <div className="mt-3">
          <Progresso valor={((progresso.feitos + progresso.falhas) / progresso.total) * 100} tom={progresso.falhas ? 'ambar' : 'marinho'} rotuloAcessivel="Progresso do envio" />
          {!enviando && (
            <p className="mt-1.5 text-xs text-tinta-suave">
              {plural(progresso.feitos, 'foto enviada', 'fotos enviadas')}{progresso.falhas ? ` · ${plural(progresso.falhas, 'falha')}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
