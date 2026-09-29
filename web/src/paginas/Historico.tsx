import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { clsx } from 'clsx'
import { Camera, CheckCheck, ClipboardList, FileText, HardHat, History, Pencil, Plus, Search, Send, Trash2, Undo2, User, Wrench } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Historico as THistorico } from '@/tipos/banco'
import { useObras } from '@/lib/consultas'
import { useSessao } from '@/lib/sessao'
import { supabase, exigir, mensagemDeErro } from '@/lib/supabase'
import { capitalizar, dataLocal, normalizar } from '@/lib/formato'
import { ACAO_HISTORICO, ENTIDADE_HISTORICO } from '@/lib/rotulos'
import { Avatar, Botao, CabecalhoPagina, Erro, Esqueleto, Selecao, Vazio } from '@/componentes/ui'

const PAGINA = 60

function iconeAcao(acao: string): { icone: ReactNode; cor: string } {
  if (acao.startsWith('exclu')) return { icone: <Trash2 />, cor: 'bg-perigo-50 text-perigo-600 ring-perigo-600/20' }
  if (acao === 'aprovou') return { icone: <CheckCheck />, cor: 'bg-ok-50 text-ok-600 ring-ok-600/20' }
  if (acao === 'enviou_aprovacao') return { icone: <Send />, cor: 'bg-marinho-50 text-marinho-600 ring-marinho-200' }
  if (acao === 'reabriu') return { icone: <Undo2 />, cor: 'bg-ambar-50 text-ambar-700 ring-ambar-100' }
  if (acao === 'criou') return { icone: <Plus />, cor: 'bg-marinho-900 text-white ring-marinho-900' }
  if (acao.includes('foto')) return { icone: <Camera />, cor: 'bg-marinho-50 text-marinho-600 ring-marinho-200' }
  if (acao.includes('documento')) return { icone: <FileText />, cor: 'bg-marinho-50 text-marinho-600 ring-marinho-200' }
  return { icone: <Pencil />, cor: 'bg-papel text-tinta-suave ring-linha-forte' }
}

const ICONE_ENTIDADE: Record<string, ReactNode> = {
  obra: <HardHat className="size-3" />,
  relatorio: <ClipboardList className="size-3" />,
  foto: <Camera className="size-3" />,
  documento: <FileText className="size-3" />,
  usuario: <User className="size-3" />,
  cadastro: <Wrench className="size-3" />,
}

export default function Historico() {
  const { empresaId } = useSessao()
  const obras = useObras()
  const [obra, setObra] = useState('')
  const [entidade, setEntidade] = useState('')
  const [busca, setBusca] = useState('')
  const q = useInfiniteQuery({
    queryKey: ['historico', empresaId, obra, entidade],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let c = supabase.from('historico').select('*').order('criado_em', { ascending: false }).range(pageParam, pageParam + PAGINA - 1)
      if (empresaId) c = c.eq('empresa_id', empresaId)
      if (obra) c = c.eq('obra_id', obra)
      if (entidade) c = c.eq('entidade', entidade)
      return exigir(await c) as THistorico[]
    },
    getNextPageParam: (ultima, todas) => (ultima.length === PAGINA ? todas.length * PAGINA : undefined),
  })
  const nomeObra = (id: string | null) => (id ? obras.data?.find((o) => o.id === id)?.nome : undefined)

  const grupos = useMemo(() => {
    const t = normalizar(busca.trim())
    const itens = (q.data?.pages.flat() ?? []).filter(
      (h) => !t || normalizar(`${h.usuario_nome ?? ''} ${h.descricao ?? ''} ${nomeObra(h.obra_id) ?? ''}`).includes(t),
    )
    const m = new Map<string, THistorico[]>()
    for (const h of itens) {
      const k = format(new Date(h.criado_em), 'yyyy-MM-dd')
      m.set(k, [...(m.get(k) ?? []), h])
    }
    return [...m.entries()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, busca, obras.data])

  function link(h: THistorico): string | null {
    if (!h.entidade_id || h.acao.startsWith('exclu')) return h.obra_id ? `/obras/${h.obra_id}` : null
    if (h.entidade === 'relatorio') return `/relatorios/${h.entidade_id}`
    if (h.entidade === 'obra') return `/obras/${h.entidade_id}`
    if (h.obra_id) return `/obras/${h.obra_id}${h.entidade === 'foto' ? '?aba=fotos' : h.entidade === 'documento' ? '?aba=documentos' : ''}`
    return null
  }

  return (
    <>
      <CabecalhoPagina sobretitulo="Auditoria" titulo="Histórico" subtitulo="Tudo o que aconteceu nas obras: quem fez, o quê e quando." />
      <div className="mb-5 flex flex-col gap-2 md:flex-row">
        <label className="relative flex-1 md:max-w-md">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-tinta-fraca" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por pessoa ou descrição…" className="campo pl-8" />
        </label>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <Selecao value={obra} onChange={(e) => setObra(e.target.value)} className="md:!w-56" aria-label="Obra">
            <option value="">Todas as obras</option>
            {(obras.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </Selecao>
          <Selecao value={entidade} onChange={(e) => setEntidade(e.target.value)} className="md:!w-44" aria-label="Tipo">
            <option value="">Tudo</option>
            {Object.entries(ENTIDADE_HISTORICO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
        </div>
      </div>

      {q.isError ? (
        <Erro mensagem={mensagemDeErro(q.error)} aoTentar={() => void q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Esqueleto key={i} className="h-14" />)}</div>
      ) : !grupos.length ? (
        <Vazio titulo="Nada registrado" descricao="As ações em obras, relatórios, fotos e documentos aparecem aqui automaticamente." icone={<History className="size-3.5" />} />
      ) : (
        <div className="flex flex-col gap-6">
          {grupos.map(([dia, itens]) => (
            <section key={dia}>
              <h2 className="mb-2 flex items-center gap-2">
                <span className="rounded bg-marinho-900 px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wider text-white">{format(dataLocal(dia)!, 'dd/MM/yyyy')}</span>
                <span className="text-[12px] text-tinta-suave">{capitalizar(format(dataLocal(dia)!, 'EEEE', { locale: ptBR }))}</span>
                <span className="h-px flex-1 border-t border-dashed border-linha-forte" />
                <span className="num text-[11px] text-tinta-fraca">{itens.length}</span>
              </h2>
              <ol className="cartao relative divide-y divide-linha">
                {itens.map((h) => {
                  const ic = iconeAcao(h.acao)
                  const destino = link(h)
                  const conteudo = (
                    <>
                      <span className={clsx('relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-1 [&_svg]:size-3.5', ic.cor)}>{ic.icone}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] text-tinta">
                          <strong className="font-semibold">{h.usuario_nome ?? 'Sistema'}</strong>{' '}
                          <span className="text-tinta-suave">{ACAO_HISTORICO[h.acao] ?? h.acao.replace(/_/g, ' ')}</span>{' '}
                          <span className="inline-flex items-center gap-1 rounded bg-papel px-1.5 py-px align-middle text-[11px] text-tinta-suave ring-1 ring-linha">{ICONE_ENTIDADE[h.entidade]}{ENTIDADE_HISTORICO[h.entidade] ?? h.entidade}</span>
                        </p>
                        {h.descricao && <p className="truncate text-[12px] text-tinta-suave">{h.descricao}</p>}
                        {h.obra_id && nomeObra(h.obra_id) && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-tinta-fraca"><HardHat className="size-3" /> {nomeObra(h.obra_id)}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="num font-mono text-[11px] text-tinta-fraca">{format(new Date(h.criado_em), 'HH:mm')}</span>
                        <Avatar nome={h.usuario_nome ?? '?'} tamanho={20} className="!ring-1" />
                      </div>
                    </>
                  )
                  return (
                    <li key={String(h.id)}>
                      {destino ? (
                        <Link to={destino} className="flex items-start gap-3 px-4 py-3 hover:bg-marinho-50/50">{conteudo}</Link>
                      ) : (
                        <div className="flex items-start gap-3 px-4 py-3">{conteudo}</div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
          {q.hasNextPage && (
            <div className="flex justify-center">
              <Botao variante="secundario" carregando={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Carregar mais</Botao>
            </div>
          )}
        </div>
      )}
    </>
  )
}
