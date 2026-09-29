import { Link } from 'react-router-dom'
import { ArrowRight, HardHat, MapPin } from 'lucide-react'
import { useObras } from '@/lib/consultas'
import { usePerfil, useSessao } from '@/lib/sessao'
import { mensagemDeErro } from '@/lib/supabase'
import { STATUS_OBRA } from '@/lib/rotulos'
import { Erro, Esqueleto, Selo, Vazio } from '@/componentes/ui'
import { ImagemAssinada } from '@/componentes/midia'
import { PrazoObra } from '@/componentes/obra'
import { useTitulo } from '@/lib/titulo'

export default function PortalInicio() {
  const perfil = usePerfil()
  const { empresa } = useSessao()
  const obras = useObras()
  useTitulo('Minhas obras')
  const primeiro = perfil.nome.split(' ')[0]
  return (
    <>
      <section className="blueprint cantoneiras relative mb-8 overflow-hidden rounded-xl px-6 py-8 text-white [--cor-cantoneira:#F29A2E] sm:px-9 sm:py-10">
        <p className="font-mono text-[10px] tracking-[0.25em] text-ambar-400">PORTAL DO CLIENTE</p>
        <h1 className="mt-2 font-display text-[26px] leading-tight font-extrabold sm:text-[30px]">Olá, {primeiro}.</h1>
        <p className="mt-2 max-w-xl text-[13px] text-marinho-200/85">
          Acompanhe aqui o andamento {obras.data?.length === 1 ? 'da sua obra' : 'das suas obras'}{empresa ? ` com a ${empresa.nome}` : ''}: relatórios diários aprovados, fotos e documentos.
        </p>
        <svg className="pointer-events-none absolute right-6 bottom-0 hidden h-32 text-marinho-300/30 sm:block" viewBox="0 0 200 120" fill="none" aria-hidden>
          <path d="M10 118h180M30 118V50l40-25 40 25v68M110 118V70h60v48M50 118V90h20v28M125 80h10M150 80h10M125 95h10M150 95h10" stroke="currentColor" />
          <rect x="150" y="30" width="12" height="12" rx="2" fill="#F29A2E" />
        </svg>
      </section>

      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display text-[15px] font-bold text-marinho-900">Suas obras</h2>
        <span className="h-px flex-1 border-t border-dashed border-linha-forte" />
      </div>
      {obras.isError ? (
        <Erro mensagem={mensagemDeErro(obras.error)} />
      ) : obras.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Esqueleto key={i} className="h-60" />)}</div>
      ) : !obras.data?.length ? (
        <Vazio titulo="Nenhuma obra liberada ainda" descricao="Assim que a construtora vincular sua obra ao seu acesso, ela aparece aqui." icone={<HardHat className="size-3.5" />} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {obras.data.map((o) => (
            <Link key={o.id} to={`/portal/obras/${o.id}`} className="group cartao flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-cartao sm:flex-row">
              <ImagemAssinada caminho={o.capa_thumb_path} alt="" className="aspect-[16/9] w-full shrink-0 sm:aspect-auto sm:w-48" fallback={<div className="milimetrado flex size-full items-center justify-center"><HardHat className="size-7 text-marinho-300" /></div>} />
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div>
                  <Selo tom={STATUS_OBRA[o.status].tom}>{STATUS_OBRA[o.status].rotulo}</Selo>
                  <h3 className="mt-2 font-display text-[16px] font-bold text-marinho-900">{o.nome}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-[12px] text-tinta-fraca"><MapPin className="size-3" />{[o.cidade, o.uf].filter(Boolean).join(' / ') || o.endereco || '—'}</p>
                </div>
                <div className="mt-auto pontilhado-t pt-3"><PrazoObra obra={o} compacto /></div>
                <span className="flex items-center gap-1 text-[12px] font-semibold text-marinho-600 group-hover:gap-2 transition-all">Acompanhar <ArrowRight className="size-3.5" /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
