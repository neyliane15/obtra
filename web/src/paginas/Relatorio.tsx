import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  ArrowLeft, Camera, Check, ChevronLeft, ChevronRight, Clock, Cloud, CloudRain, FileDown, Hammer, MessageSquare, Package,
  Plus, Save, Send, ShieldAlert, StickyNote, Sun, Trash2, Truck, Undo2, Users,
} from 'lucide-react'
import type {
  Atividade, Clima, Condicao, Equipamento, Foto, MaoObra, Material, Ocorrencia, Relatorio as TRelatorio, StatusAtividade, StatusRelatorio,
  TipoMaoObra, TipoMaterial, TipoOcorrencia,
} from '@/tipos/banco'
import { paraNumero } from '@/tipos/banco'
import {
  useComentarios, useEnvioFotos, useFotosRelatorio, useObra, useRelatorio, useRelatorios, type RelatorioCompleto,
} from '@/lib/consultas'
import { usePerfil, useSessao } from '@/lib/sessao'
import { ehGestor, podeEditarRelatorio, transicoesPermitidas } from '@/lib/permissoes'
import { supabase, mensagemDeErro } from '@/lib/supabase'
import { excluirFoto } from '@/lib/armazenamento'
import { capitalizar, diaDaSemana, formatarData, formatarDataExtensa, formatarRelativo, numeroRelatorio } from '@/lib/formato'
import {
  CLIMA, CONDICAO, PAPEL, STATUS_ATIVIDADE, STATUS_RELATORIO, TIPO_MAO_OBRA, TIPO_MATERIAL, TIPO_OCORRENCIA,
} from '@/lib/rotulos'
import { AreaTexto, Avatar, Botao, CarregandoPagina, Entrada, Erro, Selecao, Selo, Vazio } from '@/componentes/ui'
import { EnvioDeFotos, Galeria, ImagemAssinada } from '@/componentes/midia'
import { PERIODOS } from '@/componentes/obra'
import { useAvisos } from '@/componentes/avisos'
import { Simbolo } from '@/componentes/Logo'

const novoId = () => crypto.randomUUID()

export default function PaginaRelatorio() {
  const { id } = useParams()
  const q = useRelatorio(id)
  if (q.isLoading) return <CarregandoPagina texto="Abrindo relatório…" />
  if (q.isError) return <Erro mensagem={mensagemDeErro(q.error)} aoTentar={() => void q.refetch()} />
  if (!q.data)
    return <Vazio titulo="Relatório não encontrado" descricao="Ele pode ter sido excluído, ou ainda não foi aprovado para visualização." />
  return <EditorRelatorio key={id} dados={q.data} />
}

/* ======================================================================= */
interface Estado {
  cab: Pick<
    TRelatorio,
    'data' | 'horario_inicio' | 'horario_fim' | 'clima_manha' | 'clima_tarde' | 'clima_noite' | 'condicao_manha' | 'condicao_tarde' | 'condicao_noite' | 'observacoes'
  > & { pluviometria_mm: string }
  maoObra: MaoObra[]
  equipamentos: Equipamento[]
  atividades: Atividade[]
  ocorrencias: Ocorrencia[]
  materiais: Material[]
}

function estadoDe(d: RelatorioCompleto): Estado {
  const r = d.relatorio
  return {
    cab: {
      data: r.data,
      horario_inicio: r.horario_inicio?.slice(0, 5) ?? null,
      horario_fim: r.horario_fim?.slice(0, 5) ?? null,
      clima_manha: r.clima_manha,
      clima_tarde: r.clima_tarde,
      clima_noite: r.clima_noite,
      condicao_manha: r.condicao_manha,
      condicao_tarde: r.condicao_tarde,
      condicao_noite: r.condicao_noite,
      observacoes: r.observacoes,
      pluviometria_mm: r.pluviometria_mm === null ? '' : String(paraNumero(r.pluviometria_mm)),
    },
    maoObra: d.maoObra,
    equipamentos: d.equipamentos,
    atividades: d.atividades,
    ocorrencias: d.ocorrencias,
    materiais: d.materiais,
  }
}

type ChaveLista = 'maoObra' | 'equipamentos' | 'atividades' | 'ocorrencias' | 'materiais'
const TABELAS: Record<ChaveLista, string> = {
  maoObra: 'relatorio_mao_obra',
  equipamentos: 'relatorio_equipamentos',
  atividades: 'relatorio_atividades',
  ocorrencias: 'relatorio_ocorrencias',
  materiais: 'relatorio_materiais',
}

/** Linha vazia não é salva: o texto principal é obrigatório no banco. */
function linhaValida(chave: ChaveLista, l: Record<string, unknown>): boolean {
  const campo = chave === 'maoObra' ? 'funcao' : chave === 'equipamentos' ? 'nome' : 'descricao'
  return typeof l[campo] === 'string' && (l[campo] as string).trim().length > 0
}

function EditorRelatorio({ dados }: { dados: RelatorioCompleto }) {
  const r = dados.relatorio
  const perfil = usePerfil()
  const { ehMaster } = useSessao()
  const avisos = useAvisos()
  const qc = useQueryClient()
  const navegar = useNavigate()
  const obra = useObra(r.obra_id)
  const lista = useRelatorios(r.obra_id)
  const portal = perfil.papel === 'cliente'
  const editavel = podeEditarRelatorio(perfil.papel, r.status)
  const [base, setBase] = useState(() => estadoDe(dados))
  const [e, setE] = useState(() => estadoDe(dados))
  const [salvando, setSalvando] = useState(false)
  const [mudando, setMudando] = useState<StatusRelatorio | null>(null)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const sujo = useMemo(() => JSON.stringify(e) !== JSON.stringify(base), [e, base])

  // vizinhos (lista vem em ordem decrescente de número)
  const vizinhos = useMemo(() => {
    const l = lista.data ?? []
    const i = l.findIndex((x) => x.id === r.id)
    return { anterior: i >= 0 ? l[i + 1] : undefined, proximo: i > 0 ? l[i - 1] : undefined }
  }, [lista.data, r.id])
  const base_url = portal ? '/portal/relatorios' : '/relatorios'
  const voltar = portal ? `/portal/obras/${r.obra_id}` : `/obras/${r.obra_id}`

  const setCab = <K extends keyof Estado['cab']>(k: K, v: Estado['cab'][K]) => setE((x) => ({ ...x, cab: { ...x.cab, [k]: v } }))
  function setLista<K extends ChaveLista>(k: K, fn: (l: Estado[K]) => Estado[K]) {
    setE((x) => ({ ...x, [k]: fn(x[k]) }))
  }

  const salvar = useCallback(async (): Promise<boolean> => {
    const pluv = e.cab.pluviometria_mm.trim() ? Number(e.cab.pluviometria_mm.replace(',', '.')) : null
    if (pluv !== null && (!Number.isFinite(pluv) || pluv < 0)) {
      avisos.erro('Pluviometria inválida.')
      return false
    }
    if (e.maoObra.some((m) => !(m.quantidade > 0)) || e.equipamentos.some((m) => !(m.quantidade > 0))) {
      avisos.erro('Quantidades devem ser maiores que zero.')
      return false
    }
    setSalvando(true)
    try {
      const { error } = await supabase
        .from('relatorios')
        .update({
          ...e.cab,
          horario_inicio: e.cab.horario_inicio || null,
          horario_fim: e.cab.horario_fim || null,
          observacoes: e.cab.observacoes?.trim() || null,
          pluviometria_mm: pluv,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', r.id)
      if (error) throw error
      const limpo: Estado = { ...e }
      for (const chave of Object.keys(TABELAS) as ChaveLista[]) {
        const tabela = TABELAS[chave]
        const atuais = (e[chave] as unknown as Record<string, unknown>[]).filter((l) => linhaValida(chave, l))
        const idsAtuais = new Set(atuais.map((l) => l.id as string))
        const removidos = (base[chave] as unknown as { id: string }[]).map((l) => l.id).filter((x) => !idsAtuais.has(x))
        if (removidos.length) {
          const { error: er } = await supabase.from(tabela).delete().in('id', removidos)
          if (er) throw er
        }
        if (atuais.length) {
          const linhas = atuais.map((l, i) => {
            const { criado_em: _c, ...resto } = l
            void _c
            return { ...resto, relatorio_id: r.id, ordem: i }
          })
          const { error: eu } = await supabase.from(tabela).upsert(linhas, { onConflict: 'id' })
          if (eu) throw eu
        }
        ;(limpo as unknown as Record<string, unknown>)[chave] = atuais
      }
      setE(limpo)
      setBase(limpo)
      void qc.invalidateQueries({ queryKey: ['relatorios', r.obra_id] })
      void qc.invalidateQueries({ queryKey: ['relatorios-recentes'] })
      void qc.invalidateQueries({ queryKey: ['relatorio', r.id] })
      avisos.sucesso('Relatório salvo.')
      return true
    } catch (err) {
      avisos.erro(err)
      return false
    } finally {
      setSalvando(false)
    }
  }, [e, base, r.id, r.obra_id, avisos, qc])

  // Ctrl+S e aviso ao sair com alterações
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        if (editavel && sujo && !salvando) void salvar()
      }
    }
    const sair = (ev: BeforeUnloadEvent) => {
      if (sujo) ev.preventDefault()
    }
    window.addEventListener('keydown', tecla)
    window.addEventListener('beforeunload', sair)
    return () => {
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('beforeunload', sair)
    }
  }, [editavel, sujo, salvando, salvar])

  async function mudarStatus(s: StatusRelatorio) {
    if (sujo && editavel) {
      const ok = await salvar()
      if (!ok) return
    }
    if (s === 'aprovado') {
      const ok = await avisos.confirmar({ titulo: 'Aprovar relatório?', descricao: 'Depois de aprovado, o relatório fica visível ao cliente e só administradores podem editá-lo.', confirmar: 'Aprovar' })
      if (!ok) return
    }
    setMudando(s)
    const { error } = await supabase.rpc('mudar_status_relatorio', { p_relatorio: r.id, p_status: s })
    setMudando(null)
    if (error) return avisos.erro(error)
    avisos.sucesso(`Status: ${STATUS_RELATORIO[s].rotulo}.`)
    void qc.invalidateQueries({ queryKey: ['relatorio', r.id] })
    void qc.invalidateQueries({ queryKey: ['relatorios', r.obra_id] })
    void qc.invalidateQueries({ queryKey: ['relatorios-recentes'] })
  }

  async function excluirRelatorio() {
    const ok = await avisos.confirmar({
      titulo: `Excluir RDO nº ${numeroRelatorio(r.numero)}?`,
      descricao: 'O relatório e seus itens serão apagados. As fotos continuam na galeria da obra.',
      confirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    const { error } = await supabase.from('relatorios').delete().eq('id', r.id)
    if (error) return avisos.erro(error)
    void qc.invalidateQueries({ queryKey: ['relatorios', r.obra_id] })
    void qc.invalidateQueries({ queryKey: ['painel'] })
    avisos.sucesso('Relatório excluído.')
    navegar(voltar, { replace: true })
  }

  async function pdf() {
    if (sujo && editavel) {
      const ok = await salvar()
      if (!ok) return
    }
    setGerandoPdf(true)
    try {
      const { baixarPdfRelatorio } = await import('@/lib/pdf-rdo')
      await baixarPdfRelatorio(r.id)
    } catch (err) {
      avisos.erro(err)
    } finally {
      setGerandoPdf(false)
    }
  }

  const transicoes = transicoesPermitidas(perfil.papel, r.status)
  const st = STATUS_RELATORIO[r.status]
  const totalMO = e.maoObra.reduce((s, m) => s + (m.quantidade || 0), 0)
  const o = obra.data

  return (
    <div className={clsx(portal ? '' : '-mt-1')}>
      {/* barra superior */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={voltar} className="inline-flex items-center gap-1 text-[12px] text-tinta-suave hover:text-marinho-900">
          <ArrowLeft className="size-3.5" /> {o?.nome ?? 'Obra'}
        </Link>
        <div className="flex items-center gap-1">
          <Botao variante="secundario" tamanho="p" apenasIcone icone={<ChevronLeft className="size-4" />} disabled={!vizinhos.anterior} onClick={() => vizinhos.anterior && navegar(`${base_url}/${vizinhos.anterior.id}`)} aria-label="Relatório anterior" title="Relatório anterior" />
          <span className="num px-2 font-mono text-[11px] text-tinta-suave">RDO {numeroRelatorio(r.numero)}</span>
          <Botao variante="secundario" tamanho="p" apenasIcone icone={<ChevronRight className="size-4" />} disabled={!vizinhos.proximo} onClick={() => vizinhos.proximo && navegar(`${base_url}/${vizinhos.proximo.id}`)} aria-label="Próximo relatório" title="Próximo relatório" />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        {/* ============================ folha ============================ */}
        <article className="folha cantoneiras relative overflow-hidden anim-subir">
          <div className="h-[3px] bg-gradient-to-r from-marinho-900 via-marinho-600 to-ambar-500" />
          {/* carimbo */}
          <header className="grid border-b border-linha-forte sm:grid-cols-[1fr_auto]">
            <div className="flex items-center gap-3 p-4 sm:p-5">
              {o?.empresa_id && <LogoEmpresa empresaId={o.empresa_id} />}
              <div className="min-w-0">
                <p className="rotulo">Relatório diário de obra</p>
                <h1 className="truncate font-display text-[19px] font-extrabold text-marinho-900 sm:text-[21px]">{o?.nome ?? '…'}</h1>
                <p className="truncate text-[12px] text-tinta-suave">
                  {[o?.codigo, o?.contratante, [o?.cidade, o?.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-linha-forte sm:grid-cols-1 sm:border-t-0 sm:border-l">
              <div className="blueprint flex flex-col items-center justify-center px-6 py-3 text-white sm:py-2.5">
                <span className="font-mono text-[9px] tracking-[0.25em] text-marinho-300">RDO Nº</span>
                <span className="num font-display text-[26px] leading-none font-extrabold">{numeroRelatorio(r.numero)}</span>
              </div>
              <div className="flex flex-col items-center justify-center border-l border-linha-forte px-4 py-2 sm:border-t sm:border-l-0">
                <span className="rotulo">Data</span>
                {editavel ? (
                  <input type="date" value={e.cab.data} onChange={(ev) => setCab('data', ev.target.value)} className="num w-[128px] rounded border border-transparent bg-transparent text-center text-[13px] font-semibold hover:border-linha focus:border-marinho-300 focus:outline-none" aria-label="Data do relatório" />
                ) : (
                  <span className="num text-[13px] font-semibold">{formatarData(e.cab.data)}</span>
                )}
                <span className="text-[11px] text-tinta-fraca">{capitalizar(diaDaSemana(e.cab.data))}</span>
              </div>
              <div className="flex items-center justify-center border-l border-linha-forte px-4 py-2 sm:border-t sm:border-l-0">
                <Selo tom={st.tom}>{st.rotulo}</Selo>
              </div>
            </div>
          </header>

          <div className="flex flex-col divide-y divide-dashed divide-linha-forte">
            {/* 01 condições */}
            <Secao n="01" titulo="Condições do dia" icone={<Sun />}>
              <div className="grid gap-3 md:grid-cols-3">
                {PERIODOS.map((p) => {
                  const kc = `clima_${p.chave}` as const
                  const kd = `condicao_${p.chave}` as const
                  return (
                    <div key={p.chave} className="rounded-lg border border-linha bg-papel/40 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-marinho-900">
                        <p.icone className="size-3.5 text-marinho-400" /> {p.rotulo}
                      </p>
                      <SeletorClima valor={e.cab[kc]} aoMudar={(v) => setCab(kc, v)} editavel={editavel} />
                      <SeletorCondicao valor={e.cab[kd]} aoMudar={(v) => setCab(kd, v)} editavel={editavel} />
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <CampoFolha rotulo="Início" icone={<Clock className="size-3" />}>
                  {editavel ? <Entrada type="time" value={e.cab.horario_inicio ?? ''} onChange={(ev) => setCab('horario_inicio', ev.target.value || null)} /> : <Valor>{e.cab.horario_inicio}</Valor>}
                </CampoFolha>
                <CampoFolha rotulo="Término" icone={<Clock className="size-3" />}>
                  {editavel ? <Entrada type="time" value={e.cab.horario_fim ?? ''} onChange={(ev) => setCab('horario_fim', ev.target.value || null)} /> : <Valor>{e.cab.horario_fim}</Valor>}
                </CampoFolha>
                <CampoFolha rotulo="Chuva (mm)" icone={<CloudRain className="size-3" />}>
                  {editavel ? <Entrada inputMode="decimal" value={e.cab.pluviometria_mm} onChange={(ev) => setCab('pluviometria_mm', ev.target.value)} placeholder="0,0" /> : <Valor>{e.cab.pluviometria_mm && `${e.cab.pluviometria_mm.replace('.', ',')} mm`}</Valor>}
                </CampoFolha>
              </div>
            </Secao>

            {/* 02 mão de obra */}
            <Secao n="02" titulo="Mão de obra" icone={<Users />} extra={<span className="num rounded-full bg-marinho-900 px-2 py-0.5 text-[10.5px] font-semibold text-white">Efetivo {totalMO}</span>}>
              <ListaFolha
                itens={e.maoObra}
                editavel={editavel}
                vazio="Nenhum profissional registrado."
                aoAdicionar={() => setLista('maoObra', (l) => [...l, { id: novoId(), relatorio_id: r.id, ordem: l.length, funcao: '', quantidade: 1, tipo: 'propria', empresa_terceira: null }])}
                aoRemover={(i) => setLista('maoObra', (l) => l.filter((_, j) => j !== i))}
                rotuloAdicionar="Adicionar função"
                cabecalho={['Função', 'Vínculo', 'Qtd.']}
                colunas="md:grid-cols-[1fr_260px_80px_32px]"
                renderizar={(m, i) => {
                  const up = (patch: Partial<MaoObra>) => setLista('maoObra', (l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                  return editavel ? (
                    <>
                      <Entrada list="funcoes" value={m.funcao} onChange={(ev) => up({ funcao: ev.target.value })} placeholder="Pedreiro" aria-label="Função" />
                      <div className="flex gap-1.5">
                        <Selecao value={m.tipo} onChange={(ev) => up({ tipo: ev.target.value as TipoMaoObra, empresa_terceira: ev.target.value === 'propria' ? null : m.empresa_terceira })} className="!w-[118px] shrink-0" aria-label="Vínculo">
                          {(Object.keys(TIPO_MAO_OBRA) as TipoMaoObra[]).map((t) => <option key={t} value={t}>{TIPO_MAO_OBRA[t]}</option>)}
                        </Selecao>
                        {m.tipo === 'terceirizada' && <Entrada value={m.empresa_terceira ?? ''} onChange={(ev) => up({ empresa_terceira: ev.target.value || null })} placeholder="Empresa" aria-label="Empresa terceirizada" />}
                      </div>
                      <Entrada type="number" min={1} inputMode="numeric" value={m.quantidade || ''} onChange={(ev) => up({ quantidade: Number(ev.target.value) })} className="num text-right" aria-label="Quantidade" />
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{m.funcao}</span>
                      <span className="text-tinta-suave">{TIPO_MAO_OBRA[m.tipo]}{m.empresa_terceira ? ` · ${m.empresa_terceira}` : ''}</span>
                      <span className="num text-right font-semibold">{m.quantidade}</span>
                    </>
                  )
                }}
              />
            </Secao>

            {/* 03 equipamentos */}
            <Secao n="03" titulo="Equipamentos" icone={<Truck />}>
              <ListaFolha
                itens={e.equipamentos}
                editavel={editavel}
                vazio="Nenhum equipamento registrado."
                aoAdicionar={() => setLista('equipamentos', (l) => [...l, { id: novoId(), relatorio_id: r.id, ordem: l.length, nome: '', quantidade: 1 }])}
                aoRemover={(i) => setLista('equipamentos', (l) => l.filter((_, j) => j !== i))}
                rotuloAdicionar="Adicionar equipamento"
                cabecalho={['Equipamento', 'Qtd.']}
                colunas="md:grid-cols-[1fr_80px_32px]"
                renderizar={(m, i) => {
                  const up = (patch: Partial<Equipamento>) => setLista('equipamentos', (l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                  return editavel ? (
                    <>
                      <Entrada list="equipamentos" value={m.nome} onChange={(ev) => up({ nome: ev.target.value })} placeholder="Betoneira 400 L" aria-label="Equipamento" />
                      <Entrada type="number" min={1} inputMode="numeric" value={m.quantidade || ''} onChange={(ev) => up({ quantidade: Number(ev.target.value) })} className="num text-right" aria-label="Quantidade" />
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{m.nome}</span>
                      <span className="num text-right font-semibold">{m.quantidade}</span>
                    </>
                  )
                }}
              />
            </Secao>

            {/* 04 atividades */}
            <Secao n="04" titulo="Atividades" icone={<Hammer />}>
              <ListaFolha
                itens={e.atividades}
                editavel={editavel}
                vazio="Nenhuma atividade registrada."
                aoAdicionar={() => setLista('atividades', (l) => [...l, { id: novoId(), relatorio_id: r.id, ordem: l.length, descricao: '', status: 'em_andamento', progresso: 0 }])}
                aoRemover={(i) => setLista('atividades', (l) => l.filter((_, j) => j !== i))}
                rotuloAdicionar="Adicionar atividade"
                cabecalho={['Descrição', 'Situação', 'Progresso']}
                colunas="md:grid-cols-[1fr_140px_170px_32px]"
                renderizar={(a, i) => {
                  const up = (patch: Partial<Atividade>) => setLista('atividades', (l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                  return editavel ? (
                    <>
                      <Entrada value={a.descricao} onChange={(ev) => up({ descricao: ev.target.value })} placeholder="Concretagem da laje do 3º pavimento" aria-label="Descrição da atividade" />
                      <Selecao value={a.status} onChange={(ev) => { const s = ev.target.value as StatusAtividade; up({ status: s, progresso: s === 'concluida' ? 100 : a.progresso }) }} aria-label="Situação">
                        {(Object.keys(STATUS_ATIVIDADE) as StatusAtividade[]).map((s) => <option key={s} value={s}>{STATUS_ATIVIDADE[s].rotulo}</option>)}
                      </Selecao>
                      <div className="flex items-center gap-2">
                        <input type="range" min={0} max={100} step={5} value={a.progresso} onChange={(ev) => up({ progresso: Number(ev.target.value) })} className="w-full accent-marinho-700" aria-label="Progresso" />
                        <span className="num w-9 text-right text-[12px] font-semibold text-marinho-900">{a.progresso}%</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{a.descricao}</span>
                      <span><Selo tom={STATUS_ATIVIDADE[a.status].tom}>{STATUS_ATIVIDADE[a.status].rotulo}</Selo></span>
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-marinho-50"><span className="block h-full rounded-full bg-marinho-600" style={{ width: `${a.progresso}%` }} /></span>
                        <span className="num w-9 text-right text-[12px] font-semibold">{a.progresso}%</span>
                      </span>
                    </>
                  )
                }}
              />
            </Secao>

            {/* 05 ocorrências */}
            <Secao n="05" titulo="Ocorrências" icone={<ShieldAlert />}>
              <ListaFolha
                itens={e.ocorrencias}
                editavel={editavel}
                vazio="Sem ocorrências no dia."
                aoAdicionar={() => setLista('ocorrencias', (l) => [...l, { id: novoId(), relatorio_id: r.id, ordem: l.length, descricao: '', tipo: 'geral' }])}
                aoRemover={(i) => setLista('ocorrencias', (l) => l.filter((_, j) => j !== i))}
                rotuloAdicionar="Registrar ocorrência"
                cabecalho={['Tipo', 'Descrição']}
                colunas="md:grid-cols-[140px_1fr_32px]"
                renderizar={(o2, i) => {
                  const up = (patch: Partial<Ocorrencia>) => setLista('ocorrencias', (l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                  return editavel ? (
                    <>
                      <Selecao value={o2.tipo} onChange={(ev) => up({ tipo: ev.target.value as TipoOcorrencia })} aria-label="Tipo de ocorrência">
                        {(Object.keys(TIPO_OCORRENCIA) as TipoOcorrencia[]).map((t) => <option key={t} value={t}>{TIPO_OCORRENCIA[t]}</option>)}
                      </Selecao>
                      <AreaTexto rows={1} value={o2.descricao} onChange={(ev) => up({ descricao: ev.target.value })} className="!min-h-[34px] !py-[7px]" placeholder="Descreva o que aconteceu" aria-label="Descrição da ocorrência" />
                    </>
                  ) : (
                    <>
                      <span><Selo tom={o2.tipo === 'acidente' || o2.tipo === 'seguranca' ? 'perigo' : o2.tipo === 'geral' ? 'neutro' : 'ambar'}>{TIPO_OCORRENCIA[o2.tipo]}</Selo></span>
                      <span className="whitespace-pre-line">{o2.descricao}</span>
                    </>
                  )
                }}
              />
            </Secao>

            {/* 06 materiais */}
            <Secao n="06" titulo="Materiais" icone={<Package />}>
              <ListaFolha
                itens={e.materiais}
                editavel={editavel}
                vazio="Nenhuma movimentação de material."
                aoAdicionar={() => setLista('materiais', (l) => [...l, { id: novoId(), relatorio_id: r.id, ordem: l.length, descricao: '', quantidade: null, tipo: 'recebido' }])}
                aoRemover={(i) => setLista('materiais', (l) => l.filter((_, j) => j !== i))}
                rotuloAdicionar="Adicionar material"
                cabecalho={['Movimento', 'Descrição', 'Quantidade']}
                colunas="md:grid-cols-[130px_1fr_140px_32px]"
                renderizar={(m, i) => {
                  const up = (patch: Partial<Material>) => setLista('materiais', (l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                  return editavel ? (
                    <>
                      <Selecao value={m.tipo} onChange={(ev) => up({ tipo: ev.target.value as TipoMaterial })} aria-label="Movimento">
                        {(Object.keys(TIPO_MATERIAL) as TipoMaterial[]).map((t) => <option key={t} value={t}>{TIPO_MATERIAL[t]}</option>)}
                      </Selecao>
                      <Entrada value={m.descricao} onChange={(ev) => up({ descricao: ev.target.value })} placeholder="Cimento CP-II 50 kg" aria-label="Descrição do material" />
                      <Entrada value={m.quantidade ?? ''} onChange={(ev) => up({ quantidade: ev.target.value || null })} placeholder="40 sacos" aria-label="Quantidade" />
                    </>
                  ) : (
                    <>
                      <span><Selo tom={m.tipo === 'recebido' ? 'marinho' : 'neutro'}>{TIPO_MATERIAL[m.tipo]}</Selo></span>
                      <span className="font-medium">{m.descricao}</span>
                      <span className="text-tinta-suave">{m.quantidade ?? '—'}</span>
                    </>
                  )
                }}
              />
            </Secao>

            {/* 07 observações */}
            <Secao n="07" titulo="Observações" icone={<StickyNote />}>
              {editavel ? (
                <AreaTexto rows={4} value={e.cab.observacoes ?? ''} onChange={(ev) => setCab('observacoes', ev.target.value)} placeholder="Anotações gerais do dia, visitas, orientações da fiscalização…" aria-label="Observações" />
              ) : e.cab.observacoes ? (
                <p className="text-[13px] leading-relaxed whitespace-pre-line text-tinta">{e.cab.observacoes}</p>
              ) : (
                <p className="text-[12.5px] text-tinta-fraca italic">Sem observações.</p>
              )}
            </Secao>

            {/* 08 fotos */}
            <FotosRelatorio relatorioId={r.id} obraId={r.obra_id} empresaId={r.empresa_id} editavel={editavel} />

            {/* assinaturas (visual) */}
            <div className="grid grid-cols-2 gap-6 px-4 pt-10 pb-6 sm:px-6">
              {[['Responsável técnico', o?.responsavel_tecnico], ['Cliente / Fiscalização', o?.contratante]].map(([rot, nome]) => (
                <div key={rot} className="text-center">
                  <div className="border-t border-tinta/60 pt-1.5 text-[12px] font-semibold text-tinta">{nome || ' '}</div>
                  <div className="rotulo">{rot}</div>
                </div>
              ))}
            </div>
          </div>

          <footer className="flex items-center justify-between border-t border-linha-forte bg-papel/60 px-4 py-2 font-mono text-[9.5px] tracking-widest text-tinta-fraca uppercase sm:px-6">
            <span className="flex items-center gap-1.5"><Simbolo tamanho={12} /> obtra · rdo</span>
            <span>atualizado {formatarRelativo(r.atualizado_em)}</span>
          </footer>
        </article>

        {/* ============================ lateral ============================ */}
        <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          <div className="cartao p-4">
            <p className="rotulo mb-3">Ações</p>
            <div className="flex flex-col gap-2">
              {editavel && (
                <Botao onClick={() => void salvar()} carregando={salvando} disabled={!sujo} icone={<Save className="size-4" />} className="w-full">
                  {sujo ? 'Salvar alterações' : 'Tudo salvo'}
                </Botao>
              )}
              <Botao variante="secundario" onClick={() => void pdf()} carregando={gerandoPdf} icone={<FileDown className="size-4" />} className="w-full">
                Baixar PDF
              </Botao>
            </div>
            {transicoes.length > 0 && (
              <>
                <div className="cota my-4" aria-hidden />
                <p className="rotulo mb-2">Fluxo</p>
                <FluxoStatus atual={r.status} />
                <div className="mt-3 flex flex-col gap-2">
                  {transicoes.map((s) => (
                    <Botao
                      key={s}
                      variante={s === 'aprovado' ? 'ambar' : 'secundario'}
                      carregando={mudando === s}
                      onClick={() => void mudarStatus(s)}
                      icone={s === 'aprovado' ? <Check className="size-4" /> : s === 'revisar' ? <Send className="size-3.5" /> : <Undo2 className="size-3.5" />}
                      className="w-full"
                    >
                      {r.status === 'aprovado' && s !== 'aprovado' ? `Reabrir (${STATUS_RELATORIO[s].rotulo.toLowerCase()})` : STATUS_RELATORIO[s].acao}
                    </Botao>
                  ))}
                </div>
              </>
            )}
            {r.status === 'aprovado' && r.aprovado_em && (
              <p className="mt-3 rounded-md bg-ok-50 px-2.5 py-2 text-[11.5px] text-ok-600">Aprovado em {formatarData(r.aprovado_em, "dd/MM/yyyy 'às' HH:mm")}</p>
            )}
            {!editavel && !portal && r.status === 'aprovado' && !ehGestor(perfil.papel) && (
              <p className="mt-3 text-[11.5px] text-tinta-fraca">Relatório aprovado: somente administradores podem editar.</p>
            )}
            {(ehGestor(perfil.papel) || ehMaster) && (
              <button onClick={() => void excluirRelatorio()} className="mt-4 flex items-center gap-1.5 text-[11.5px] font-medium text-perigo-600 hover:underline">
                <Trash2 className="size-3" /> Excluir relatório
              </button>
            )}
          </div>
          <Comentarios relatorioId={r.id} podeComentar={!portal || r.status === 'aprovado'} />
        </aside>
      </div>

      {/* barra flutuante de salvar (mobile) */}
      {editavel && sujo && (
        <div className="pb-seguro anim-subir fixed inset-x-0 bottom-14 z-40 border-t border-linha bg-white/95 px-4 py-2.5 backdrop-blur xl:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[12px] text-tinta-suave"><span className="size-2 rounded-full bg-ambar-500" /> Alterações não salvas</span>
            <Botao onClick={() => void salvar()} carregando={salvando} icone={<Save className="size-4" />}>Salvar</Botao>
          </div>
        </div>
      )}

      <datalist id="funcoes">
        {['Mestre de obras', 'Encarregado', 'Pedreiro', 'Servente', 'Carpinteiro', 'Armador', 'Eletricista', 'Encanador', 'Pintor', 'Azulejista', 'Gesseiro', 'Operador de máquinas', 'Engenheiro', 'Técnico de segurança', 'Almoxarife'].map((f) => <option key={f} value={f} />)}
      </datalist>
      <datalist id="equipamentos">
        {['Betoneira', 'Retroescavadeira', 'Escavadeira', 'Caminhão basculante', 'Caminhão betoneira', 'Grua', 'Mini carregadeira', 'Andaime', 'Vibrador de concreto', 'Compactador de solo', 'Serra circular', 'Martelete', 'Guincho', 'Bomba de concreto'].map((f) => <option key={f} value={f} />)}
      </datalist>
    </div>
  )
}

/* ------------------------------------------------------------ peças -- */
function Secao({ n, titulo, icone, children, extra }: { n: string; titulo: string; icone: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="px-4 py-5 sm:px-6" aria-labelledby={`sec-${n}`}>
      <header className="mb-3.5 flex items-center gap-2.5">
        <span className="num font-mono text-[10.5px] font-semibold text-ambar-600">{n}</span>
        <span className="flex size-6 items-center justify-center rounded-md bg-marinho-50 text-marinho-700 [&_svg]:size-3.5">{icone}</span>
        <h2 id={`sec-${n}`} className="font-display text-[13.5px] font-bold text-marinho-900">{titulo}</h2>
        <span className="h-px flex-1 border-t border-dashed border-linha-forte" />
        {extra}
      </header>
      {children}
    </section>
  )
}

function CampoFolha({ rotulo, icone, children }: { rotulo: string; icone?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="rotulo flex items-center gap-1">{icone}{rotulo}</span>
      {children}
    </label>
  )
}

function Valor({ children }: { children: ReactNode }) {
  return <span className="num text-[13px] font-semibold text-tinta">{children || <span className="font-normal text-tinta-fraca">—</span>}</span>
}

function SeletorClima({ valor, aoMudar, editavel }: { valor: Clima | null; aoMudar: (v: Clima | null) => void; editavel: boolean }) {
  const opcoes: { v: Clima; icone: ReactNode }[] = [
    { v: 'claro', icone: <Sun className="size-4" /> },
    { v: 'nublado', icone: <Cloud className="size-4" /> },
    { v: 'chuvoso', icone: <CloudRain className="size-4" /> },
  ]
  return (
    <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Tempo">
      {opcoes.map((o) => {
        const ativo = valor === o.v
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={!editavel}
            onClick={() => aoMudar(ativo ? null : o.v)}
            className={clsx(
              'flex h-12 flex-col items-center justify-center gap-0.5 rounded-md border text-[10.5px] font-medium transition-colors disabled:cursor-default',
              ativo
                ? o.v === 'claro'
                  ? 'border-ambar-500 bg-ambar-50 text-ambar-700'
                  : 'border-marinho-600 bg-marinho-50 text-marinho-700'
                : clsx('border-linha bg-white text-tinta-fraca', editavel && 'hover:border-marinho-300 hover:text-marinho-700', !editavel && 'opacity-45'),
            )}
          >
            {o.icone}
            {CLIMA[o.v]}
          </button>
        )
      })}
    </div>
  )
}

function SeletorCondicao({ valor, aoMudar, editavel }: { valor: Condicao | null; aoMudar: (v: Condicao | null) => void; editavel: boolean }) {
  return (
    <div className="mt-1.5 grid grid-cols-2 gap-1" role="radiogroup" aria-label="Condição de trabalho">
      {(['praticavel', 'impraticavel'] as Condicao[]).map((c) => {
        const ativo = valor === c
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={!editavel}
            onClick={() => aoMudar(ativo ? null : c)}
            className={clsx(
              'h-7 rounded-md border text-[10.5px] font-semibold transition-colors disabled:cursor-default',
              ativo
                ? c === 'praticavel'
                  ? 'border-ok-600/40 bg-ok-50 text-ok-600'
                  : 'border-perigo-600/40 bg-perigo-50 text-perigo-600'
                : clsx('border-linha bg-white text-tinta-fraca', editavel && 'hover:border-marinho-300', !editavel && 'opacity-45'),
            )}
          >
            {CONDICAO[c]}
          </button>
        )
      })}
    </div>
  )
}

function ListaFolha<T extends { id: string }>({
  itens, editavel, vazio, aoAdicionar, aoRemover, renderizar, cabecalho, colunas, rotuloAdicionar,
}: {
  itens: T[]
  editavel: boolean
  vazio: string
  aoAdicionar: () => void
  aoRemover: (i: number) => void
  renderizar: (item: T, i: number) => ReactNode
  cabecalho: string[]
  colunas: string
  rotuloAdicionar: string
}) {
  return (
    <div>
      {itens.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-linha">
          <div className={clsx('hidden gap-2.5 border-b border-linha bg-papel px-3 py-1.5 md:grid', colunas)}>
            {cabecalho.map((c) => <span key={c} className="rotulo !text-[9.5px]">{c}</span>)}
          </div>
          <ul className="divide-y divide-linha">
            {itens.map((it, i) => (
              <li key={it.id} className={clsx('relative grid items-center gap-2 px-3 py-2 text-[13px] md:gap-2.5', colunas, editavel && 'pr-10 md:pr-3')}>
                {renderizar(it, i)}
                {editavel ? (
                  <button type="button" onClick={() => aoRemover(i)} className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md text-tinta-fraca hover:bg-perigo-50 hover:text-perigo-600 md:static" aria-label="Remover linha">
                    <Trash2 className="size-3.5" />
                  </button>
                ) : (
                  <span className="hidden md:block" />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-linha-forte px-3 py-3 text-center text-[12px] text-tinta-fraca">{vazio}</p>
      )}
      {editavel && (
        <button type="button" onClick={aoAdicionar} className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-semibold text-marinho-600 hover:bg-marinho-50">
          <Plus className="size-3.5" /> {rotuloAdicionar}
        </button>
      )}
    </div>
  )
}

function FluxoStatus({ atual }: { atual: StatusRelatorio }) {
  const passos: StatusRelatorio[] = ['preenchendo', 'revisar', 'aprovado']
  const idx = passos.indexOf(atual)
  return (
    <ol className="flex items-center">
      {passos.map((p, i) => (
        <li key={p} className="flex flex-1 items-center last:flex-none">
          <span className="flex flex-col items-center gap-1">
            <span className={clsx('flex size-5 items-center justify-center rounded-full border text-[9px] font-bold', i < idx ? 'border-marinho-700 bg-marinho-700 text-white' : i === idx ? 'border-ambar-500 bg-ambar-50 text-ambar-700' : 'border-linha-forte bg-white text-tinta-fraca')}>
              {i < idx ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={clsx('text-[9.5px] font-medium', i === idx ? 'text-marinho-900' : 'text-tinta-fraca')}>{STATUS_RELATORIO[p].rotulo}</span>
          </span>
          {i < passos.length - 1 && <span className={clsx('mx-1 mb-4 h-px flex-1', i < idx ? 'bg-marinho-700' : 'border-t border-dashed border-linha-forte')} />}
        </li>
      ))}
    </ol>
  )
}

function LogoEmpresa({ empresaId }: { empresaId: string }) {
  const { empresas } = useSessao()
  const emp = empresas.find((x) => x.id === empresaId)
  if (!emp?.logo_path) return <Simbolo tamanho={40} />
  return <ImagemAssinada caminho={emp.logo_path} alt={emp.nome} className="size-11 shrink-0 rounded-md border border-linha bg-white" classeImg="!object-contain p-1" />
}

function FotosRelatorio({ relatorioId, obraId, empresaId, editavel }: { relatorioId: string; obraId: string; empresaId: string; editavel: boolean }) {
  const avisos = useAvisos()
  const qc = useQueryClient()
  const fotos = useFotosRelatorio(relatorioId)
  const { enviar, progresso } = useEnvioFotos({ empresaId, obraId, relatorioId }, avisos.erro)
  async function excluir(f: Foto) {
    const ok = await avisos.confirmar({ titulo: 'Excluir foto?', confirmar: 'Excluir', perigo: true, descricao: 'A foto será removida do relatório e do armazenamento.' })
    if (!ok) return
    try {
      await excluirFoto(f)
      void qc.invalidateQueries({ queryKey: ['fotos-relatorio', relatorioId] })
      void qc.invalidateQueries({ queryKey: ['fotos', obraId] })
    } catch (e) {
      avisos.erro(e)
    }
  }
  async function legendar(f: Foto, legenda: string) {
    const { error } = await supabase.from('fotos').update({ legenda: legenda || null }).eq('id', f.id)
    if (error) avisos.erro(error)
    else {
      void qc.invalidateQueries({ queryKey: ['fotos-relatorio', relatorioId] })
      void qc.invalidateQueries({ queryKey: ['fotos', obraId] })
    }
  }
  return (
    <Secao n="08" titulo="Registro fotográfico" icone={<Camera />} extra={<span className="num text-[11px] text-tinta-fraca">{fotos.data?.length ?? 0} foto(s)</span>}>
      <div className="flex flex-col gap-3">
        {editavel && <EnvioDeFotos aoEnviar={(a) => void enviar(a)} progresso={progresso} compacto rotulo="Fotos do dia" />}
        <Galeria
          fotos={fotos.data ?? []}
          colunas="compacta"
          aoExcluir={editavel ? (f) => void excluir(f) : undefined}
          aoLegendar={editavel ? (f, l) => void legendar(f, l) : undefined}
          vazio={!editavel && <p className="text-[12.5px] text-tinta-fraca italic">Sem fotos neste relatório.</p>}
        />
      </div>
    </Secao>
  )
}

function Comentarios({ relatorioId, podeComentar }: { relatorioId: string; podeComentar: boolean }) {
  const perfil = usePerfil()
  const avisos = useAvisos()
  const qc = useQueryClient()
  const lista = useComentarios(relatorioId)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function enviar() {
    const t = texto.trim()
    if (!t) return
    setEnviando(true)
    const { error } = await supabase.from('relatorio_comentarios').insert({ relatorio_id: relatorioId, texto: t })
    setEnviando(false)
    if (error) return avisos.erro(error)
    setTexto('')
    void qc.invalidateQueries({ queryKey: ['comentarios', relatorioId] })
  }
  async function excluir(id: string) {
    const { error } = await supabase.from('relatorio_comentarios').delete().eq('id', id)
    if (error) return avisos.erro(error)
    void qc.invalidateQueries({ queryKey: ['comentarios', relatorioId] })
  }
  return (
    <div className="cartao">
      <header className="flex items-center gap-2 border-b border-linha px-4 py-3">
        <MessageSquare className="size-3.5 text-marinho-500" />
        <h2 className="font-display text-[13px] font-bold text-marinho-900">Comentários</h2>
        <span className="num ml-auto text-[11px] text-tinta-fraca">{lista.data?.length ?? 0}</span>
      </header>
      <div className="rolagem-fina max-h-[380px] overflow-y-auto">
        {!lista.data?.length ? (
          <p className="px-4 py-5 text-center text-[12px] text-tinta-fraca">Nenhum comentário.</p>
        ) : (
          <ul className="flex flex-col gap-3 p-4">
            {lista.data.map((c) => {
              const meu = c.autor_id === perfil.id
              return (
                <li key={c.id} className="group flex gap-2.5">
                  <Avatar nome={c.autor?.nome ?? '?'} tamanho={24} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-1.5 text-[11.5px]">
                      <span className="truncate font-semibold text-tinta">{meu ? 'Você' : (c.autor?.nome ?? 'Usuário')}</span>
                      {c.autor?.papel && <span className="text-tinta-fraca">· {PAPEL[c.autor.papel as keyof typeof PAPEL] ?? c.autor.papel}</span>}
                    </p>
                    <p className={clsx('mt-0.5 rounded-lg rounded-tl-sm px-2.5 py-1.5 text-[12.5px] whitespace-pre-line', c.autor?.papel === 'cliente' ? 'bg-ambar-50 text-tinta' : 'bg-marinho-50 text-tinta')}>{c.texto}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[10.5px] text-tinta-fraca">
                      {formatarDataExtensa(c.criado_em)}
                      {(meu || ehGestor(perfil.papel)) && (
                        <button onClick={() => void excluir(c.id)} className="opacity-0 group-hover:opacity-100 hover:text-perigo-600 focus:opacity-100">excluir</button>
                      )}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {podeComentar && (
        <div className="border-t border-linha p-3">
          <AreaTexto
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void enviar()
            }}
            placeholder="Escreva um comentário…"
            aria-label="Novo comentário"
            className="!min-h-[56px]"
          />
          <div className="mt-2 flex justify-end">
            <Botao tamanho="p" onClick={() => void enviar()} carregando={enviando} disabled={!texto.trim()} icone={<Send className="size-3" />}>Comentar</Botao>
          </div>
        </div>
      )}
    </div>
  )
}

