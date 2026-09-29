import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { clsx } from 'clsx'
import { ArrowUpRight, Camera, ClipboardList, Database, HardHat, Hourglass, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePainel, useObras, type RelatorioLista } from '@/lib/consultas'
import { useSessao, usePerfil } from '@/lib/sessao'
import { supabase, exigir, mensagemDeErro } from '@/lib/supabase'
import { formatarBytes, percentualUso } from '@/lib/formato'
import { permissoes } from '@/lib/permissoes'
import { paraNumero } from '@/tipos/banco'
import { Botao, CabecalhoPagina, Cartao, Erro, Esqueleto, Progresso, Vazio } from '@/componentes/ui'
import { LinhaRelatorio, PrazoObra } from '@/componentes/obra'
import { ImagemAssinada } from '@/componentes/midia'
import { STATUS_OBRA } from '@/lib/rotulos'

function Kpi({ rotulo, valor, detalhe, icone, codigo, destaque, alerta, children }: {
  rotulo: string
  valor: ReactNode
  detalhe?: ReactNode
  icone: ReactNode
  codigo: string
  destaque?: boolean
  alerta?: boolean
  children?: ReactNode
}) {
  return (
    <div className={clsx('cartao quinas relative h-full overflow-hidden p-4 transition-shadow hover:shadow-cartao', destaque && '!border-marinho-800 !bg-marinho-900 text-white [--cor-cantoneira:#F29A2E]', alerta && '!border-ambar-400/60 [--cor-cantoneira:#F29A2E]')}>
      <div className="flex items-start justify-between">
        <p className={clsx('rotulo', destaque && '!text-marinho-300')}>{rotulo}</p>
        <span className={clsx('flex size-7 items-center justify-center rounded-md [&_svg]:size-3.5', destaque ? 'bg-white/10 text-ambar-400' : alerta ? 'bg-ambar-50 text-ambar-700' : 'bg-marinho-50 text-marinho-600')}>{icone}</span>
      </div>
      <p className={clsx('num mt-2 font-display text-[28px] leading-none font-extrabold tracking-tight', destaque ? 'text-white' : 'text-marinho-900')}>{valor}</p>
      {detalhe && <p className={clsx('mt-2 text-[11.5px]', destaque ? 'text-marinho-200/80' : 'text-tinta-suave')}>{detalhe}</p>}
      {children}
      <span className={clsx('absolute right-3 bottom-2 font-mono text-[9px] tracking-widest', destaque ? 'text-marinho-400' : 'text-marinho-200')}>{codigo}</span>
    </div>
  )
}

type Recente = RelatorioLista & { obras: { nome: string } | null }

export default function Painel() {
  const perfil = usePerfil()
  const { empresaId, empresa, ehMaster } = useSessao()
  const p = permissoes(perfil.papel)
  const navegar = useNavigate()
  const resumo = usePainel()
  const obras = useObras()
  const recentes = useQuery({
    queryKey: ['relatorios-recentes', empresaId],
    queryFn: async () => {
      let q = supabase
        .from('relatorios')
        .select('id, obra_id, numero, data, status, clima_manha, clima_tarde, clima_noite, condicao_manha, condicao_tarde, pluviometria_mm, criado_em, atualizado_em, obras(nome)')
        .order('data', { ascending: false })
        .order('numero', { ascending: false })
        .limit(7)
      if (empresaId) q = q.eq('empresa_id', empresaId)
      return exigir(await q) as unknown as Recente[]
    },
  })

  const r = resumo.data
  const usado = paraNumero(r?.armazenamento_usado_bytes)
  const limite = paraNumero(r?.armazenamento_limite_bytes)
  const pct = percentualUso(usado, limite)
  const emAndamento = (obras.data ?? []).filter((o) => o.status === 'em_andamento')
  const primeiro = perfil.nome.split(' ')[0]
  const hoje = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <>
      <CabecalhoPagina
        sobretitulo={hoje}
        tituloAba="Dashboard"
        titulo={`Olá, ${primeiro}`}
        subtitulo={ehMaster ? (empresa ? `Visão da empresa ${empresa.nome}` : 'Visão geral de todas as empresas da plataforma') : `Resumo das obras da ${empresa?.nome ?? 'empresa'}`}
        acoes={
          <>
            {p.criarObra && (
              <Botao variante="secundario" icone={<Plus className="size-4" />} onClick={() => navegar('/obras?nova=1')}>Nova obra</Botao>
            )}
            {p.criarRelatorio && (
              <Botao variante="ambar" icone={<Plus className="size-4" />} onClick={() => navegar('/relatorios/novo')}>Novo RDO</Botao>
            )}
          </>
        }
      />

      {resumo.isError && <Erro mensagem={mensagemDeErro(resumo.error)} aoTentar={() => void resumo.refetch()} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {resumo.isLoading || !r ? (
          Array.from({ length: 4 }).map((_, i) => <Esqueleto key={i} className="h-[118px] rounded-lg" />)
        ) : (
          <>
            <Kpi destaque rotulo="Obras em andamento" valor={r.obras_andamento} detalhe={ehMaster && !empresaId && r.empresas_total != null ? `${r.obras_total} obras · ${r.empresas_total} empresas` : `de ${r.obras_total} obras cadastradas`} icone={<HardHat />} codigo="K-01" />
            <Kpi rotulo="Relatórios no mês" valor={r.relatorios_mes} detalhe={`${r.relatorios_total} relatórios no total`} icone={<ClipboardList />} codigo="K-02" />
            <Link to="/relatorios" className="block rounded-lg focus-visible:outline-2">
              <Kpi rotulo="Pendentes de aprovação" valor={r.relatorios_pendentes ?? 0} detalhe={(r.relatorios_pendentes ?? 0) > 0 ? 'Aguardando o administrador' : 'Nada pendente'} icone={<Hourglass />} codigo="K-03" alerta={(r.relatorios_pendentes ?? 0) > 0} />
            </Link>
            {limite > 0 ? (
              <Kpi rotulo="Armazenamento" valor={<>{pct.toFixed(0)}<span className="text-[16px] text-tinta-fraca">%</span></>} icone={<Database />} codigo="K-04">
                <Progresso valor={pct} tom={pct > 90 ? 'perigo' : pct > 70 ? 'ambar' : 'marinho'} className="mt-3" altura={5} rotuloAcessivel="Uso do armazenamento" />
                <p className="num mt-1.5 text-[11px] text-tinta-suave">
                  {formatarBytes(usado)} de {formatarBytes(limite, 0)}
                </p>
              </Kpi>
            ) : (
              <Kpi rotulo="Fotos registradas" valor={r.fotos_total} detalhe="Comprimidas em WebP" icone={<Camera />} codigo="K-04" />
            )}
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Cartao
          titulo="Obras em andamento"
          codigo="A-01"
          semPadding
          acao={
            <Link to="/obras" className="flex items-center gap-1 text-[12px] font-medium text-marinho-600 hover:text-marinho-900">
              Ver todas <ArrowUpRight className="size-3.5" />
            </Link>
          }
        >
          {obras.isLoading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, i) => <Esqueleto key={i} className="h-14" />)}</div>
          ) : emAndamento.length === 0 ? (
            <div className="p-4">
              <Vazio compacto titulo="Nenhuma obra em andamento" descricao="Cadastre uma obra ou mude o status de uma existente." icone={<HardHat className="size-3.5" />} />
            </div>
          ) : (
            <ul className="divide-y divide-dashed divide-linha-forte/70">
              {emAndamento.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link to={`/obras/${o.id}`} className="group flex items-center gap-3.5 px-4 py-3 hover:bg-marinho-50/50">
                    <ImagemAssinada caminho={o.capa_thumb_path} alt="" className="size-11 shrink-0 rounded-md ring-1 ring-linha" fallback={<HardHat className="size-4" />} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="truncate text-[13px] font-semibold text-tinta group-hover:text-marinho-700">{o.nome}</p>
                        {ehMaster && !empresaId && o.empresas?.nome && <span className="hidden truncate text-[11px] text-tinta-fraca sm:block">{o.empresas.nome}</span>}
                      </div>
                      <PrazoObra obra={o} compacto />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Últimos relatórios" codigo="A-02" semPadding>
          {recentes.isLoading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Esqueleto key={i} className="h-12" />)}</div>
          ) : !recentes.data?.length ? (
            <div className="p-4">
              <Vazio compacto titulo="Nenhum relatório ainda" descricao="Abra uma obra e crie o primeiro RDO." icone={<ClipboardList className="size-3.5" />} />
            </div>
          ) : (
            <ul className="divide-y divide-dashed divide-linha-forte/70">
              {recentes.data.map((rel) => (
                <li key={rel.id}>
                  <p className="truncate px-4 pt-2.5 text-[10.5px] font-semibold tracking-wide text-marinho-500 uppercase">{rel.obras?.nome}</p>
                  <div className="-mt-1.5">
                    <LinhaRelatorio r={rel} para={`/relatorios/${rel.id}`} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      {!!obras.data?.length && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(STATUS_OBRA) as (keyof typeof STATUS_OBRA)[]).map((s) => {
            const n = obras.data.filter((o) => o.status === s).length
            return (
              <div key={s} className="flex items-center justify-between rounded-lg border border-dashed border-linha-forte bg-white/60 px-3.5 py-2.5">
                <span className="text-[12px] text-tinta-suave">{STATUS_OBRA[s].rotulo}</span>
                <span className="num font-display text-[16px] font-extrabold text-marinho-900">{n}</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
