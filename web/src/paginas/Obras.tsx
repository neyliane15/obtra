import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { HardHat, LayoutGrid, Pencil, Plus, Rows3, Search, Trash2 } from 'lucide-react'
import { useObras, type ObraLista } from '@/lib/consultas'
import { useSessao, usePerfil } from '@/lib/sessao'
import { permissoes } from '@/lib/permissoes'
import { mensagemDeErro } from '@/lib/supabase'
import { STATUS_OBRA } from '@/lib/rotulos'
import { normalizar } from '@/lib/formato'
import { calcularPrazo } from '@/lib/prazo'
import { excluirObraCompleta } from '@/lib/acoes'
import type { StatusObra } from '@/tipos/banco'
import { Botao, CabecalhoPagina, Erro, Esqueleto, Selecao, Selo, Vazio } from '@/componentes/ui'
import { CartaoObra } from '@/componentes/obra'
import { FormularioObra } from '@/componentes/FormularioObra'
import { useAvisos } from '@/componentes/avisos'

const CHAVE_VISAO = 'obtra.obras-visao'

export default function Obras() {
  const perfil = usePerfil()
  const { ehMaster, empresaId } = useSessao()
  const p = permissoes(perfil.papel)
  const avisos = useAvisos()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<StatusObra | ''>('')
  const [responsavel, setResponsavel] = useState('')
  const [visao, setVisao] = useState<'tabela' | 'cartoes'>(() => {
    try {
      return localStorage.getItem(CHAVE_VISAO) === 'cartoes' ? 'cartoes' : 'tabela'
    } catch {
      return 'tabela'
    }
  })
  const [editando, setEditando] = useState<ObraLista | null>(null)
  const obras = useObras()
  const novaAberta = params.get('nova') === '1'
  const mostrarEmpresa = ehMaster && !empresaId

  const responsaveis = useMemo(
    () => [...new Set((obras.data ?? []).map((o) => o.responsavel_tecnico).filter((x): x is string => !!x))].sort(),
    [obras.data],
  )
  const lista = useMemo(() => {
    const q = normalizar(busca.trim())
    return (obras.data ?? []).filter(
      (o) =>
        (!status || o.status === status) &&
        (!responsavel || o.responsavel_tecnico === responsavel) &&
        (!q || normalizar([o.nome, o.codigo, o.contratante, o.responsavel_tecnico, o.cidade, o.empresas?.nome].filter(Boolean).join(' ')).includes(q)),
    )
  }, [obras.data, busca, status, responsavel])

  function mudarVisao(v: 'tabela' | 'cartoes') {
    setVisao(v)
    try {
      localStorage.setItem(CHAVE_VISAO, v)
    } catch {
      /* sem armazenamento local */
    }
  }

  async function excluir(o: ObraLista) {
    const ok = await avisos.confirmar({
      titulo: `Excluir ${o.nome}?`,
      descricao: 'Relatórios, fotos e documentos desta obra serão apagados definitivamente, inclusive do armazenamento.',
      confirmar: 'Excluir obra',
      perigo: true,
      digitar: 'EXCLUIR',
    })
    if (!ok) return
    try {
      await excluirObraCompleta(o)
      avisos.sucesso('Obra excluída.')
      void qc.invalidateQueries({ queryKey: ['obras'] })
      void qc.invalidateQueries({ queryKey: ['painel'] })
    } catch (e) {
      avisos.erro(e)
    }
  }

  const total = obras.data?.length ?? 0

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Carteira"
        titulo="Obras"
        subtitulo={`${total} ${total === 1 ? 'obra cadastrada' : 'obras cadastradas'}${mostrarEmpresa ? ' em todas as empresas' : ''}`}
        acoes={p.criarObra && <Botao variante="ambar" icone={<Plus className="size-4" />} onClick={() => setParams({ nova: '1' })}>Nova Obra</Botao>}
      />

      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
        <label className="relative flex-1 md:max-w-md">
          <span className="sr-only">Buscar obra</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-tinta-fraca" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar obra, contratante ou responsável…" className="campo pl-8" />
        </label>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <Selecao value={status} onChange={(e) => setStatus(e.target.value as StatusObra | '')} className="md:!w-44" aria-label="Status">
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_OBRA) as StatusObra[]).map((s) => <option key={s} value={s}>{STATUS_OBRA[s].rotulo}</option>)}
          </Selecao>
          <Selecao value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="md:!w-52" aria-label="Responsável">
            <option value="">Todos os responsáveis</option>
            {responsaveis.map((r) => <option key={r}>{r}</option>)}
          </Selecao>
        </div>
        <div className="ml-auto hidden items-center rounded-md border border-linha-forte bg-white p-0.5 md:flex" role="group" aria-label="Visualização">
          {(['tabela', 'cartoes'] as const).map((v) => (
            <button key={v} onClick={() => mudarVisao(v)} aria-pressed={visao === v} title={v === 'tabela' ? 'Tabela' : 'Cartões'} className={clsx('flex size-7 items-center justify-center rounded', visao === v ? 'bg-marinho-900 text-white' : 'text-tinta-fraca hover:text-marinho-900')}>
              {v === 'tabela' ? <Rows3 className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
            </button>
          ))}
        </div>
      </div>

      {obras.isError ? (
        <Erro mensagem={mensagemDeErro(obras.error)} aoTentar={() => void obras.refetch()} />
      ) : obras.isLoading ? (
        <div className="cartao space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Esqueleto key={i} className="h-12" />)}</div>
      ) : lista.length === 0 ? (
        <Vazio
          titulo={total ? 'Nenhuma obra encontrada' : 'Nenhuma obra cadastrada'}
          descricao={total ? 'Ajuste a busca ou os filtros.' : 'Cadastre a primeira obra para começar a registrar os diários.'}
          icone={<HardHat className="size-3.5" />}
          acao={!total && p.criarObra && <Botao variante="ambar" icone={<Plus className="size-4" />} onClick={() => setParams({ nova: '1' })}>Cadastrar obra</Botao>}
        />
      ) : (
        <>
          <div className={clsx('cartao overflow-hidden', visao === 'tabela' ? 'hidden md:block' : 'hidden')}>
            <div className="rolagem-fina relative overflow-x-auto">
              <table className="w-full min-w-[1000px] table-fixed text-left text-[12.5px]">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[17%]" />
                  <col className="w-[11%]" />
                  <col className="w-[13%]" />
                  <col className="w-[68px]" />
                  <col className="w-[86px]" />
                  <col className="w-[80px]" />
                  <col className="w-[128px]" />
                  <col className="w-[76px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-linha bg-papel/80">
                    {['Obra', 'Contratante', 'Local', 'Responsável', 'Prazo', 'Decorrido', 'A vencer', 'Status', 'Ações'].map((c, i) => (
                      <th key={c} scope="col" className={clsx('rotulo px-4 py-2.5 !text-[9.5px] font-semibold whitespace-nowrap', i >= 4 && i <= 6 && 'text-right', i === 8 && 'pr-5 text-right')}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha">
                  {lista.map((o) => {
                    const pr = calcularPrazo(o)
                    const st = STATUS_OBRA[o.status]
                    return (
                      <tr key={o.id} onClick={() => navegar(`/obras/${o.id}`)} className="group cursor-pointer transition-colors hover:bg-marinho-50/50">
                        <td className="px-4 py-3">
                          {mostrarEmpresa && o.empresas?.nome && <p className="truncate text-[10px] font-semibold tracking-wide text-ambar-700 uppercase">{o.empresas.nome}</p>}
                          <p className="font-semibold text-tinta group-hover:text-marinho-700">{o.nome}</p>
                          {o.codigo && <p className="font-mono text-[10.5px] text-tinta-fraca">{o.codigo}</p>}
                        </td>
                        <td className="px-4 py-3 text-tinta-suave"><span className="line-clamp-2" title={o.contratante ?? undefined}>{o.contratante ?? '—'}</span></td>
                        <td className="px-4 py-3 text-tinta-suave">{[o.cidade, o.uf].filter(Boolean).join(' - ') || '—'}</td>
                        <td className="px-4 py-3 text-tinta-suave">{o.responsavel_tecnico ?? '—'}</td>
                        <td className="num px-4 py-3 text-right font-mono text-[12px]">{pr.definido ? `${pr.total}d` : '—'}</td>
                        <td className="num px-4 py-3 text-right font-mono text-[12px]">{pr.definido ? `${pr.decorridos}d` : '—'}</td>
                        <td className={clsx('num px-4 py-3 text-right font-mono text-[12px]', pr.atrasado ? 'font-semibold text-perigo-600' : pr.definido && pr.restantes <= 15 ? 'text-ambar-700' : '')}>{pr.definido ? `${pr.restantes}d` : '—'}</td>
                        <td className="px-4 py-3"><Selo tom={st.tom}>{st.rotulo}</Selo></td>
                        <td className="py-3 pr-3 pl-1" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            {p.editarObra && <Botao variante="fantasma" tamanho="p" apenasIcone icone={<Pencil className="size-3.5" />} onClick={() => setEditando(o)} aria-label={`Editar ${o.nome}`} title="Editar" />}
                            {p.excluirObra && <Botao variante="fantasma" tamanho="p" apenasIcone icone={<Trash2 className="size-3.5" />} onClick={() => void excluir(o)} aria-label={`Excluir ${o.nome}`} title="Excluir" className="hover:!text-perigo-600" />}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className={clsx('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', visao === 'tabela' && 'md:hidden')}>
            {lista.map((o, i) => (
              <div key={o.id} className="anim-subir" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                <CartaoObra obra={o} para={`/obras/${o.id}`} mostrarEmpresa={mostrarEmpresa} />
              </div>
            ))}
          </div>
        </>
      )}

      {p.criarObra && <FormularioObra aberto={novaAberta} aoFechar={() => setParams({})} aoSalvar={(id) => navegar(`/obras/${id}`)} />}
      {p.editarObra && <FormularioObra aberto={!!editando} aoFechar={() => setEditando(null)} obra={editando} />}
    </>
  )
}
