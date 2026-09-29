import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, ClipboardList, FileDown, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useNomesPerfis, useObras, useRelatoriosEmpresa, type RelatorioGlobal } from '@/lib/consultas'
import { usePerfil } from '@/lib/sessao'
import { ehGestor, permissoes } from '@/lib/permissoes'
import { supabase, mensagemDeErro } from '@/lib/supabase'
import { capitalizar, codigoRelatorio, diaDaSemana, formatarData, normalizar } from '@/lib/formato'
import { STATUS_RELATORIO } from '@/lib/rotulos'
import type { StatusRelatorio } from '@/tipos/banco'
import { Botao, CabecalhoPagina, Erro, Esqueleto, Selecao, Selo, Vazio } from '@/componentes/ui'
import { ClimaResumo } from '@/componentes/obra'
import { useAvisos } from '@/componentes/avisos'

const POR_PAGINA = 50

export default function Relatorios() {
  const perfil = usePerfil()
  const p = permissoes(perfil.papel)
  const avisos = useAvisos()
  const qc = useQueryClient()
  const navegar = useNavigate()
  const lista = useRelatoriosEmpresa()
  const obras = useObras()
  const nomes = useNomesPerfis()
  const [busca, setBusca] = useState('')
  const [obra, setObra] = useState('')
  const [status, setStatus] = useState<StatusRelatorio | ''>('')
  const [limite, setLimite] = useState(POR_PAGINA)
  const [baixando, setBaixando] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim()).replace(/^rd-?/, '')
    return (lista.data ?? []).filter(
      (r) =>
        (!obra || r.obra_id === obra) &&
        (!status || r.status === status) &&
        (!q || String(r.numero) === q || normalizar(`${r.obras?.nome ?? ''} ${r.responsavel ?? ''}`).includes(q)),
    )
  }, [lista.data, busca, obra, status])
  const total = lista.data?.length ?? 0
  const visiveis = filtrados.slice(0, limite)
  const pendentes = (lista.data ?? []).filter((r) => r.status === 'revisar').length

  async function excluir(r: RelatorioGlobal) {
    const ok = await avisos.confirmar({ titulo: `Excluir ${codigoRelatorio(r.numero)}?`, descricao: `Relatório de ${formatarData(r.data)} da obra ${r.obras?.nome ?? ''}. As fotos continuam na galeria da obra.`, confirmar: 'Excluir', perigo: true })
    if (!ok) return
    const { error } = await supabase.from('relatorios').delete().eq('id', r.id)
    if (error) return avisos.erro(error)
    avisos.sucesso('Relatório excluído.')
    void qc.invalidateQueries({ queryKey: ['relatorios-empresa'] })
    void qc.invalidateQueries({ queryKey: ['relatorios', r.obra_id] })
    void qc.invalidateQueries({ queryKey: ['painel'] })
  }
  async function pdf(r: RelatorioGlobal) {
    setBaixando(r.id)
    try {
      const { baixarPdfRelatorio } = await import('@/lib/pdf-rdo')
      await baixarPdfRelatorio(r.id)
    } catch (e) {
      avisos.erro(e)
    } finally {
      setBaixando(null)
    }
  }
  const aprovador = (r: RelatorioGlobal) => (r.aprovado_por ? (nomes.get(r.aprovado_por) ?? 'Administrador') : null)

  return (
    <>
      <CabecalhoPagina
        sobretitulo="RDO"
        titulo="Relatórios Diários de Obra"
        subtitulo={
          <>
            {filtrados.length} de {total} relatórios
            {pendentes > 0 && (
              <button onClick={() => setStatus('revisar')} className="ml-2 inline-flex items-center gap-1 rounded-full bg-marinho-50 px-2 py-0.5 text-[11px] font-semibold text-marinho-700 ring-1 ring-marinho-200 hover:bg-marinho-100">
                {pendentes} pendente{pendentes > 1 ? 's' : ''} de aprovação
              </button>
            )}
          </>
        }
        acoes={p.criarRelatorio && <Botao variante="ambar" icone={<Plus className="size-4" />} onClick={() => navegar('/relatorios/novo')}>Novo RDO</Botao>}
      />

      <div className="mb-4 flex flex-col gap-2 md:flex-row">
        <label className="relative flex-1 md:max-w-md">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-tinta-fraca" />
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(POR_PAGINA) }} placeholder="Buscar por número ou obra…" className="campo pl-8" />
        </label>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <Selecao value={obra} onChange={(e) => { setObra(e.target.value); setLimite(POR_PAGINA) }} className="md:!w-56" aria-label="Obra">
            <option value="">Todas as obras</option>
            {(obras.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </Selecao>
          <Selecao value={status} onChange={(e) => { setStatus(e.target.value as StatusRelatorio | ''); setLimite(POR_PAGINA) }} className="md:!w-48" aria-label="Status">
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_RELATORIO) as StatusRelatorio[]).map((s) => <option key={s} value={s}>{STATUS_RELATORIO[s].rotulo}</option>)}
          </Selecao>
        </div>
      </div>

      {lista.isError ? (
        <Erro mensagem={mensagemDeErro(lista.error)} aoTentar={() => void lista.refetch()} />
      ) : lista.isLoading ? (
        <div className="cartao space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Esqueleto key={i} className="h-11" />)}</div>
      ) : !filtrados.length ? (
        <Vazio
          titulo={total ? 'Nenhum relatório encontrado' : 'Nenhum relatório ainda'}
          descricao={total ? 'Ajuste a busca ou os filtros.' : 'Crie o primeiro RDO: clima, efetivo, atividades e fotos do dia.'}
          icone={<ClipboardList className="size-3.5" />}
          acao={!total && p.criarRelatorio && <Botao variante="ambar" icone={<Plus className="size-4" />} onClick={() => navegar('/relatorios/novo')}>Novo RDO</Botao>}
        />
      ) : (
        <>
          <div className="cartao hidden overflow-hidden md:block">
            <div className="rolagem-fina overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-linha bg-papel/80">
                    {['Nº', 'Obra', 'Data', 'Dia', 'Clima', 'Responsável', 'Status', 'Aprovado por', ''].map((c, i) => (
                      <th key={i} scope="col" className="rotulo px-4 py-2.5 !text-[9.5px] font-semibold">{c || <span className="sr-only">Ações</span>}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha">
                  {visiveis.map((r) => {
                    const st = STATUS_RELATORIO[r.status]
                    return (
                      <tr key={r.id} onClick={() => navegar(`/relatorios/${r.id}`)} className="group cursor-pointer hover:bg-marinho-50/50">
                        <td className="px-4 py-2.5 font-mono text-[12px] font-semibold text-marinho-900">{codigoRelatorio(r.numero)}</td>
                        <td className="max-w-[220px] truncate px-4 py-2.5 font-medium text-tinta group-hover:text-marinho-700">
                          {r.obras?.nome ?? '—'}
                        </td>
                        <td className="num px-4 py-2.5 font-mono text-[12px] text-tinta-suave">{formatarData(r.data)}</td>
                        <td className="px-4 py-2.5 text-tinta-suave">{capitalizar(diaDaSemana(r.data))}</td>
                        <td className="px-4 py-2.5"><ClimaResumo manha={r.clima_manha} tarde={r.clima_tarde} /></td>
                        <td className="px-4 py-2.5 text-tinta-suave">{r.responsavel ?? (r.criado_por ? nomes.get(r.criado_por) : null) ?? '—'}</td>
                        <td className="px-4 py-2.5"><Selo tom={st.tom}>{st.rotulo}</Selo></td>
                        <td className="px-4 py-2.5 text-tinta-suave">{aprovador(r) ?? <span className="text-tinta-fraca">—</span>}</td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            <Botao variante="fantasma" tamanho="p" apenasIcone icone={<FileDown className="size-3.5" />} carregando={baixando === r.id} onClick={() => void pdf(r)} aria-label="Baixar PDF" title="Baixar PDF" />
                            <Link to={`/relatorios/${r.id}`} className="flex size-7 items-center justify-center rounded-md text-tinta-suave hover:bg-marinho-50 hover:text-marinho-900" aria-label="Editar" title="Abrir"><Pencil className="size-3.5" /></Link>
                            {ehGestor(perfil.papel) && <Botao variante="fantasma" tamanho="p" apenasIcone icone={<Trash2 className="size-3.5" />} onClick={() => void excluir(r)} aria-label="Excluir" title="Excluir" className="hover:!text-perigo-600" />}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* celular */}
          <ul className="cartao divide-y divide-linha md:hidden">
            {visiveis.map((r) => {
              const st = STATUS_RELATORIO[r.status]
              return (
                <li key={r.id}>
                  <Link to={`/relatorios/${r.id}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex w-14 shrink-0 flex-col items-center rounded-md border border-linha bg-papel py-1">
                      <span className="font-mono text-[8px] tracking-widest text-tinta-fraca">RD</span>
                      <span className="num font-display text-[14px] leading-tight font-extrabold text-marinho-900">{r.numero}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-tinta">{r.obras?.nome}</span>
                      <span className="num block text-[11.5px] text-tinta-fraca">{formatarData(r.data)} · {capitalizar(diaDaSemana(r.data))}</span>
                      <Selo tom={st.tom} className="mt-1">{st.rotulo}</Selo>
                    </span>
                    <ChevronRight className="size-4 text-tinta-fraca" />
                  </Link>
                </li>
              )
            })}
          </ul>

          {filtrados.length > limite && (
            <div className="mt-4 flex justify-center">
              <Botao variante="secundario" onClick={() => setLimite((l) => l + POR_PAGINA)}>Mostrar mais ({filtrados.length - limite})</Botao>
            </div>
          )}
        </>
      )}
      <p className="mt-4 text-center font-mono text-[10px] tracking-widest text-tinta-fraca uppercase">RD = relatório diário · numeração sequencial por obra</p>
    </>
  )
}
