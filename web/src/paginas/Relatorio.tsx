import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  ArrowLeft, CalendarClock, Camera, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Clock, Cloud, CloudRain, Copy, FileDown,
  FileText, Hammer, MessageSquare, Moon, PackageCheck, PackageMinus, Plus, Receipt, Save, Send, ShieldAlert, StickyNote, Sun, Sunrise,
  Sunset, Trash2, Truck, Undo2, UserPlus, Users,
} from 'lucide-react'
import type {
  Atividade, Clima, Condicao, Equipamento, Foto, MaoObra, Material, NotaCompra, Ocorrencia, StatusAtividade,
  StatusRelatorio, TipoMaoObra, TipoMaterial, TipoOcorrencia,
} from '@/tipos/banco'
import { paraNumero } from '@/tipos/banco'
import {
  carregarRelatorio, useCadastro, useComentarios, useEnvioFotos, useFotosRelatorio, useObra, useObras, useRelatorio, useRelatorios,
  type RelatorioCompleto,
} from '@/lib/consultas'
import { usePerfil, useSessao } from '@/lib/sessao'
import { ehGestor, podeEditarRelatorio } from '@/lib/permissoes'
import { supabase, exigir, mensagemDeErro } from '@/lib/supabase'
import { excluirFoto } from '@/lib/armazenamento'
import { calcularPrazo } from '@/lib/prazo'
import { formatarDuracao, minutosTrabalhados } from '@/lib/horario'
import {
  capitalizar, codigoRelatorio, diaDaSemana, formatarData, formatarDataExtensa, formatarMoeda, formatarRelativo, hojeISO, lerNumero,
} from '@/lib/formato'
import {
  CLIMA, CONDICAO, PAPEL, STATUS_ATIVIDADE, STATUS_RELATORIO, TIPO_MAO_OBRA, TIPO_OCORRENCIA, UNIDADES,
} from '@/lib/rotulos'
import { AreaTexto, Avatar, Botao, CampoHora, CampoTexto, EntradaData, CarregandoPagina, Entrada, Erro, Modal, Selecao, Selo, Vazio, Campo } from '@/componentes/ui'
import { EnvioDeFotos, Galeria } from '@/componentes/midia'
import { useAvisos } from '@/componentes/avisos'
import { useTitulo } from '@/lib/titulo'

const novoId = () => crypto.randomUUID()

/* ======================================================================= */
export default function PaginaRelatorio() {
  const { id } = useParams()
  const q = useRelatorio(id === 'novo' ? undefined : id)
  useTitulo(id === 'novo' ? 'Novo RDO' : q.data ? `RD-${q.data.relatorio.numero}` : 'Relatório')
  if (id === 'novo') return <EditorRelatorio key="novo" dados={null} />
  if (q.isLoading) return <CarregandoPagina texto="Abrindo relatório…" />
  if (q.isError) return <Erro mensagem={mensagemDeErro(q.error)} aoTentar={() => void q.refetch()} />
  if (!q.data) return <Vazio titulo="Relatório não encontrado" descricao="Ele pode ter sido excluído, ou ainda não foi aprovado para visualização." />
  return <EditorRelatorio key={id} dados={q.data} />
}

/* ================================================================ estado */
interface Cabecalho {
  data: string
  responsavel: string
  horario_inicio: string
  horario_fim: string
  intervalo_inicio: string
  intervalo_fim: string
  clima_manha: Clima | null
  clima_tarde: Clima | null
  clima_noite: Clima | null
  condicao_manha: Condicao | null
  condicao_tarde: Condicao | null
  condicao_noite: Condicao | null
  pluviometria_mm: string
  observacoes: string
}
interface Estado {
  obraId: string
  cab: Cabecalho
  maoObra: MaoObra[]
  equipamentos: Equipamento[]
  atividades: Atividade[]
  ocorrencias: Ocorrencia[]
  materiais: Material[]
  notas: NotaCompra[]
}
type ChaveLista = 'maoObra' | 'equipamentos' | 'atividades' | 'ocorrencias' | 'materiais' | 'notas'
const TABELAS: Record<ChaveLista, string> = {
  maoObra: 'relatorio_mao_obra',
  equipamentos: 'relatorio_equipamentos',
  atividades: 'relatorio_atividades',
  ocorrencias: 'relatorio_ocorrencias',
  materiais: 'relatorio_materiais',
  notas: 'relatorio_notas_compras',
}
const h5 = (h: string | null | undefined) => (h ? h.slice(0, 5) : '')

function estadoDe(d: RelatorioCompleto | null, obraId: string, responsavel: string): Estado {
  const r = d?.relatorio
  return {
    obraId: r?.obra_id ?? obraId,
    cab: {
      data: r?.data ?? hojeISO(),
      responsavel: r?.responsavel ?? responsavel,
      horario_inicio: h5(r?.horario_inicio),
      horario_fim: h5(r?.horario_fim),
      intervalo_inicio: h5(r?.intervalo_inicio),
      intervalo_fim: h5(r?.intervalo_fim),
      clima_manha: r?.clima_manha ?? null,
      clima_tarde: r?.clima_tarde ?? null,
      clima_noite: r?.clima_noite ?? null,
      condicao_manha: r?.condicao_manha ?? null,
      condicao_tarde: r?.condicao_tarde ?? null,
      condicao_noite: r?.condicao_noite ?? null,
      pluviometria_mm: r?.pluviometria_mm === null || r?.pluviometria_mm === undefined ? '' : String(paraNumero(r.pluviometria_mm)).replace('.', ','),
      observacoes: r?.observacoes ?? '',
    },
    maoObra: d?.maoObra ?? [],
    equipamentos: d?.equipamentos ?? [],
    atividades: d?.atividades ?? [],
    ocorrencias: d?.ocorrencias ?? [],
    materiais: d?.materiais ?? [],
    notas: d?.notas ?? [],
  }
}

/** Linhas sem o texto principal não são gravadas. */
export function linhaPreenchida(chave: ChaveLista, l: Record<string, unknown>): boolean {
  const texto = (k: string) => typeof l[k] === 'string' && (l[k] as string).trim().length > 0
  if (chave === 'maoObra') return texto('funcao') || !!l.colaborador_id
  if (chave === 'equipamentos') return texto('nome')
  if (chave === 'notas') return texto('fornecedor') || texto('numero_nota') || texto('descricao') || l.valor !== null
  return texto('descricao')
}

/* ================================================================ editor */
function EditorRelatorio({ dados }: { dados: RelatorioCompleto | null }) {
  const r = dados?.relatorio ?? null
  const novo = !r
  const perfil = usePerfil()
  const avisos = useAvisos()
  const qc = useQueryClient()
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const obras = useObras()
  const portal = perfil.papel === 'cliente'
  const status: StatusRelatorio = r?.status ?? 'preenchendo'
  const editavel = podeEditarRelatorio(perfil.papel, status)
  const [base, setBase] = useState(() => estadoDe(dados, params.get('obra') ?? '', perfil.nome))
  const [e, setE] = useState(base)
  const [ocupado, setOcupado] = useState<null | 'salvar' | 'revisar' | 'aprovar' | 'preenchendo' | 'pdf'>(null)
  const sujo = useMemo(() => JSON.stringify(e) !== JSON.stringify(base), [e, base])
  const obra = useObra(e.obraId || undefined)
  const lista = useRelatorios(r?.obra_id)
  const o = obra.data

  const vizinhos = useMemo(() => {
    const l = lista.data ?? []
    const i = r ? l.findIndex((x) => x.id === r.id) : -1
    return { anterior: i >= 0 ? l[i + 1] : undefined, proximo: i > 0 ? l[i - 1] : undefined }
  }, [lista.data, r])
  const baseUrl = portal ? '/portal/relatorios' : '/relatorios'
  const voltar = portal ? (r ? `/portal/obras/${r.obra_id}` : '/portal') : '/relatorios'

  const setCab = <K extends keyof Cabecalho>(k: K, v: Cabecalho[K]) => setE((x) => ({ ...x, cab: { ...x.cab, [k]: v } }))
  const setLista = useCallback(<K extends ChaveLista>(k: K, fn: (l: Estado[K]) => Estado[K]) => setE((x) => ({ ...x, [k]: fn(x[k]) })), [])
  const relId = r?.id ?? 'novo'

  /* ---------------------------------------------------------- gravar -- */
  const gravar = useCallback(async (): Promise<string | null> => {
    const pluv = lerNumero(e.cab.pluviometria_mm)
    if (e.cab.pluviometria_mm.trim() && (pluv === null || pluv < 0)) {
      avisos.erro('Pluviometria inválida.')
      return null
    }
    // (?obra= na URL pode trazer uma obra que o usuário não enxerga)
    if (novo && (!e.obraId || (obras.data && !obras.data.some((x) => x.id === e.obraId)))) {
      avisos.erro('Escolha a obra do relatório.')
      return null
    }
    if (e.maoObra.some((m) => !(m.quantidade > 0)) || e.equipamentos.some((m) => !(m.quantidade > 0))) {
      avisos.erro('Quantidades devem ser maiores que zero.')
      return null
    }
    let id = r?.id
    if (!id) {
      const res = await supabase.rpc('criar_relatorio', { p_obra: e.obraId, p_data: e.cab.data, p_copiar_anterior: false })
      if (res.error) throw res.error
      id = res.data as string
    }
    const { error } = await supabase
      .from('relatorios')
      .update({
        data: e.cab.data,
        responsavel: e.cab.responsavel.trim() || null,
        horario_inicio: e.cab.horario_inicio || null,
        horario_fim: e.cab.horario_fim || null,
        intervalo_inicio: e.cab.intervalo_inicio || null,
        intervalo_fim: e.cab.intervalo_fim || null,
        clima_manha: e.cab.clima_manha,
        clima_tarde: e.cab.clima_tarde,
        clima_noite: e.cab.clima_noite,
        condicao_manha: e.cab.condicao_manha,
        condicao_tarde: e.cab.condicao_tarde,
        condicao_noite: e.cab.condicao_noite,
        pluviometria_mm: pluv,
        observacoes: e.cab.observacoes.trim() || null,
      })
      .eq('id', id)
    if (error) throw error
    const limpo: Estado = { ...e }
    for (const chave of Object.keys(TABELAS) as ChaveLista[]) {
      const atuais = (e[chave] as unknown as Record<string, unknown>[]).filter((l) => linhaPreenchida(chave, l))
      const ids = new Set(atuais.map((l) => l.id as string))
      const removidos = novo ? [] : (base[chave] as unknown as { id: string }[]).map((l) => l.id).filter((x) => !ids.has(x))
      if (removidos.length) {
        const { error: er } = await supabase.from(TABELAS[chave]).delete().in('id', removidos)
        if (er) throw er
      }
      if (atuais.length) {
        const linhas = atuais.map((l, i) => {
          const copia: Record<string, unknown> = { ...l, relatorio_id: id, ordem: i }
          delete copia.criado_em
          if (chave === 'materiais') copia.quantidade = lerNumero(copia.quantidade as string | number | null)
          if (chave === 'notas') copia.valor = lerNumero(copia.valor as string | number | null)
          return copia
        })
        const { error: eu } = await supabase.from(TABELAS[chave]).upsert(linhas, { onConflict: 'id' })
        if (eu) throw eu
      }
      ;(limpo as unknown as Record<string, unknown>)[chave] = atuais
    }
    setE(limpo)
    setBase(limpo)
    void qc.invalidateQueries({ queryKey: ['relatorios'] })
    void qc.invalidateQueries({ queryKey: ['relatorios-empresa'] })
    void qc.invalidateQueries({ queryKey: ['relatorios-recentes'] })
    void qc.invalidateQueries({ queryKey: ['painel'] })
    return id
  }, [e, base, r?.id, novo, avisos, qc, obras.data])

  async function acao(tipo: 'salvar' | 'revisar' | 'aprovar' | 'preenchendo') {
    if (tipo === 'aprovar') {
      const ok = await avisos.confirmar({ titulo: 'Salvar e aprovar?', descricao: 'O relatório aprovado fica visível ao cliente e só administradores podem editá-lo.', confirmar: 'Aprovar' })
      if (!ok) return
    }
    setOcupado(tipo)
    try {
      const id = editavel && (sujo || novo) ? await gravar() : (r?.id ?? null)
      if (!id) return
      const alvo: StatusRelatorio | null = tipo === 'revisar' ? 'revisar' : tipo === 'aprovar' ? 'aprovado' : tipo === 'preenchendo' ? 'preenchendo' : null
      if (alvo && alvo !== status) {
        const { error } = await supabase.rpc('mudar_status_relatorio', { p_relatorio: id, p_status: alvo })
        if (error) throw error
      }
      avisos.sucesso(
        tipo === 'salvar' ? 'Relatório salvo.' : tipo === 'revisar' ? 'Enviado para aprovação.' : tipo === 'aprovar' ? 'Relatório aprovado.' : 'Relatório reaberto como rascunho.',
      )
      await qc.invalidateQueries({ queryKey: ['relatorio', id] })
      void qc.invalidateQueries({ queryKey: ['relatorios-empresa'] })
      if (novo) navegar(`/relatorios/${id}`, { replace: true })
    } catch (err) {
      avisos.erro(err)
    } finally {
      setOcupado(null)
    }
  }

  async function pdf() {
    if (!r) return
    if (sujo && editavel) {
      setOcupado('salvar')
      try {
        await gravar()
      } catch (err) {
        avisos.erro(err)
        setOcupado(null)
        return
      }
    }
    setOcupado('pdf')
    try {
      const { baixarPdfRelatorio } = await import('@/lib/pdf-rdo')
      await baixarPdfRelatorio(r.id)
    } catch (err) {
      avisos.erro(err)
    } finally {
      setOcupado(null)
    }
  }

  async function excluir() {
    if (!r) return
    const ok = await avisos.confirmar({ titulo: `Excluir ${codigoRelatorio(r.numero)}?`, descricao: 'O relatório e seus itens serão apagados. As fotos continuam na galeria da obra.', confirmar: 'Excluir', perigo: true })
    if (!ok) return
    const { error } = await supabase.from('relatorios').delete().eq('id', r.id)
    if (error) return avisos.erro(error)
    void qc.invalidateQueries({ queryKey: ['relatorios'] })
    void qc.invalidateQueries({ queryKey: ['relatorios-empresa'] })
    void qc.invalidateQueries({ queryKey: ['painel'] })
    avisos.sucesso('Relatório excluído.')
    navegar('/relatorios', { replace: true })
  }

  /** Traz mão de obra, equipamentos, horário e responsável do último RDO da obra. */
  async function copiarAnterior() {
    if (!e.obraId) return avisos.erro('Escolha a obra primeiro.')
    const ult = exigir(
      await supabase.from('relatorios').select('id').eq('obra_id', e.obraId).order('numero', { ascending: false }).limit(1),
    ) as { id: string }[]
    if (!ult[0]) return avisos.info('Esta obra ainda não tem relatórios.')
    const d = await carregarRelatorio(ult[0].id)
    if (!d) return
    setE((x) => ({
      ...x,
      cab: {
        ...x.cab,
        horario_inicio: h5(d.relatorio.horario_inicio) || x.cab.horario_inicio,
        horario_fim: h5(d.relatorio.horario_fim) || x.cab.horario_fim,
        intervalo_inicio: h5(d.relatorio.intervalo_inicio) || x.cab.intervalo_inicio,
        intervalo_fim: h5(d.relatorio.intervalo_fim) || x.cab.intervalo_fim,
        responsavel: d.relatorio.responsavel || x.cab.responsavel,
      },
      maoObra: d.maoObra.map((m) => ({ ...m, id: novoId(), relatorio_id: relId })),
      equipamentos: d.equipamentos.map((m) => ({ ...m, id: novoId(), relatorio_id: relId })),
    }))
    avisos.sucesso(`Copiado do ${codigoRelatorio(d.relatorio.numero)}.`)
  }

  // Ctrl+S e aviso ao sair
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        if (editavel && (sujo || novo) && !ocupado) void acao('salvar')
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
  })

  /* -------------------------------------------------------- derivados -- */
  const prazo = o ? calcularPrazo(o, new Date(`${e.cab.data}T12:00:00`)) : null
  const minutos = minutosTrabalhados(e.cab.horario_inicio, e.cab.horario_fim, e.cab.intervalo_inicio, e.cab.intervalo_fim)
  const totalMO = e.maoObra.reduce((s, m) => s + (m.quantidade || 0), 0)
  const recebidos = e.materiais.filter((m) => m.tipo === 'recebido')
  const utilizados = e.materiais.filter((m) => m.tipo === 'utilizado')
  const st = STATUS_RELATORIO[status]
  const gestor = ehGestor(perfil.papel)
  // Novo RDO: mostra o número que a obra vai dar (o banco numera de verdade ao salvar).
  const proximoNumero = useQuery({
    queryKey: ['proximo-numero-rdo', e.obraId],
    enabled: novo && !!e.obraId,
    queryFn: async () => {
      const d = exigir(await supabase.from('relatorios').select('numero').eq('obra_id', e.obraId).order('numero', { ascending: false }).limit(1))
      return (d[0]?.numero ?? 0) + 1
    },
  })
  const obrasSelecionaveis = (obras.data ?? []).filter((x) => x.status !== 'concluida' || x.id === e.obraId)

  return (
    <div className="pb-24">
      {/* ---------------------------------------------------- cabeçalho -- */}
      <nav className="mb-2 flex items-center gap-1.5 text-[12px] text-tinta-suave" aria-label="Trilha">
        <Link to={voltar} className="inline-flex items-center gap-1 hover:text-marinho-900">
          <ArrowLeft className="size-3.5" /> {portal ? (o?.nome ?? 'Obra') : 'Relatórios'}
        </Link>
        <span className="text-tinta-fraca">/</span>
        <span className="font-mono text-[11px] text-marinho-600">{r ? codigoRelatorio(r.numero) : 'Novo RDO'}</span>
      </nav>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-extrabold text-marinho-900 sm:text-[25px]">{novo ? 'Novo Relatório Diário' : `Relatório Diário · ${codigoRelatorio(r.numero)}`}</h1>
          <p className="mt-0.5 text-[12.5px] text-tinta-suave">
            {novo ? 'Preencha as seções abaixo. O número é gerado ao salvar.' : `${o?.nome ?? '…'} · ${capitalizar(diaDaSemana(e.cab.data))}, ${formatarDataExtensa(e.cab.data)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Selo tom={st.tom}>{st.rotulo}</Selo>
          {r && (
            <div className="flex items-center rounded-md border border-linha-forte bg-white">
              <button className="flex size-8 items-center justify-center text-tinta-suave hover:text-marinho-900 disabled:opacity-30" disabled={!vizinhos.anterior} onClick={() => vizinhos.anterior && navegar(`${baseUrl}/${vizinhos.anterior.id}`)} aria-label="Relatório anterior" title="Relatório anterior"><ChevronLeft className="size-4" /></button>
              <span className="h-5 w-px bg-linha" />
              <button className="flex size-8 items-center justify-center text-tinta-suave hover:text-marinho-900 disabled:opacity-30" disabled={!vizinhos.proximo} onClick={() => vizinhos.proximo && navegar(`${baseUrl}/${vizinhos.proximo.id}`)} aria-label="Próximo relatório" title="Próximo relatório"><ChevronRight className="size-4" /></button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        {/* 01 cabeçalho */}
        <Painel n="01" titulo="Cabeçalho do Relatório" icone={<FileText />}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Campo rotulo="Nº do relatório" dica={novo ? 'Automático, por obra' : undefined}>
              <Entrada readOnly value={r ? codigoRelatorio(r.numero) : proximoNumero.data ? codigoRelatorio(proximoNumero.data) : e.obraId ? 'RD-…' : 'Escolha a obra'} className="num font-mono" tabIndex={-1} />
            </Campo>
            <Campo rotulo="Obra" htmlFor="rdo-obra" obrigatorio={novo}>
              {novo ? (
                <Selecao id="rdo-obra" value={e.obraId} onChange={(ev) => setE((x) => ({ ...x, obraId: ev.target.value }))}>
                  <option value="">Selecione…</option>
                  {obrasSelecionaveis.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </Selecao>
              ) : (
                <Entrada readOnly value={o?.nome ?? ''} tabIndex={-1} />
              )}
            </Campo>
            <Campo rotulo="Data" htmlFor="rdo-data">
              <EntradaData id="rdo-data" valor={e.cab.data} aoMudar={(v) => v && setCab('data', v)} readOnly={!editavel} />
            </Campo>
            <Campo rotulo="Dia da semana">
              <Entrada readOnly value={capitalizar(diaDaSemana(e.cab.data))} tabIndex={-1} />
            </Campo>
            <Campo rotulo="Responsável" htmlFor="rdo-resp">
              <Entrada id="rdo-resp" value={e.cab.responsavel} onChange={(ev) => setCab('responsavel', ev.target.value)} readOnly={!editavel} />
            </Campo>
          </div>
          {novo && (
            <button type="button" onClick={() => void copiarAnterior()} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-linha-forte px-2.5 py-1.5 text-[12px] font-medium text-marinho-600 hover:border-marinho-300 hover:bg-marinho-50">
              <Copy className="size-3.5" /> Copiar mão de obra, equipamentos e horário do último RDO da obra
            </button>
          )}
        </Painel>

        {/* 02 prazo */}
        <Painel n="02" titulo="Informações de Prazo" icone={<CalendarClock />}>
          <div className="grid gap-3 sm:grid-cols-3">
            <CartaoPrazo rotulo="Prazo contratual" valor={prazo?.definido ? prazo.total : null} />
            <CartaoPrazo rotulo="Prazo decorrido" valor={prazo?.definido ? prazo.decorridos : null} destaque />
            <CartaoPrazo rotulo="Prazo a vencer" valor={prazo?.definido ? prazo.restantes : null} alerta={!!prazo?.atrasado} />
          </div>
          {!e.obraId && <p className="mt-2 text-[11.5px] text-tinta-fraca">Escolha a obra para calcular o prazo.</p>}
        </Painel>

        {/* 03 horário */}
        <Painel n="03" titulo="Horário de Trabalho" icone={<Clock />}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <CampoHora rotulo="Entrada" valor={e.cab.horario_inicio} aoMudar={(v) => setCab('horario_inicio', v)} readOnly={!editavel} />
            <CampoHora rotulo="Saída" valor={e.cab.horario_fim} aoMudar={(v) => setCab('horario_fim', v)} readOnly={!editavel} />
            <CampoHora rotulo="Intervalo início" valor={e.cab.intervalo_inicio} aoMudar={(v) => setCab('intervalo_inicio', v)} readOnly={!editavel} />
            <CampoHora rotulo="Intervalo fim" valor={e.cab.intervalo_fim} aoMudar={(v) => setCab('intervalo_fim', v)} readOnly={!editavel} />
            <Campo rotulo="Horas trabalhadas">
              <div className="num flex h-[34px] items-center justify-center rounded-md border border-ambar-400/50 bg-ambar-50 font-mono text-[14px] font-semibold text-marinho-900">{formatarDuracao(minutos)}</div>
            </Campo>
          </div>
        </Painel>

        {/* 04 clima */}
        <Painel n="04" titulo="Condição Climática" icone={<Sun />}>
          <div className="grid gap-3 md:grid-cols-3">
            {([
              ['manha', 'Manhã', Sunrise],
              ['tarde', 'Tarde', Sunset],
              ['noite', 'Noite', Moon],
            ] as const).map(([k, rot, Icone]) => (
              <div key={k} className="rounded-lg border border-linha bg-papel/40 p-3">
                <div className="mb-2.5 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-marinho-900"><Icone className="size-3.5 text-marinho-400" /> {rot}</p>
                  {k === 'noite' && <span className="text-[10.5px] text-tinta-fraca">opcional</span>}
                </div>
                <p className="rotulo mb-1">Clima</p>
                <SeletorClima valor={e.cab[`clima_${k}`]} aoMudar={(v) => setCab(`clima_${k}`, v)} editavel={editavel} />
                <p className="rotulo mt-2.5 mb-1">Condição</p>
                <SeletorCondicao valor={e.cab[`condicao_${k}`]} aoMudar={(v) => setCab(`condicao_${k}`, v)} editavel={editavel} />
              </div>
            ))}
          </div>
          <div className="mt-3 max-w-[200px]">
            <CampoTexto rotulo="Pluviometria (mm)" inputMode="decimal" value={e.cab.pluviometria_mm} onChange={(ev) => setCab('pluviometria_mm', ev.target.value)} placeholder="0,0" readOnly={!editavel} />
          </div>
        </Painel>

        {/* 05 mão de obra */}
        <SecaoMaoObra itens={e.maoObra} editavel={editavel} empresaId={o?.empresa_id} relId={relId} setLista={setLista} total={totalMO} />

        {/* 06 equipamentos */}
        <SecaoEquipamentos itens={e.equipamentos} editavel={editavel} empresaId={o?.empresa_id} relId={relId} setLista={setLista} />

        {/* 07 atividades */}
        <Painel n="07" titulo="Atividades Realizadas" icone={<Hammer />} contagem={e.atividades.length}>
          <Linhas
            itens={e.atividades}
            editavel={editavel}
            vazio="Nenhuma atividade registrada."
            cabecalho={['Descrição', 'Situação', 'Progresso']}
            colunas="md:grid-cols-[1fr_150px_180px_32px]"
            celular="grid-cols-2 [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1"
            aoRemover={(i) => setLista('atividades', (l) => l.filter((_, j) => j !== i))}
            botoes={editavel && <BotaoLinha onClick={() => setLista('atividades', (l) => [...l, { id: novoId(), relatorio_id: relId, ordem: l.length, descricao: '', status: 'em_andamento', progresso: 0 }])}>Adicionar atividade</BotaoLinha>}
            renderizar={(a, i) => {
              const up = (p: Partial<Atividade>) => setLista('atividades', (l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)))
              return editavel ? (
                <>
                  <Entrada value={a.descricao} onChange={(ev) => up({ descricao: ev.target.value })} placeholder="Concretagem da laje do 3º pavimento" aria-label="Descrição" />
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
        </Painel>

        {/* 08 ocorrências */}
        <Painel n="08" titulo="Ocorrências" icone={<ShieldAlert />} contagem={e.ocorrencias.length}>
          <Linhas
            itens={e.ocorrencias}
            editavel={editavel}
            vazio="Sem ocorrências no dia."
            cabecalho={['Tipo', 'Descrição']}
            colunas="md:grid-cols-[150px_1fr_32px]"
            aoRemover={(i) => setLista('ocorrencias', (l) => l.filter((_, j) => j !== i))}
            botoes={editavel && <BotaoLinha onClick={() => setLista('ocorrencias', (l) => [...l, { id: novoId(), relatorio_id: relId, ordem: l.length, descricao: '', tipo: 'geral' }])}>Registrar ocorrência</BotaoLinha>}
            renderizar={(x, i) => {
              const up = (p: Partial<Ocorrencia>) => setLista('ocorrencias', (l) => l.map((y, j) => (j === i ? { ...y, ...p } : y)))
              return editavel ? (
                <>
                  <Selecao value={x.tipo} onChange={(ev) => up({ tipo: ev.target.value as TipoOcorrencia })} aria-label="Tipo">
                    {(Object.keys(TIPO_OCORRENCIA) as TipoOcorrencia[]).map((t) => <option key={t} value={t}>{TIPO_OCORRENCIA[t]}</option>)}
                  </Selecao>
                  <AreaTexto rows={1} value={x.descricao} onChange={(ev) => up({ descricao: ev.target.value })} className="!min-h-[34px] !py-[7px]" placeholder="Descreva o que aconteceu" aria-label="Descrição" />
                </>
              ) : (
                <>
                  <span><Selo tom={x.tipo === 'acidente' || x.tipo === 'seguranca' ? 'perigo' : x.tipo === 'geral' ? 'neutro' : 'ambar'}>{TIPO_OCORRENCIA[x.tipo]}</Selo></span>
                  <span className="whitespace-pre-line">{x.descricao}</span>
                </>
              )
            }}
          />
        </Painel>

        {/* 09 comentários */}
        <Painel n="09" titulo="Comentários" icone={<MessageSquare />} contagem={undefined} inicialAberto={!novo}>
          <div className="mb-4">
            <p className="rotulo mb-1.5 flex items-center gap-1.5"><StickyNote className="size-3" /> Observações gerais do dia</p>
            {editavel ? (
              <AreaTexto rows={3} value={e.cab.observacoes} onChange={(ev) => setCab('observacoes', ev.target.value)} placeholder="Visitas, orientações da fiscalização, pendências…" aria-label="Observações" />
            ) : e.cab.observacoes ? (
              <p className="text-[13px] leading-relaxed whitespace-pre-line">{e.cab.observacoes}</p>
            ) : (
              <p className="text-[12.5px] text-tinta-fraca italic">Sem observações.</p>
            )}
          </div>
          {r ? <Comentarios relatorioId={r.id} podeComentar={!portal || status === 'aprovado'} /> : <p className="text-[12px] text-tinta-fraca">Os comentários ficam disponíveis depois de salvar o rascunho.</p>}
        </Painel>

        {/* 10/11 materiais */}
        <SecaoMateriais n="10" titulo="Materiais Recebidos" tipo="recebido" icone={<PackageCheck />} itens={recebidos} todos={e.materiais} editavel={editavel} empresaId={o?.empresa_id} relId={relId} setLista={setLista} />
        <SecaoMateriais n="11" titulo="Materiais Utilizados" tipo="utilizado" icone={<PackageMinus />} itens={utilizados} todos={e.materiais} editavel={editavel} empresaId={o?.empresa_id} relId={relId} setLista={setLista} />

        {/* 12 notas */}
        <Painel n="12" titulo="Notas de Compras" icone={<Receipt />} contagem={e.notas.length} extra={e.notas.length > 0 && <span className="num text-[11.5px] font-semibold text-marinho-700">{formatarMoeda(e.notas.reduce((s, n) => s + (lerNumero(n.valor as string | number | null) ?? 0), 0))}</span>}>
          <Linhas
            itens={e.notas}
            editavel={editavel}
            vazio="Nenhuma nota registrada."
            cabecalho={['Fornecedor', 'Nº da nota', 'Valor (R$)', 'Descrição']}
            colunas="md:grid-cols-[1fr_120px_130px_1.2fr_32px]"
            celular="grid-cols-2"
            aoRemover={(i) => setLista('notas', (l) => l.filter((_, j) => j !== i))}
            botoes={editavel && <BotaoLinha onClick={() => setLista('notas', (l) => [...l, { id: novoId(), relatorio_id: relId, ordem: l.length, fornecedor: '', numero_nota: '', valor: null, descricao: '' }])}>Adicionar nota</BotaoLinha>}
            renderizar={(n, i) => {
              const up = (p: Partial<NotaCompra>) => setLista('notas', (l) => l.map((y, j) => (j === i ? { ...y, ...p } : y)))
              return editavel ? (
                <>
                  <Entrada value={n.fornecedor ?? ''} onChange={(ev) => up({ fornecedor: ev.target.value })} placeholder="Fornecedor" aria-label="Fornecedor" />
                  <Entrada value={n.numero_nota ?? ''} onChange={(ev) => up({ numero_nota: ev.target.value })} placeholder="000123" className="font-mono" aria-label="Número da nota" />
                  <Entrada inputMode="decimal" value={n.valor === null ? '' : String(n.valor)} onChange={(ev) => up({ valor: ev.target.value === '' ? null : ev.target.value })} onBlur={(ev) => up({ valor: lerNumero(ev.target.value) })} placeholder="0,00" className="num text-right" aria-label="Valor" />
                  <Entrada value={n.descricao ?? ''} onChange={(ev) => up({ descricao: ev.target.value })} placeholder="Descrição" aria-label="Descrição da nota" />
                </>
              ) : (
                <>
                  <span className="font-medium">{n.fornecedor || '—'}</span>
                  <span className="font-mono text-[12px]">{n.numero_nota || '—'}</span>
                  <span className="num text-right font-semibold">{formatarMoeda(lerNumero(n.valor as string | number | null))}</span>
                  <span className="text-tinta-suave">{n.descricao}</span>
                </>
              )
            }}
          />
        </Painel>

        {/* 13 fotos */}
        {r ? (
          <FotosRelatorio relatorioId={r.id} obraId={r.obra_id} empresaId={r.empresa_id} editavel={editavel} />
        ) : (
          <Painel n="13" titulo="Galeria de Fotos" icone={<Camera />} contagem={0} inicialAberto={false}>
            <p className="text-[12px] text-tinta-fraca">Salve o rascunho para anexar fotos.</p>
          </Painel>
        )}

        {r && (
          <p className="flex items-center justify-between px-1 font-mono text-[10px] tracking-widest text-tinta-fraca uppercase">
            <span>atualizado {formatarRelativo(r.atualizado_em)}</span>
            {r.status === 'aprovado' && r.aprovado_em && <span className="text-ok-600">aprovado em {formatarData(r.aprovado_em, "dd/MM/yyyy HH:mm")}</span>}
            {gestor && <button onClick={() => void excluir()} className="flex items-center gap-1 text-perigo-600 hover:underline"><Trash2 className="size-3" /> excluir</button>}
          </p>
        )}
      </div>

      {/* ---------------------------------------------- rodapé fixo -- */}
      <div className={clsx('pb-seguro fixed inset-x-0 z-40 border-t border-linha bg-white/95 backdrop-blur', portal ? 'bottom-0' : 'bottom-14 lg:bottom-0 lg:left-[248px]')}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-2 px-4 py-2.5 sm:px-6 lg:px-9">
          <div className="flex min-w-0 items-center gap-2">
            <Selo tom={st.tom} className="max-sm:hidden">{st.rotulo}</Selo>
            <span className={clsx('size-2.5 rounded-full sm:hidden', st.tom === 'ok' ? 'bg-ok-600' : st.tom === 'marinho' ? 'bg-marinho-500' : 'bg-tinta-fraca')} title={st.rotulo} aria-label={st.rotulo} />
            {sujo && <span className="hidden items-center gap-1.5 text-[11.5px] text-tinta-suave sm:flex"><span className="size-1.5 rounded-full bg-ambar-500" /> não salvo</span>}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {r && <Botao variante="secundario" onClick={() => void pdf()} carregando={ocupado === 'pdf'} icone={<FileDown className="size-4" />} title="Baixar PDF"><span className="hidden sm:inline">PDF</span></Botao>}
            {editavel && (
              <Botao variante="secundario" onClick={() => void acao('salvar')} carregando={ocupado === 'salvar'} disabled={!sujo && !novo} icone={<Save className="size-4" />}>
                <span className="hidden sm:inline">{status === 'preenchendo' ? 'Salvar Rascunho' : 'Salvar'}</span>
                <span className="sm:hidden">Salvar</span>
              </Botao>
            )}
            {editavel && status === 'preenchendo' && (
              <Botao variante="ambar" onClick={() => void acao('revisar')} carregando={ocupado === 'revisar'} icone={<Send className="size-3.5" />}>
                <span className="hidden sm:inline">Enviar para Aprovação</span><span className="sm:hidden">Enviar</span>
              </Botao>
            )}
            {editavel && status === 'revisar' && !gestor && (
              <Botao variante="secundario" onClick={() => void acao('preenchendo')} carregando={ocupado === 'preenchendo'} icone={<Undo2 className="size-3.5" />}>Voltar a rascunho</Botao>
            )}
            {gestor && status !== 'aprovado' && (
              <Botao className="!bg-ok-600 !text-white hover:brightness-110" onClick={() => void acao('aprovar')} carregando={ocupado === 'aprovar'} icone={<CheckCheck className="size-4" />}>
                <span className="hidden sm:inline">Salvar e Aprovar</span><span className="sm:hidden">Aprovar</span>
              </Botao>
            )}
            {gestor && status === 'aprovado' && (
              <Botao variante="secundario" onClick={() => void acao('preenchendo')} carregando={ocupado === 'preenchendo'} icone={<Undo2 className="size-3.5" />}>Reabrir</Botao>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ peças */
function Painel({
  n, titulo, icone, children, contagem, extra, inicialAberto = true,
}: {
  n: string
  titulo: string
  icone: ReactNode
  children: ReactNode
  contagem?: number
  extra?: ReactNode
  inicialAberto?: boolean
}) {
  const [aberto, setAberto] = useState(contagem === undefined ? inicialAberto : inicialAberto || contagem > 0)
  return (
    <section className={clsx('cartao anim-subir overflow-hidden transition-shadow', aberto && 'quinas')}>
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left hover:bg-papel/60 sm:px-5">
        <span className="num font-mono text-[10px] font-semibold text-ambar-600">{n}</span>
        <span className="flex size-6 items-center justify-center rounded-md bg-marinho-50 text-marinho-700 [&_svg]:size-3.5">{icone}</span>
        <h2 className="font-display text-[13.5px] font-bold text-marinho-900">{titulo}</h2>
        {contagem !== undefined && <span className="num rounded-full bg-marinho-50 px-1.5 font-mono text-[10.5px] font-semibold text-marinho-700 ring-1 ring-marinho-100">{contagem}</span>}
        <span className="ml-auto flex items-center gap-3">
          {extra}
          <ChevronDown className={clsx('size-4 text-tinta-fraca transition-transform', aberto && 'rotate-180')} />
        </span>
      </button>
      {aberto && <div className="border-t border-linha px-4 py-4 sm:px-5">{children}</div>}
    </section>
  )
}

function CartaoPrazo({ rotulo, valor, destaque, alerta }: { rotulo: string; valor: number | null; destaque?: boolean; alerta?: boolean }) {
  return (
    <div className={clsx('relative rounded-lg border bg-white px-4 py-3.5', destaque ? 'border-linha border-l-[3px] border-l-ambar-500' : 'border-linha', alerta && 'border-perigo-600/30 bg-perigo-50')}>
      <p className="rotulo">{rotulo}</p>
      <p className={clsx('num mt-1 font-mono text-[22px] font-semibold', alerta ? 'text-perigo-600' : 'text-marinho-900')}>
        {valor === null ? '—' : valor} <span className="text-[13px] font-normal text-tinta-fraca">dias</span>
      </p>
    </div>
  )
}

function BotaoLinha({ onClick, children, icone }: { onClick: () => void; children: ReactNode; icone?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-linha-forte bg-white px-3 text-[12px] font-medium text-marinho-700 hover:border-marinho-400 hover:bg-marinho-50">
      {icone ?? <Plus className="size-3.5" />} {children}
    </button>
  )
}

function Linhas<T extends { id: string }>({
  itens, editavel, vazio, aoRemover, renderizar, cabecalho, colunas, botoes, celular = 'grid-cols-1',
}: {
  itens: T[]
  editavel: boolean
  vazio: string
  aoRemover: (i: number) => void
  renderizar: (item: T, i: number) => ReactNode
  cabecalho: string[]
  colunas: string
  /** grade no celular (as colunas "md:" valem do tablet em diante) */
  celular?: string
  botoes?: ReactNode
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
              <li key={it.id} className={clsx('relative grid items-center gap-2 px-3 py-2 text-[13px] md:gap-2.5', editavel && celular, colunas, editavel && 'pr-10 md:pr-3')}>
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
        <p className="rounded-lg border border-dashed border-linha-forte px-3 py-4 text-center text-[12px] text-tinta-fraca">{vazio}</p>
      )}
      {botoes && <div className="mt-2.5 flex flex-wrap gap-2">{botoes}</div>}
    </div>
  )
}

function SeletorClima({ valor, aoMudar, editavel }: { valor: Clima | null; aoMudar: (v: Clima | null) => void; editavel: boolean }) {
  const opcoes: { v: Clima; icone: ReactNode }[] = [
    { v: 'claro', icone: <Sun className="size-4" /> },
    { v: 'nublado', icone: <Cloud className="size-4" /> },
    { v: 'chuvoso', icone: <CloudRain className="size-4" /> },
  ]
  return (
    <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Clima">
      {opcoes.map((o) => {
        const ativo = valor === o.v
        return (
          <button key={o.v} type="button" role="radio" aria-checked={ativo} disabled={!editavel} onClick={() => aoMudar(ativo ? null : o.v)}
            className={clsx(
              'flex h-12 flex-col items-center justify-center gap-0.5 rounded-md border text-[10.5px] font-medium transition-colors disabled:cursor-default',
              ativo ? (o.v === 'claro' ? 'border-ambar-500 bg-ambar-50 text-ambar-700' : 'border-marinho-600 bg-marinho-50 text-marinho-700') : clsx('border-linha bg-white text-tinta-fraca', editavel ? 'hover:border-marinho-300 hover:text-marinho-700' : 'opacity-45'),
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
    <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Condição">
      {(['praticavel', 'impraticavel'] as Condicao[]).map((c) => {
        const ativo = valor === c
        return (
          <button key={c} type="button" role="radio" aria-checked={ativo} disabled={!editavel} onClick={() => aoMudar(ativo ? null : c)}
            className={clsx(
              'h-7 rounded-md border text-[10.5px] font-semibold transition-colors disabled:cursor-default',
              ativo ? (c === 'praticavel' ? 'border-ok-600/40 bg-ok-50 text-ok-600' : 'border-perigo-600/40 bg-perigo-50 text-perigo-600') : clsx('border-linha bg-white text-tinta-fraca', editavel ? 'hover:border-marinho-300' : 'opacity-45'),
            )}
          >
            {CONDICAO[c]}
          </button>
        )
      })}
    </div>
  )
}

type SetLista = <K extends ChaveLista>(k: K, fn: (l: Estado[K]) => Estado[K]) => void

/* ---------------------------------------------------------- mão de obra */
function SecaoMaoObra({ itens, editavel, empresaId, relId, setLista, total }: { itens: MaoObra[]; editavel: boolean; empresaId?: string; relId: string; setLista: SetLista; total: number }) {
  const colaboradores = useCadastro('colaboradores', empresaId)
  const funcoes = useCadastro('funcoes', empresaId)
  const [modal, setModal] = useState<'colaborador' | 'funcao' | null>(null)
  const nomeFuncao = (id: string | null) => funcoes.data?.find((f) => f.id === id)?.nome ?? ''
  const adicionar = (p: Partial<MaoObra> = {}) =>
    setLista('maoObra', (l) => [...l, { id: novoId(), relatorio_id: relId, ordem: l.length, colaborador_id: null, funcao: '', quantidade: 1, tipo: 'propria', empresa_terceira: null, ...p }])
  const ativos = (colaboradores.data ?? []).filter((c) => c.ativo)

  return (
    <Painel n="05" titulo="Mão de Obra" icone={<Users />} contagem={itens.length} extra={itens.length > 0 && <span className="num rounded-full bg-marinho-900 px-2 py-0.5 text-[10.5px] font-semibold text-white">Efetivo {total}</span>}>
      <Linhas
        itens={itens}
        editavel={editavel}
        vazio="Nenhum item adicionado."
        cabecalho={['Colaborador', 'Função', 'Vínculo', 'Qtd.']}
        colunas="md:grid-cols-[1fr_1fr_230px_76px_32px]"
        celular="grid-cols-2"
        aoRemover={(i) => setLista('maoObra', (l) => l.filter((_, j) => j !== i))}
        botoes={
          editavel && (
            <>
              <BotaoLinha onClick={() => adicionar()}>Adicionar linha</BotaoLinha>
              <BotaoLinha icone={<UserPlus className="size-3.5" />} onClick={() => setModal('colaborador')}>Novo colaborador</BotaoLinha>
              <BotaoLinha onClick={() => setModal('funcao')}>Nova função</BotaoLinha>
            </>
          )
        }
        renderizar={(m, i) => {
          const up = (p: Partial<MaoObra>) => setLista('maoObra', (l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)))
          const colab = colaboradores.data?.find((c) => c.id === m.colaborador_id)
          return editavel ? (
            <>
              <Selecao
                value={m.colaborador_id ?? ''}
                onChange={(ev) => {
                  const c = colaboradores.data?.find((x) => x.id === ev.target.value)
                  up(c ? { colaborador_id: c.id, colaborador_nome: c.nome, funcao: nomeFuncao(c.funcao_id) || m.funcao, tipo: c.tipo, empresa_terceira: c.empresa_terceira, quantidade: 1 } : { colaborador_id: null, colaborador_nome: null })
                }}
                aria-label="Colaborador"
              >
                <option value="">— Equipe (por função) —</option>
                {ativos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
              <Entrada list="lista-funcoes" value={m.funcao} onChange={(ev) => up({ funcao: ev.target.value })} placeholder="Pedreiro" aria-label="Função" />
              <div className="flex gap-1.5">
                <Selecao value={m.tipo} onChange={(ev) => up({ tipo: ev.target.value as TipoMaoObra, empresa_terceira: ev.target.value === 'propria' ? null : m.empresa_terceira })} className="!w-[112px] shrink-0" aria-label="Vínculo">
                  {(Object.keys(TIPO_MAO_OBRA) as TipoMaoObra[]).map((t) => <option key={t} value={t}>{TIPO_MAO_OBRA[t]}</option>)}
                </Selecao>
                {m.tipo === 'terceirizada' && <Entrada value={m.empresa_terceira ?? ''} onChange={(ev) => up({ empresa_terceira: ev.target.value || null })} placeholder="Empresa" aria-label="Empresa terceirizada" />}
              </div>
              <Entrada type="number" min={1} inputMode="numeric" value={m.quantidade || ''} onChange={(ev) => up({ quantidade: Number(ev.target.value) })} className="num text-right" aria-label="Quantidade" disabled={!!m.colaborador_id} />
            </>
          ) : (
            <>
              <span className="font-medium">{colab?.nome ?? m.colaborador_nome ?? <span className="text-tinta-fraca">Equipe</span>}</span>
              <span>{m.funcao}</span>
              <span className="text-tinta-suave">{TIPO_MAO_OBRA[m.tipo]}{m.empresa_terceira ? ` · ${m.empresa_terceira}` : ''}</span>
              <span className="num text-right font-semibold">{m.quantidade}</span>
            </>
          )
        }}
      />
      <datalist id="lista-funcoes">
        {[...new Set([...(funcoes.data ?? []).filter((f) => f.ativo).map((f) => f.nome), 'Mestre de obras', 'Encarregado', 'Pedreiro', 'Servente', 'Carpinteiro', 'Armador', 'Eletricista', 'Encanador', 'Pintor'])].map((f) => <option key={f} value={f} />)}
      </datalist>
      <ModalCadastroRapido
        tipo={modal}
        empresaId={empresaId}
        funcoes={(funcoes.data ?? []).filter((f) => f.ativo)}
        aoFechar={() => setModal(null)}
        aoCriar={(r) => {
          if (r.tipo === 'funcao') adicionar({ funcao: r.nome })
          else adicionar({ colaborador_id: r.id, colaborador_nome: r.nome, funcao: r.funcao, tipo: r.vinculo, empresa_terceira: r.empresaTerceira })
        }}
      />
    </Painel>
  )
}

type Criado =
  | { tipo: 'funcao'; id: string; nome: string }
  | { tipo: 'colaborador'; id: string; nome: string; funcao: string; vinculo: TipoMaoObra; empresaTerceira: string | null }

function ModalCadastroRapido({
  tipo, empresaId, funcoes, aoFechar, aoCriar,
}: {
  tipo: 'colaborador' | 'funcao' | null
  empresaId?: string
  funcoes: { id: string; nome: string }[]
  aoFechar: () => void
  aoCriar: (r: Criado) => void
}) {
  const avisos = useAvisos()
  const qc = useQueryClient()
  const [nome, setNome] = useState('')
  const [funcaoId, setFuncaoId] = useState('')
  const [vinculo, setVinculo] = useState<TipoMaoObra>('propria')
  const [terceira, setTerceira] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (tipo) {
      setNome('')
      setFuncaoId('')
      setVinculo('propria')
      setTerceira('')
    }
  }, [tipo])
  async function salvar(ev: FormEvent) {
    ev.preventDefault()
    if (nome.trim().length < 2) return avisos.erro('Informe o nome.')
    if (!empresaId) return avisos.erro('Escolha a obra antes de cadastrar.')
    setSalvando(true)
    try {
      if (tipo === 'funcao') {
        const { data, error } = await supabase.from('funcoes').insert({ empresa_id: empresaId, nome: nome.trim() }).select('id, nome').single()
        if (error) throw error
        const d = data as { id: string; nome: string }
        aoCriar({ tipo: 'funcao', id: d.id, nome: d.nome })
      } else {
        const { data, error } = await supabase
          .from('colaboradores')
          .insert({ empresa_id: empresaId, nome: nome.trim(), funcao_id: funcaoId || null, tipo: vinculo, empresa_terceira: vinculo === 'terceirizada' ? terceira.trim() || null : null })
          .select('id, nome')
          .single()
        if (error) throw error
        const d = data as { id: string; nome: string }
        aoCriar({ tipo: 'colaborador', id: d.id, nome: d.nome, funcao: funcoes.find((f) => f.id === funcaoId)?.nome ?? '', vinculo, empresaTerceira: vinculo === 'terceirizada' ? terceira.trim() || null : null })
      }
      void qc.invalidateQueries({ queryKey: ['cadastro'] })
      avisos.sucesso(tipo === 'funcao' ? 'Função cadastrada.' : 'Colaborador cadastrado.')
      aoFechar()
    } catch (err) {
      avisos.erro(err)
    } finally {
      setSalvando(false)
    }
  }
  return (
    <Modal
      aberto={!!tipo}
      aoFechar={aoFechar}
      titulo={tipo === 'funcao' ? 'Nova função' : 'Novo colaborador'}
      descricao="Fica salvo nos cadastros da empresa para os próximos relatórios."
      largura="sm"
      codigo="CADASTRO RÁPIDO"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-rapido" carregando={salvando}>Cadastrar e adicionar</Botao></>}
    >
      <form id="form-rapido" onSubmit={salvar} className="flex flex-col gap-3.5">
        <CampoTexto rotulo={tipo === 'funcao' ? 'Nome da função' : 'Nome do colaborador'} obrigatorio value={nome} onChange={(ev) => setNome(ev.target.value)} autoFocus />
        {tipo === 'colaborador' && (
          <>
            <Campo rotulo="Função" htmlFor="rap-f">
              <Selecao id="rap-f" value={funcaoId} onChange={(ev) => setFuncaoId(ev.target.value)}>
                <option value="">—</option>
                {funcoes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Vínculo" htmlFor="rap-v">
              <Selecao id="rap-v" value={vinculo} onChange={(ev) => setVinculo(ev.target.value as TipoMaoObra)}>
                <option value="propria">Própria</option>
                <option value="terceirizada">Terceirizada</option>
              </Selecao>
            </Campo>
            {vinculo === 'terceirizada' && <CampoTexto rotulo="Empresa terceirizada" value={terceira} onChange={(ev) => setTerceira(ev.target.value)} />}
          </>
        )}
      </form>
    </Modal>
  )
}

/* -------------------------------------------------------- equipamentos */
function SecaoEquipamentos({ itens, editavel, empresaId, relId, setLista }: { itens: Equipamento[]; editavel: boolean; empresaId?: string; relId: string; setLista: SetLista }) {
  const cad = useCadastro('equipamentos', empresaId)
  const ativos = (cad.data ?? []).filter((x) => x.ativo)
  return (
    <Painel n="06" titulo="Equipamentos" icone={<Truck />} contagem={itens.length}>
      <Linhas
        itens={itens}
        editavel={editavel}
        vazio="Nenhum equipamento registrado."
        cabecalho={['Equipamento', 'Qtd.']}
        colunas="md:grid-cols-[1fr_90px_32px]"
        celular="grid-cols-[1fr_76px]"
        aoRemover={(i) => setLista('equipamentos', (l) => l.filter((_, j) => j !== i))}
        botoes={editavel && <BotaoLinha onClick={() => setLista('equipamentos', (l) => [...l, { id: novoId(), relatorio_id: relId, ordem: l.length, equipamento_id: null, nome: '', quantidade: 1 }])}>Adicionar equipamento</BotaoLinha>}
        renderizar={(m, i) => {
          const up = (p: Partial<Equipamento>) => setLista('equipamentos', (l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)))
          return editavel ? (
            <>
              <Entrada
                list="lista-equip"
                value={m.nome}
                onChange={(ev) => {
                  const v = ev.target.value
                  const c = ativos.find((x) => x.nome === v || (x.identificacao && `${x.nome} · ${x.identificacao}` === v))
                  up({ nome: c ? c.nome : v, equipamento_id: c?.id ?? null })
                }}
                placeholder="Betoneira 400 L"
                aria-label="Equipamento"
              />
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
      <datalist id="lista-equip">
        {ativos.map((x) => <option key={x.id} value={x.nome}>{x.identificacao ?? ''}</option>)}
      </datalist>
    </Painel>
  )
}

/* ------------------------------------------------------------ materiais */
function SecaoMateriais({
  n, titulo, tipo, icone, itens, todos, editavel, empresaId, relId, setLista,
}: {
  n: string
  titulo: string
  tipo: TipoMaterial
  icone: ReactNode
  itens: Material[]
  todos: Material[]
  editavel: boolean
  empresaId?: string
  relId: string
  setLista: SetLista
}) {
  const cad = useCadastro('materiais', empresaId)
  const ativos = (cad.data ?? []).filter((x) => x.ativo)
  const upId = (id: string, p: Partial<Material>) => setLista('materiais', (l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)))
  return (
    <Painel n={n} titulo={titulo} icone={icone} contagem={itens.length}>
      <Linhas
        itens={itens}
        editavel={editavel}
        vazio="Nenhum item adicionado."
        cabecalho={['Material', 'Quantidade', 'Unidade']}
        colunas="md:grid-cols-[1fr_120px_110px_32px]"
        celular="grid-cols-2 [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1"
        aoRemover={(i) => {
          const alvo = itens[i]
          if (alvo) setLista('materiais', (l) => l.filter((x) => x.id !== alvo.id))
        }}
        botoes={editavel && <BotaoLinha onClick={() => setLista('materiais', (l) => [...l, { id: novoId(), relatorio_id: relId, ordem: todos.length, material_id: null, descricao: '', quantidade: null, unidade: null, tipo }])}>Adicionar material</BotaoLinha>}
        renderizar={(m) =>
          editavel ? (
            <>
              <Entrada
                list="lista-materiais"
                value={m.descricao}
                onChange={(ev) => {
                  const c = ativos.find((x) => x.nome === ev.target.value)
                  upId(m.id, { descricao: ev.target.value, material_id: c?.id ?? null, unidade: c?.unidade ?? m.unidade })
                }}
                placeholder="Cimento CP-II 50 kg"
                aria-label="Material"
              />
              <Entrada inputMode="decimal" value={m.quantidade === null ? '' : String(m.quantidade)} onChange={(ev) => upId(m.id, { quantidade: ev.target.value === '' ? null : ev.target.value })} onBlur={(ev) => { const v = lerNumero(ev.target.value); if (v !== null) upId(m.id, { quantidade: v }) }} className="num text-right" placeholder="0" aria-label="Quantidade" />
              <Entrada list="lista-unidades" value={m.unidade ?? ''} onChange={(ev) => upId(m.id, { unidade: ev.target.value || null })} placeholder="un" aria-label="Unidade" />
            </>
          ) : (
            <>
              <span className="font-medium">{m.descricao}</span>
              <span className="num text-right">{m.quantidade === null ? '—' : String(m.quantidade).replace('.', ',')}</span>
              <span className="text-tinta-suave">{m.unidade ?? ''}</span>
            </>
          )
        }
      />
      {tipo === 'recebido' && (
        <>
          <datalist id="lista-materiais">{ativos.map((x) => <option key={x.id} value={x.nome} />)}</datalist>
          <datalist id="lista-unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
        </>
      )}
    </Painel>
  )
}

/* ---------------------------------------------------------------- fotos */
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
  const qtd = fotos.data?.length ?? 0
  return (
    <Painel key={qtd > 0 ? 'com' : 'sem'} n="13" titulo="Galeria de Fotos" icone={<Camera />} contagem={qtd} inicialAberto={editavel}>
      <div className="flex flex-col gap-3">
        {editavel && <EnvioDeFotos aoEnviar={(a) => void enviar(a)} progresso={progresso} compacto rotulo="Adicionar fotos" />}
        <Galeria
          fotos={fotos.data ?? []}
          colunas="normal"
          aoExcluir={editavel ? (f) => void excluir(f) : undefined}
          aoLegendar={editavel ? (f, l) => void legendar(f, l) : undefined}
          vazio={!editavel && <p className="text-[12.5px] text-tinta-fraca italic">Sem fotos neste relatório.</p>}
        />
      </div>
    </Painel>
  )
}

/* ----------------------------------------------------------- comentários */
export function Comentarios({ relatorioId, podeComentar }: { relatorioId: string; podeComentar: boolean }) {
  const perfil = usePerfil()
  const { ehMaster } = useSessao()
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
    <div>
      <p className="rotulo mb-2 flex items-center gap-1.5"><MessageSquare className="size-3" /> Conversa · {lista.data?.length ?? 0}</p>
      {!!lista.data?.length && (
        <ul className="mb-3 flex flex-col gap-3">
          {lista.data.map((c) => {
            const meu = c.autor_id === perfil.id
            return (
              <li key={c.id} className="group flex gap-2.5">
                <Avatar nome={c.autor?.nome ?? '?'} tamanho={26} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-1.5 text-[11.5px]">
                    <span className="truncate font-semibold text-tinta">{meu ? 'Você' : (c.autor?.nome ?? 'Usuário')}</span>
                    {c.autor?.papel && <span className="text-tinta-fraca">· {PAPEL[c.autor.papel as keyof typeof PAPEL] ?? c.autor.papel}</span>}
                    <span className="text-[10.5px] text-tinta-fraca">· {formatarRelativo(c.criado_em)}</span>
                  </p>
                  <p className={clsx('mt-0.5 inline-block rounded-lg rounded-tl-sm px-3 py-1.5 text-[12.5px] whitespace-pre-line', c.autor?.papel === 'cliente' ? 'bg-ambar-50 ring-1 ring-ambar-100' : 'bg-marinho-50 ring-1 ring-marinho-100')}>{c.texto}</p>
                  {(meu || ehGestor(perfil.papel) || ehMaster) && (
                    <button onClick={() => void excluir(c.id)} className="ml-2 text-[10.5px] text-tinta-fraca opacity-0 group-hover:opacity-100 hover:text-perigo-600 focus:opacity-100">excluir</button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {podeComentar && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <AreaTexto rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void enviar() }} placeholder="Escreva um comentário…" aria-label="Novo comentário" className="!min-h-[52px]" />
          <Botao onClick={() => void enviar()} carregando={enviando} disabled={!texto.trim()} icone={<Send className="size-3.5" />}>Comentar</Botao>
        </div>
      )}
    </div>
  )
}

