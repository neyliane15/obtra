import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  ArrowLeft, Camera, CheckCircle2, ChevronLeft, ChevronRight, Clock, CloudRain, FileDown, Hammer, MessageSquare, Moon, PackageCheck,
  PackageMinus, ShieldAlert, StickyNote, Sunrise, Sunset, Truck, Users,
} from 'lucide-react'
import { useFotosRelatorio, useObra, useRelatorio, useRelatorios } from '@/lib/consultas'
import { mensagemDeErro } from '@/lib/supabase'
import { useTitulo } from '@/lib/titulo'
import { capitalizar, codigoRelatorio, diaDaSemana, formatarData, formatarDataExtensa, formatarHora } from '@/lib/formato'
import { formatarDuracao, minutosTrabalhados } from '@/lib/horario'
import { CLIMA, CONDICAO, STATUS_ATIVIDADE, TIPO_OCORRENCIA } from '@/lib/rotulos'
import { paraNumero, type Clima, type Condicao, type MaoObra } from '@/tipos/banco'
import { Botao, CarregandoPagina, Erro, Selo, Vazio } from '@/componentes/ui'
import { Galeria } from '@/componentes/midia'
import { IconeClima } from '@/componentes/obra'
import { useAvisos } from '@/componentes/avisos'
import { Comentarios } from '@/paginas/Relatorio'

/**
 * O RDO como o cliente vê: uma página de leitura, não um formulário.
 * Só aparecem as seções com conteúdo; fotos em destaque.
 */
export default function PortalRelatorio() {
  const { id } = useParams()
  const q = useRelatorio(id)
  const r = q.data?.relatorio
  const obra = useObra(r?.obra_id)
  const lista = useRelatorios(r?.obra_id)
  const fotos = useFotosRelatorio(id)
  const navegar = useNavigate()
  const avisos = useAvisos()
  const [baixando, setBaixando] = useState(false)
  useTitulo(r ? `RD-${r.numero}` : 'Relatório')

  const vizinhos = useMemo(() => {
    const l = (lista.data ?? []).filter((x) => x.status === 'aprovado')
    const i = r ? l.findIndex((x) => x.id === r.id) : -1
    return { anterior: i >= 0 ? l[i + 1] : undefined, proximo: i > 0 ? l[i - 1] : undefined }
  }, [lista.data, r])

  if (q.isLoading) return <CarregandoPagina texto="Abrindo relatório…" />
  if (q.isError) return <Erro mensagem={mensagemDeErro(q.error)} aoTentar={() => void q.refetch()} />
  if (!q.data || !r) return <Vazio titulo="Relatório não encontrado" descricao="Ele pode ainda não ter sido aprovado pela construtora." acao={<Link to="/portal"><Botao variante="secundario">Minhas obras</Botao></Link>} />

  const d = q.data
  const o = obra.data
  const efetivo = d.maoObra.reduce((s, m) => s + (m.quantidade || 0), 0)
  const minutos = minutosTrabalhados(r.horario_inicio, r.horario_fim, r.intervalo_inicio, r.intervalo_fim)
  const recebidos = d.materiais.filter((m) => m.tipo === 'recebido')
  const utilizados = d.materiais.filter((m) => m.tipo === 'utilizado')
  const qtdFotos = fotos.data?.length ?? 0
  const periodos = [
    { rot: 'Manhã', Icone: Sunrise, clima: r.clima_manha, cond: r.condicao_manha },
    { rot: 'Tarde', Icone: Sunset, clima: r.clima_tarde, cond: r.condicao_tarde },
    { rot: 'Noite', Icone: Moon, clima: r.clima_noite, cond: r.condicao_noite },
  ].filter((p, i) => i < 2 || p.clima || p.cond)
  const temClima = periodos.some((p) => p.clima || p.cond)

  async function pdf() {
    setBaixando(true)
    try {
      const { baixarPdfRelatorio } = await import('@/lib/pdf-rdo')
      await baixarPdfRelatorio(r!.id)
    } catch (e) {
      avisos.erro(e)
    } finally {
      setBaixando(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link to={`/portal/obras/${r.obra_id}`} className="mb-3 inline-flex items-center gap-1 text-[12px] text-tinta-suave hover:text-marinho-900">
        <ArrowLeft className="size-3.5" /> {o?.nome ?? 'Obra'}
      </Link>

      {/* capa do dia */}
      <section className="blueprint cantoneiras anim-subir relative overflow-hidden rounded-xl px-5 py-6 text-white [--cor-cantoneira:#F29A2E] sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.25em] text-ambar-400">RELATÓRIO DIÁRIO · {codigoRelatorio(r.numero)}</p>
            <h1 className="mt-2 font-display text-[22px] leading-tight font-extrabold sm:text-[27px]">
              {capitalizar(diaDaSemana(r.data))}, {formatarDataExtensa(r.data)}
            </h1>
            <p className="mt-1 text-[12.5px] text-marinho-200/85">{o?.nome}{r.responsavel ? ` · registrado por ${r.responsavel}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <Botao variante="claro" icone={<FileDown className="size-4" />} carregando={baixando} onClick={() => void pdf()}>PDF</Botao>
            <div className="flex items-center rounded-md border border-white/15 bg-white/10">
              <button className="flex size-[34px] items-center justify-center text-white/80 hover:text-white disabled:opacity-30" disabled={!vizinhos.anterior} onClick={() => vizinhos.anterior && navegar(`/portal/relatorios/${vizinhos.anterior.id}`)} aria-label="Relatório anterior" title="Relatório anterior"><ChevronLeft className="size-4" /></button>
              <span className="h-5 w-px bg-white/15" />
              <button className="flex size-[34px] items-center justify-center text-white/80 hover:text-white disabled:opacity-30" disabled={!vizinhos.proximo} onClick={() => vizinhos.proximo && navegar(`/portal/relatorios/${vizinhos.proximo.id}`)} aria-label="Próximo relatório" title="Próximo relatório"><ChevronRight className="size-4" /></button>
            </div>
          </div>
        </div>
        {r.aprovado_em && (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ok-600/20 px-2.5 py-1 text-[11px] font-semibold text-[#8fe0c3] ring-1 ring-[#8fe0c3]/30">
            <CheckCircle2 className="size-3.5" /> Aprovado pela construtora em {formatarData(r.aprovado_em, "dd/MM/yyyy 'às' HH:mm")}
          </p>
        )}
      </section>

      {/* resumo do dia */}
      <div className="anim-subir mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Resumo rotulo="Clima" icone={<CloudRain />}>
          {temClima ? (
            <span className="flex items-center gap-1.5">
              {periodos.slice(0, 2).filter((p) => p.clima).map((p) => <IconeClima key={p.rot} clima={p.clima} className="size-[18px]" />)}
              <span className="text-[12px] font-medium text-tinta-suave">{[r.clima_manha, r.clima_tarde].filter(Boolean).map((c) => CLIMA[c as Clima]).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}</span>
            </span>
          ) : <span className="text-[12px] text-tinta-fraca">Não informado</span>}
        </Resumo>
        <Resumo rotulo="Equipe no canteiro" icone={<Users />}>
          {efetivo > 0 ? (
            <>
              <span className="num font-display text-[20px] font-extrabold text-marinho-900">{efetivo}</span>
              <span className="ml-1 text-[11.5px] text-tinta-fraca">{efetivo === 1 ? 'pessoa' : 'pessoas'}</span>
            </>
          ) : <span className="text-[12px] text-tinta-fraca">Não informada</span>}
        </Resumo>
        <Resumo rotulo="Jornada" icone={<Clock />}>
          {r.horario_inicio && r.horario_fim ? (
            <>
              <span className="num font-mono text-[13px] font-semibold text-marinho-900">{formatarHora(r.horario_inicio)}–{formatarHora(r.horario_fim)}</span>
              <span className="ml-1.5 text-[11px] text-tinta-fraca">{formatarDuracao(minutos)}</span>
            </>
          ) : <span className="text-[12px] text-tinta-fraca">Não informada</span>}
        </Resumo>
        <Resumo rotulo="Fotos do dia" icone={<Camera />}>
          <span className="num font-display text-[20px] font-extrabold text-marinho-900">{qtdFotos}</span>
          {r.pluviometria_mm !== null && paraNumero(r.pluviometria_mm) > 0 && <span className="ml-2 text-[11px] text-tinta-fraca">chuva {paraNumero(r.pluviometria_mm).toLocaleString('pt-BR')} mm</span>}
        </Resumo>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {qtdFotos > 0 && (
          <Bloco titulo="Registro fotográfico" icone={<Camera />} contagem={qtdFotos}>
            <Galeria fotos={fotos.data ?? []} colunas="compacta" />
          </Bloco>
        )}

        {d.atividades.length > 0 && (
          <Bloco titulo="O que foi feito" icone={<Hammer />} contagem={d.atividades.length}>
            <ul className="cartao divide-y divide-linha">
              {d.atividades.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className="flex-1 text-[13px] font-medium text-tinta">{a.descricao}</span>
                  <span className="flex items-center gap-3 sm:w-[260px]">
                    <Selo tom={STATUS_ATIVIDADE[a.status].tom}>{STATUS_ATIVIDADE[a.status].rotulo}</Selo>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-marinho-50 ring-1 ring-inset ring-linha">
                      <span className={clsx('block h-full rounded-full', a.progresso >= 100 ? 'bg-ok-600' : 'bg-marinho-600')} style={{ width: `${a.progresso}%` }} />
                    </span>
                    <span className="num w-9 text-right text-[12px] font-semibold text-marinho-900">{a.progresso}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </Bloco>
        )}

        {temClima && (
          <Bloco titulo="Condições do tempo" icone={<CloudRain />}>
            <div className={clsx('grid gap-3', periodos.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
              {periodos.map(({ rot, Icone, clima, cond }) => (
                <div key={rot} className="cartao flex items-center gap-3 px-4 py-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-marinho-50 ring-1 ring-marinho-100"><IconeClima clima={clima} className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 rotulo"><Icone className="size-3" /> {rot}</p>
                    <p className="text-[13px] font-semibold text-tinta">{clima ? CLIMA[clima] : 'Não informado'}</p>
                  </div>
                  {cond && <SeloCondicao c={cond} />}
                </div>
              ))}
            </div>
          </Bloco>
        )}

        {d.maoObra.length > 0 && (
          <Bloco titulo="Equipe no canteiro" icone={<Users />} contagem={efetivo}>
            <div className="flex flex-wrap gap-2">
              {agruparEquipe(d.maoObra).map(([funcao, n, terceira]) => (
                <span key={funcao + terceira} className="inline-flex items-center gap-2 rounded-lg border border-linha bg-white py-1.5 pr-1.5 pl-3 text-[12.5px] text-tinta shadow-suave">
                  {funcao}
                  {terceira && <span className="text-[11px] text-tinta-fraca">· {terceira}</span>}
                  <span className="num rounded-md bg-marinho-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">{n}</span>
                </span>
              ))}
            </div>
          </Bloco>
        )}

        {d.equipamentos.length > 0 && (
          <Bloco titulo="Equipamentos" icone={<Truck />} contagem={d.equipamentos.length}>
            <div className="flex flex-wrap gap-2">
              {d.equipamentos.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-linha-forte bg-white px-3 py-1.5 text-[12.5px] text-tinta">
                  {e.nome}{e.quantidade > 1 && <span className="num font-mono text-[11px] text-tinta-fraca">×{e.quantidade}</span>}
                </span>
              ))}
            </div>
          </Bloco>
        )}

        {d.ocorrencias.length > 0 && (
          <Bloco titulo="Ocorrências" icone={<ShieldAlert />} contagem={d.ocorrencias.length}>
            <ul className="flex flex-col gap-2">
              {d.ocorrencias.map((x) => (
                <li key={x.id} className={clsx('cartao flex gap-3 border-l-[3px] px-4 py-3', x.tipo === 'acidente' || x.tipo === 'seguranca' ? 'border-l-perigo-600' : x.tipo === 'geral' ? 'border-l-marinho-400' : 'border-l-ambar-500')}>
                  <Selo tom={x.tipo === 'acidente' || x.tipo === 'seguranca' ? 'perigo' : x.tipo === 'geral' ? 'neutro' : 'ambar'} className="mt-px">{TIPO_OCORRENCIA[x.tipo]}</Selo>
                  <p className="flex-1 text-[13px] whitespace-pre-line text-tinta">{x.descricao}</p>
                </li>
              ))}
            </ul>
          </Bloco>
        )}

        {(recebidos.length > 0 || utilizados.length > 0) && (
          <div className="grid gap-6 md:grid-cols-2">
            {[
              ['Materiais recebidos', recebidos, <PackageCheck key="r" />],
              ['Materiais utilizados', utilizados, <PackageMinus key="u" />],
            ].map(([titulo, itens, icone]) =>
              (itens as typeof recebidos).length ? (
                <Bloco key={titulo as string} titulo={titulo as string} icone={icone as ReactNode} contagem={(itens as typeof recebidos).length}>
                  <ul className="cartao divide-y divide-linha">
                    {(itens as typeof recebidos).map((m) => (
                      <li key={m.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[12.5px]">
                        <span className="text-tinta">{m.descricao}</span>
                        <span className="num shrink-0 font-mono text-[12px] font-semibold text-marinho-900">
                          {m.quantidade === null ? '—' : paraNumero(m.quantidade).toLocaleString('pt-BR')} <span className="font-sans font-normal text-tinta-fraca">{m.unidade ?? ''}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Bloco>
              ) : <div key={titulo as string} className="hidden md:block" />,
            )}
          </div>
        )}

        {r.observacoes?.trim() && (
          <Bloco titulo="Observações do dia" icone={<StickyNote />}>
            <p className="cartao px-4 py-3 text-[13px] leading-relaxed whitespace-pre-line text-tinta">{r.observacoes}</p>
          </Bloco>
        )}

        <Bloco titulo="Conversa com a construtora" icone={<MessageSquare />}>
          <div className="cartao p-4">
            <Comentarios relatorioId={r.id} podeComentar />
          </div>
        </Bloco>
      </div>
    </div>
  )
}

function agruparEquipe(l: MaoObra[]): [string, number, string][] {
  const mapa = new Map<string, [string, number, string]>()
  for (const m of l) {
    const funcao = m.funcao?.trim() || m.colaborador_nome || 'Equipe'
    const terceira = m.tipo === 'terceirizada' ? (m.empresa_terceira ?? 'terceirizada') : ''
    const k = `${funcao}|${terceira}`
    const atual = mapa.get(k)
    mapa.set(k, [funcao, (atual?.[1] ?? 0) + (m.quantidade || 0), terceira])
  }
  return [...mapa.values()].sort((a, b) => b[1] - a[1])
}

function Resumo({ rotulo, icone, children }: { rotulo: string; icone: ReactNode; children: ReactNode }) {
  return (
    <div className="cartao quinas px-4 py-3">
      <p className="rotulo flex items-center gap-1.5 [&_svg]:size-3 [&_svg]:text-marinho-400">{icone}{rotulo}</p>
      <div className="mt-1.5 flex min-h-[28px] items-center">{children}</div>
    </div>
  )
}

function Bloco({ titulo, icone, contagem, children }: { titulo: string; icone: ReactNode; contagem?: number; children: ReactNode }) {
  return (
    <section className="anim-subir">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-marinho-900 text-ambar-400 [&_svg]:size-3.5">{icone}</span>
        <h2 className="font-display text-[14px] font-bold text-marinho-900">{titulo}</h2>
        {contagem !== undefined && <span className="num rounded-full bg-marinho-50 px-1.5 font-mono text-[10.5px] font-semibold text-marinho-700 ring-1 ring-marinho-100">{contagem}</span>}
        <span className="h-px flex-1 border-t border-dashed border-linha-forte" />
      </div>
      {children}
    </section>
  )
}

function SeloCondicao({ c }: { c: Condicao }) {
  return <Selo tom={c === 'praticavel' ? 'ok' : 'perigo'}>{CONDICAO[c]}</Selo>
}
