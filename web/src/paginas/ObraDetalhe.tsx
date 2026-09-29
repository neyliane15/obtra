import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  ArrowLeft, Camera, ClipboardList, FileDown, FileText, HardHat, Info, MapPin, Pencil, Plus, Trash2, UserPlus, UserRoundCheck, X,
} from 'lucide-react'
import { useDocumentos, useFotosObra, useObra, usePerfis, useRelatorios, useVinculos, useEnvioFotos } from '@/lib/consultas'
import { usePerfil } from '@/lib/sessao'
import { permissoes } from '@/lib/permissoes'
import { supabase, exigir, mensagemDeErro } from '@/lib/supabase'
import { excluirFoto } from '@/lib/armazenamento'
import { excluirObraCompleta } from '@/lib/acoes'
import { formatarData } from '@/lib/formato'
import { STATUS_OBRA, STATUS_RELATORIO } from '@/lib/rotulos'
import type { Foto, StatusRelatorio } from '@/tipos/banco'
import { Abas, Avatar, Botao, CarregandoPagina, Cartao, Dado, Erro, Esqueleto, Selecao, Selo, Vazio } from '@/componentes/ui'
import { ImagemAssinada, Galeria, EnvioDeFotos } from '@/componentes/midia'
import { LinhaRelatorio, PrazoObra } from '@/componentes/obra'
import { FormularioObra } from '@/componentes/FormularioObra'
import { ListaDocumentos } from '@/componentes/documentos'
import { ModalPdfPeriodo } from '@/componentes/modaisRelatorio'
import { ModalNovoUsuario } from '@/componentes/usuarios'
import { useAvisos } from '@/componentes/avisos'
import { useTitulo } from '@/lib/titulo'

type Aba = 'relatorios' | 'fotos' | 'documentos' | 'clientes' | 'info'

export default function ObraDetalhe() {
  const { id } = useParams()
  const perfil = usePerfil()
  const p = permissoes(perfil.papel)
  const [params, setParams] = useSearchParams()
  const aba = (params.get('aba') as Aba) || 'relatorios'
  const obra = useObra(id)
  const relatorios = useRelatorios(id)
  const fotos = useFotosObra(id)
  const docs = useDocumentos(id)
  const [editar, setEditar] = useState(false)
  const navegar = useNavigate()
  const novoRdo = () => navegar(`/relatorios/novo?obra=${id}`)
  const [periodo, setPeriodo] = useState(false)
  useTitulo(obra.data?.nome ?? 'Obra')

  if (obra.isLoading) return <CarregandoPagina />
  if (obra.isError) return <Erro mensagem={mensagemDeErro(obra.error)} aoTentar={() => void obra.refetch()} />
  const o = obra.data
  if (!o)
    return (
      <Vazio titulo="Obra não encontrada" descricao="Ela pode ter sido excluída ou você não tem acesso." acao={<Link to="/obras"><Botao variante="secundario">Voltar às obras</Botao></Link>} />
    )

  const st = STATUS_OBRA[o.status]
  const abas: { id: Aba; rotulo: string; icone: React.ReactNode; contagem?: number }[] = [
    { id: 'relatorios', rotulo: 'Relatórios', icone: <ClipboardList className="size-3.5" />, contagem: relatorios.data?.length },
    { id: 'fotos', rotulo: 'Fotos', icone: <Camera className="size-3.5" />, contagem: fotos.data?.length },
    { id: 'documentos', rotulo: 'Documentos', icone: <FileText className="size-3.5" />, contagem: docs.data?.length },
    ...(p.gerenciarClientes ? [{ id: 'clientes' as Aba, rotulo: 'Clientes', icone: <UserRoundCheck className="size-3.5" /> }] : []),
    { id: 'info', rotulo: 'Informações', icone: <Info className="size-3.5" /> },
  ]

  return (
    <>
      <Link to="/obras" className="mb-3 inline-flex items-center gap-1 text-[12px] text-tinta-suave hover:text-marinho-900">
        <ArrowLeft className="size-3.5" /> Obras
      </Link>

      {/* ficha da obra */}
      <section className="cartao cantoneiras anim-subir mb-6 overflow-hidden">
        <div className="grid md:grid-cols-[minmax(0,340px)_1fr]">
          <div className="relative">
            <ImagemAssinada
              caminho={o.capa_path}
              alt={`Capa da obra ${o.nome}`}
              className="aspect-[16/9] size-full md:aspect-auto md:min-h-[210px]"
              fallback={<div className="blueprint flex size-full items-center justify-center"><HardHat className="size-10 text-marinho-300/60" strokeWidth={1.2} /></div>}
            />
            <span className="absolute bottom-2 left-2 rounded bg-marinho-950/70 px-1.5 py-0.5 font-mono text-[9.5px] tracking-widest text-white/90 backdrop-blur">
              {o.codigo ?? 'OBRA'}
            </span>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Selo tom={st.tom}>{st.rotulo}</Selo>
                  {o.empresas?.nome && perfil.papel === 'master' && <span className="rotulo text-ambar-700">{o.empresas.nome}</span>}
                </div>
                <h1 className="font-display text-[22px] leading-tight font-extrabold text-marinho-900 sm:text-[25px]">{o.nome}</h1>
                <p className="mt-1 flex items-center gap-1 text-[12.5px] text-tinta-suave">
                  <MapPin className="size-3.5 shrink-0 text-tinta-fraca" />
                  {[o.endereco, [o.cidade, o.uf].filter(Boolean).join(' / ')].filter(Boolean).join(' — ') || 'Local não informado'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.editarObra && <Botao variante="secundario" icone={<Pencil className="size-3.5" />} onClick={() => setEditar(true)}>Editar</Botao>}
                <Botao variante="secundario" icone={<FileDown className="size-3.5" />} onClick={() => setPeriodo(true)}>PDF do período</Botao>
                {p.criarRelatorio && <Botao icone={<Plus className="size-4" />} onClick={novoRdo}>Novo RDO</Botao>}
              </div>
            </div>
            <div className="grid gap-4 border-t border-dashed border-linha-forte pt-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <div>
                <p className="rotulo mb-2">Prazo</p>
                <PrazoObra obra={o} />
              </div>
              <Dado rotulo="Início">{o.data_inicio && <span className="num">{formatarData(o.data_inicio)}</span>}</Dado>
              <Dado rotulo="Término previsto">{o.previsao_termino && <span className="num">{formatarData(o.previsao_termino)}</span>}</Dado>
              <Dado rotulo="Resp. técnico">{o.responsavel_tecnico}</Dado>
            </div>
          </div>
        </div>
      </section>

      <Abas abas={abas} atual={aba} aoMudar={(a) => setParams({ aba: a }, { replace: true })} className="mb-5" />

      <div className="anim-aparecer" key={aba}>
        {aba === 'relatorios' && <AbaRelatorios obraId={o.id} lista={relatorios} podeCriar={p.criarRelatorio} aoNovo={novoRdo} />}
        {aba === 'fotos' && <AbaFotos obra={o} fotos={fotos.data ?? []} carregando={fotos.isLoading} podeEditar={p.enviarArquivos} />}
        {aba === 'documentos' && <ListaDocumentos documentos={docs.data ?? []} carregando={docs.isLoading} obra={o} podeEditar={p.enviarArquivos} />}
        {aba === 'clientes' && p.gerenciarClientes && <AbaClientes obra={o} />}
        {aba === 'info' && <AbaInfo obra={o} podeExcluir={p.excluirObra} aoEditar={() => setEditar(true)} />}
      </div>

      {p.editarObra && <FormularioObra aberto={editar} aoFechar={() => setEditar(false)} obra={o} />}
      <ModalPdfPeriodo aberto={periodo} aoFechar={() => setPeriodo(false)} obraId={o.id} />
    </>
  )
}

function AbaRelatorios({
  obraId, lista, podeCriar, aoNovo,
}: {
  obraId: string
  lista: ReturnType<typeof useRelatorios>
  podeCriar: boolean
  aoNovo: () => void
}) {
  const [filtro, setFiltro] = useState<StatusRelatorio | 'todos'>('todos')
  const itens = (lista.data ?? []).filter((r) => filtro === 'todos' || r.status === filtro)
  if (lista.isLoading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Esqueleto key={i} className="h-16" />)}</div>
  if (lista.isError) return <Erro mensagem={mensagemDeErro(lista.error)} />
  if (!lista.data?.length)
    return (
      <Vazio
        titulo="Nenhum relatório ainda"
        descricao="O RDO registra clima, efetivo, atividades e fotos do dia. Comece pelo de hoje."
        icone={<ClipboardList className="size-3.5" />}
        acao={podeCriar && <Botao icone={<Plus className="size-4" />} onClick={aoNovo}>Criar primeiro relatório</Botao>}
      />
    )
  return (
    <Cartao
      semPadding
      titulo={`${lista.data.length} relatórios`}
      codigo={`OB-${obraId.slice(0, 4).toUpperCase()}`}
      acao={
        <Selecao value={filtro} onChange={(e) => setFiltro(e.target.value as StatusRelatorio | 'todos')} className="!h-8 !w-auto text-xs" aria-label="Filtrar por status">
          <option value="todos">Todos</option>
          {(Object.keys(STATUS_RELATORIO) as StatusRelatorio[]).map((s) => <option key={s} value={s}>{STATUS_RELATORIO[s].rotulo}</option>)}
        </Selecao>
      }
    >
      {itens.length ? (
        <ul className="divide-y divide-dashed divide-linha-forte/70">
          {itens.map((r) => <li key={r.id}><LinhaRelatorio r={r} para={`/relatorios/${r.id}`} /></li>)}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-[12.5px] text-tinta-fraca">Nenhum relatório com este status.</p>
      )}
    </Cartao>
  )
}

function AbaFotos({ obra, fotos, carregando, podeEditar }: { obra: { id: string; empresa_id: string }; fotos: Foto[]; carregando: boolean; podeEditar: boolean }) {
  const avisos = useAvisos()
  const qc = useQueryClient()
  const { enviar, progresso } = useEnvioFotos({ empresaId: obra.empresa_id, obraId: obra.id }, avisos.erro)
  const grupos = useMemo(() => {
    const m = new Map<string, Foto[]>()
    for (const f of fotos) {
      const k = f.criado_em.slice(0, 10)
      m.set(k, [...(m.get(k) ?? []), f])
    }
    return [...m.entries()]
  }, [fotos])

  async function excluir(f: Foto) {
    const ok = await avisos.confirmar({ titulo: 'Excluir foto?', descricao: 'A foto e a miniatura serão apagadas do armazenamento.', confirmar: 'Excluir', perigo: true })
    if (!ok) return
    try {
      await excluirFoto(f)
      avisos.sucesso('Foto excluída.')
      void qc.invalidateQueries({ queryKey: ['fotos', obra.id] })
      if (f.relatorio_id) void qc.invalidateQueries({ queryKey: ['fotos-relatorio', f.relatorio_id] })
    } catch (e) {
      avisos.erro(e)
    }
  }
  async function legendar(f: Foto, legenda: string) {
    const { error } = await supabase.from('fotos').update({ legenda: legenda || null }).eq('id', f.id)
    if (error) avisos.erro(error)
    else void qc.invalidateQueries({ queryKey: ['fotos', obra.id] })
  }

  return (
    <div className="flex flex-col gap-5">
      {podeEditar && <EnvioDeFotos aoEnviar={(a) => void enviar(a)} progresso={progresso} />}
      {carregando ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Esqueleto key={i} className="aspect-[4/3]" />)}</div>
      ) : !fotos.length ? (
        <Vazio titulo="Nenhuma foto" descricao="As fotos enviadas aqui ou nos relatórios aparecem nesta galeria." icone={<Camera className="size-3.5" />} />
      ) : (
        grupos.map(([dia, fs]) => (
          <section key={dia}>
            <h3 className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold text-tinta-suave">
              <span className="num font-mono text-[11px] text-marinho-600">{formatarData(dia)}</span>
              <span className="h-px flex-1 border-t border-dashed border-linha-forte" />
              <span className="num text-[11px] text-tinta-fraca">{fs.length} foto(s)</span>
            </h3>
            <Galeria fotos={fs} aoExcluir={podeEditar ? (f) => void excluir(f) : undefined} aoLegendar={podeEditar ? (f, l) => void legendar(f, l) : undefined} />
          </section>
        ))
      )}
    </div>
  )
}

function AbaClientes({ obra }: { obra: { id: string; empresa_id: string; nome: string } }) {
  const avisos = useAvisos()
  const qc = useQueryClient()
  const perfis = usePerfis(obra.empresa_id)
  const vinculos = useVinculos(obra.empresa_id)
  const [novo, setNovo] = useState(false)
  const [adicionar, setAdicionar] = useState('')
  const clientes = (perfis.data ?? []).filter((x) => x.papel === 'cliente')
  const vinculados = clientes.filter((c) => vinculos.data?.some((v) => v.cliente_id === c.id && v.obra_id === obra.id))
  const disponiveis = clientes.filter((c) => !vinculados.includes(c))

  async function definir(clienteId: string, incluir: boolean) {
    const atuais = (vinculos.data ?? []).filter((v) => v.cliente_id === clienteId).map((v) => v.obra_id)
    const obras = incluir ? [...new Set([...atuais, obra.id])] : atuais.filter((x) => x !== obra.id)
    const { error } = await supabase.rpc('definir_obras_cliente', { p_cliente: clienteId, p_obras: obras })
    if (error) return avisos.erro(error)
    avisos.sucesso(incluir ? 'Cliente vinculado à obra.' : 'Acesso removido.')
    setAdicionar('')
    void qc.invalidateQueries({ queryKey: ['vinculos'] })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Cartao titulo="Clientes com acesso" codigo="CL" semPadding acao={<Botao tamanho="p" icone={<UserPlus className="size-3.5" />} onClick={() => setNovo(true)}>Novo cliente</Botao>}>
        {perfis.isLoading || vinculos.isLoading ? (
          <div className="space-y-2 p-4"><Esqueleto className="h-12" /><Esqueleto className="h-12" /></div>
        ) : vinculados.length ? (
          <ul className="divide-y divide-linha">
            {vinculados.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar nome={c.nome} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-tinta">{c.nome}</p>
                  <p className="truncate text-[11.5px] text-tinta-fraca">{c.email}</p>
                </div>
                {!c.ativo && <Selo tom="neutro">Inativo</Selo>}
                <Botao variante="fantasma" tamanho="p" icone={<X className="size-3.5" />} onClick={() => void definir(c.id, false)}>Remover</Botao>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4"><Vazio compacto titulo="Nenhum cliente com acesso" descricao="Crie um acesso único para o cliente acompanhar esta obra." icone={<UserRoundCheck className="size-3.5" />} /></div>
        )}
      </Cartao>
      <Cartao titulo="Dar acesso a cliente existente" codigo="CL-2">
        {disponiveis.length ? (
          <div className="flex gap-2">
            <Selecao value={adicionar} onChange={(e) => setAdicionar(e.target.value)} aria-label="Cliente">
              <option value="">Escolha um cliente…</option>
              {disponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome} — {c.email}</option>)}
            </Selecao>
            <Botao disabled={!adicionar} onClick={() => void definir(adicionar, true)}>Vincular</Botao>
          </div>
        ) : (
          <p className="text-[12.5px] text-tinta-fraca">Todos os clientes da empresa já têm acesso, ou não há clientes cadastrados.</p>
        )}
        <p className="mt-3 text-[11.5px] text-tinta-fraca">O cliente vê somente relatórios aprovados, as fotos deles e os documentos marcados como visíveis.</p>
      </Cartao>
      <ModalNovoUsuario aberto={novo} aoFechar={() => setNovo(false)} papeis={['cliente']} empresaIdFixa={obra.empresa_id} obrasIniciais={[obra.id]} />
    </div>
  )
}

function AbaInfo({ obra, podeExcluir, aoEditar }: { obra: NonNullable<ReturnType<typeof useObra>['data']>; podeExcluir: boolean; aoEditar: () => void }) {
  const avisos = useAvisos()
  const qc = useQueryClient()
  const navegar = useNavigate()
  const [excluindo, setExcluindo] = useState(false)
  const uso = useQuery({
    queryKey: ['obra-uso', obra.id],
    queryFn: async () => {
      const [f, d] = await Promise.all([
        supabase.from('fotos').select('bytes').eq('obra_id', obra.id),
        supabase.from('documentos').select('bytes').eq('obra_id', obra.id),
      ])
      const soma = (l: { bytes: number | string }[]) => l.reduce((s, x) => s + Number(x.bytes || 0), 0)
      return soma(exigir(f) as { bytes: number }[]) + soma(exigir(d) as { bytes: number }[])
    },
  })

  async function excluir() {
    const ok = await avisos.confirmar({
      titulo: 'Excluir obra?',
      descricao: <>Serão apagados definitivamente <strong>todos</strong> os relatórios, fotos e documentos de <strong>{obra.nome}</strong>. Não há como desfazer.</>,
      confirmar: 'Excluir obra',
      perigo: true,
      digitar: 'EXCLUIR',
    })
    if (!ok) return
    setExcluindo(true)
    try {
      await excluirObraCompleta(obra)
      await qc.invalidateQueries({ queryKey: ['obras'] })
      void qc.invalidateQueries({ queryKey: ['painel'] })
      avisos.sucesso('Obra excluída.')
      navegar('/obras', { replace: true })
    } catch (e) {
      avisos.erro(e)
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <Cartao titulo="Dados da obra" codigo="INF" acao={podeExcluir && <Botao tamanho="p" variante="secundario" icone={<Pencil className="size-3" />} onClick={aoEditar}>Editar</Botao>}>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Dado rotulo="Nome">{obra.nome}</Dado>
          <Dado rotulo="Código">{obra.codigo}</Dado>
          <Dado rotulo="Contratante">{obra.contratante}</Dado>
          <Dado rotulo="Responsável técnico">{obra.responsavel_tecnico}</Dado>
          <Dado rotulo="Endereço" className="sm:col-span-2">{obra.endereco}</Dado>
          <Dado rotulo="Cidade / UF">{[obra.cidade, obra.uf].filter(Boolean).join(' / ')}</Dado>
          <Dado rotulo="Status">{STATUS_OBRA[obra.status].rotulo}</Dado>
          <Dado rotulo="Início">{obra.data_inicio && formatarData(obra.data_inicio)}</Dado>
          <Dado rotulo="Prazo">{obra.prazo_dias ? `${obra.prazo_dias} dias` : null}</Dado>
          <Dado rotulo="Previsão de término">{obra.previsao_termino && formatarData(obra.previsao_termino)}</Dado>
          <Dado rotulo="Cadastrada em">{formatarData(obra.criado_em)}</Dado>
          <Dado rotulo="Observações" className="sm:col-span-2"><span className="whitespace-pre-line">{obra.observacoes}</span></Dado>
        </dl>
      </Cartao>
      <div className="flex flex-col gap-5">
        <Cartao titulo="Armazenamento da obra" codigo="ARM">
          <p className="num font-display text-[24px] font-extrabold text-marinho-900">
            {uso.data !== undefined ? (uso.data / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'} <span className="text-[13px] text-tinta-fraca">MB</span>
          </p>
          <p className="mt-1 text-[11.5px] text-tinta-fraca">Fotos (WebP) e documentos (PDF compactado). PDFs de RDO não ocupam espaço: são gerados na hora.</p>
        </Cartao>
        {podeExcluir && (
          <div className={clsx('rounded-lg border border-perigo-600/25 bg-perigo-50/60 p-4')}>
            <p className="font-display text-[13px] font-bold text-perigo-600">Zona de perigo</p>
            <p className="mt-1 text-[12px] text-tinta-suave">Excluir a obra remove relatórios, fotos e documentos do armazenamento.</p>
            <Botao variante="perigo" className="mt-3" icone={<Trash2 className="size-3.5" />} carregando={excluindo} onClick={() => void excluir()}>Excluir obra</Botao>
          </div>
        )}
      </div>
    </div>
  )
}
