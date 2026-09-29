import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { ArrowLeft, Camera, ChevronRight, ClipboardList, FileDown, FileText, HardHat, MapPin } from 'lucide-react'
import { useDocumentos, useFotosObra, useObra, useRelatorios } from '@/lib/consultas'
import { mensagemDeErro } from '@/lib/supabase'
import { capitalizar, codigoRelatorio, diaDaSemana, formatarData } from '@/lib/formato'
import { STATUS_OBRA } from '@/lib/rotulos'
import { Abas, Botao, CarregandoPagina, Dado, Erro, Esqueleto, Selo, Vazio } from '@/componentes/ui'
import { Galeria, ImagemAssinada } from '@/componentes/midia'
import { ClimaResumo, PrazoObra } from '@/componentes/obra'
import { ListaDocumentos } from '@/componentes/documentos'
import { ModalPdfPeriodo } from '@/componentes/modaisRelatorio'
import { useAvisos } from '@/componentes/avisos'

type Aba = 'linha' | 'fotos' | 'documentos'

export default function PortalObra() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const aba = (params.get('aba') as Aba) || 'linha'
  const obra = useObra(id)
  const rel = useRelatorios(id)
  const fotos = useFotosObra(id)
  const docs = useDocumentos(id)
  const avisos = useAvisos()
  const [periodo, setPeriodo] = useState(false)
  const [baixando, setBaixando] = useState<string | null>(null)

  if (obra.isLoading) return <CarregandoPagina />
  if (obra.isError) return <Erro mensagem={mensagemDeErro(obra.error)} />
  const o = obra.data
  if (!o) return <Vazio titulo="Obra não encontrada" descricao="Ela não está liberada para o seu acesso." />
  const aprovados = (rel.data ?? []).filter((r) => r.status === 'aprovado')

  async function pdf(rid: string) {
    setBaixando(rid)
    try {
      const { baixarPdfRelatorio } = await import('@/lib/pdf-rdo')
      await baixarPdfRelatorio(rid)
    } catch (e) {
      avisos.erro(e)
    } finally {
      setBaixando(null)
    }
  }

  return (
    <>
      <Link to="/portal" className="mb-3 inline-flex items-center gap-1 text-[12px] text-tinta-suave hover:text-marinho-900"><ArrowLeft className="size-3.5" /> Minhas obras</Link>
      <section className="cartao cantoneiras mb-6 overflow-hidden">
        <div className="relative">
          <ImagemAssinada caminho={o.capa_path} alt={`Obra ${o.nome}`} className="aspect-[21/9] w-full sm:aspect-[3/1]" fallback={<div className="blueprint flex size-full items-center justify-center"><HardHat className="size-10 text-marinho-300/60" strokeWidth={1.2} /></div>} />
          <div className="absolute inset-0 bg-gradient-to-t from-marinho-950/85 via-marinho-950/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
            <Selo tom={STATUS_OBRA[o.status].tom} className="bg-white/95">{STATUS_OBRA[o.status].rotulo}</Selo>
            <h1 className="mt-2 font-display text-[24px] leading-tight font-extrabold sm:text-[30px]">{o.nome}</h1>
            <p className="mt-1 flex items-center gap-1 text-[12.5px] text-white/80"><MapPin className="size-3.5" />{[o.endereco, [o.cidade, o.uf].filter(Boolean).join(' / ')].filter(Boolean).join(' — ') || '—'}</p>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div><p className="rotulo mb-2">Prazo</p><PrazoObra obra={o} /></div>
          <Dado rotulo="Início">{o.data_inicio && formatarData(o.data_inicio)}</Dado>
          <Dado rotulo="Término previsto">{o.previsao_termino && formatarData(o.previsao_termino)}</Dado>
          <Dado rotulo="Relatórios aprovados"><span className="num font-display text-[18px] font-extrabold text-marinho-900">{aprovados.length}</span></Dado>
        </div>
      </section>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <Abas
          atual={aba}
          aoMudar={(a) => setParams({ aba: a }, { replace: true })}
          abas={[
            { id: 'linha', rotulo: 'Linha do tempo', icone: <ClipboardList className="size-3.5" />, contagem: aprovados.length },
            { id: 'fotos', rotulo: 'Fotos', icone: <Camera className="size-3.5" />, contagem: fotos.data?.length },
            { id: 'documentos', rotulo: 'Documentos', icone: <FileText className="size-3.5" />, contagem: docs.data?.length },
          ]}
        />
        {aba === 'linha' && aprovados.length > 0 && <Botao variante="secundario" tamanho="p" icone={<FileDown className="size-3.5" />} onClick={() => setPeriodo(true)}>PDF do período</Botao>}
      </div>

      <div key={aba} className="anim-aparecer">
        {aba === 'linha' &&
          (rel.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Esqueleto key={i} className="h-20" />)}</div>
          ) : !aprovados.length ? (
            <Vazio titulo="Nenhum relatório aprovado ainda" descricao="Os relatórios diários aparecem aqui assim que forem aprovados pela construtora." icone={<ClipboardList className="size-3.5" />} />
          ) : (
            <ol className="relative ml-3 border-l border-dashed border-linha-forte pl-6 sm:ml-4">
              {aprovados.map((r, i) => (
                <li key={r.id} className="relative mb-4 last:mb-0">
                  <span className={clsx('absolute top-4 -left-[31px] flex size-3 items-center justify-center rounded-full ring-4 ring-papel', i === 0 ? 'bg-ambar-500' : 'bg-marinho-600')} />
                  <div className="cartao flex flex-col gap-3 p-4 transition hover:shadow-cartao sm:flex-row sm:items-center">
                    <Link to={`/portal/relatorios/${r.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                      <span className="flex w-14 shrink-0 flex-col items-center rounded-md bg-marinho-900 py-1.5 text-white">
                        <span className="font-mono text-[8px] tracking-widest text-marinho-300">RD</span>
                        <span className="num font-display text-[15px] leading-tight font-extrabold">{r.numero}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold text-tinta">{capitalizar(diaDaSemana(r.data))}, {formatarData(r.data)}</span>
                        <span className="mt-1 flex items-center gap-2 text-[11.5px] text-tinta-fraca">
                          <ClimaResumo manha={r.clima_manha} tarde={r.clima_tarde} noite={r.clima_noite} />
                          {codigoRelatorio(r.numero)}
                        </span>
                      </span>
                    </Link>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Botao variante="secundario" tamanho="p" icone={<FileDown className="size-3.5" />} carregando={baixando === r.id} onClick={() => void pdf(r.id)}>PDF</Botao>
                      <Link to={`/portal/relatorios/${r.id}`} className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-marinho-600 hover:bg-marinho-50">Ver <ChevronRight className="size-3.5" /></Link>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ))}
        {aba === 'fotos' &&
          (fotos.isLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Esqueleto key={i} className="aspect-[4/3]" />)}</div>
          ) : (
            <Galeria fotos={fotos.data ?? []} vazio={<Vazio titulo="Nenhuma foto por enquanto" icone={<Camera className="size-3.5" />} />} />
          ))}
        {aba === 'documentos' && <ListaDocumentos documentos={docs.data ?? []} carregando={docs.isLoading} obra={o} podeEditar={false} />}
      </div>
      <ModalPdfPeriodo aberto={periodo} aoFechar={() => setPeriodo(false)} obraId={o.id} somenteAprovados />
    </>
  )
}
