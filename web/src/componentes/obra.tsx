import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { Calendar, ChevronRight, Cloud, CloudRain, HardHat, MapPin, Moon, Sun, Sunrise, Sunset } from 'lucide-react'
import type { Clima, Condicao } from '@/tipos/banco'
import { calcularPrazo } from '@/lib/prazo'
import { diaDaSemana, formatarData, numeroRelatorio } from '@/lib/formato'
import { CLIMA, STATUS_OBRA, STATUS_RELATORIO } from '@/lib/rotulos'
import type { ObraLista, RelatorioLista } from '@/lib/consultas'
import { ImagemAssinada } from './midia'
import { Progresso, Selo } from './ui'

export function IconeClima({ clima, className }: { clima: Clima | null; className?: string }) {
  const c = clsx('size-4', className)
  if (clima === 'claro') return <Sun className={clsx(c, 'text-ambar-500')} aria-label="Claro" />
  if (clima === 'nublado') return <Cloud className={clsx(c, 'text-marinho-400')} aria-label="Nublado" />
  if (clima === 'chuvoso') return <CloudRain className={clsx(c, 'text-marinho-600')} aria-label="Chuvoso" />
  return <span className={clsx(c, 'inline-block text-center text-tinta-fraca')} aria-label="Sem registro">–</span>
}

export const PERIODOS = [
  { chave: 'manha', rotulo: 'Manhã', icone: Sunrise },
  { chave: 'tarde', rotulo: 'Tarde', icone: Sunset },
  { chave: 'noite', rotulo: 'Noite', icone: Moon },
] as const

export function ClimaResumo({ manha, tarde, noite }: { manha: Clima | null; tarde: Clima | null; noite?: Clima | null }) {
  return (
    <span className="inline-flex items-center gap-1" title={`Manhã: ${manha ? CLIMA[manha] : '—'} · Tarde: ${tarde ? CLIMA[tarde] : '—'}`}>
      <IconeClima clima={manha} className="size-3.5" />
      <IconeClima clima={tarde} className="size-3.5" />
      {noite !== undefined && <IconeClima clima={noite} className="size-3.5" />}
    </span>
  )
}

export function SeloCondicao({ condicao }: { condicao: Condicao | null }) {
  if (!condicao) return null
  return condicao === 'praticavel' ? <Selo tom="ok">Praticável</Selo> : <Selo tom="perigo">Impraticável</Selo>
}

export function PrazoObra({ obra, compacto }: { obra: Parameters<typeof calcularPrazo>[0]; compacto?: boolean }) {
  const p = calcularPrazo(obra)
  if (!p.definido) return <p className="text-xs text-tinta-fraca">Prazo não definido</p>
  const tom = p.atrasado ? 'perigo' : p.percentual >= 85 ? 'ambar' : 'marinho'
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="num text-tinta-suave">
          <strong className="font-semibold text-tinta">{p.decorridos}</strong> / {p.total} dias
        </span>
        <span className={clsx('num font-medium', p.atrasado ? 'text-perigo-600' : 'text-tinta-fraca')}>
          {p.atrasado ? `${Math.abs(p.restantes)} dias de atraso` : compacto ? `${p.restantes}d restantes` : `${p.restantes} dias restantes`}
        </span>
      </div>
      <Progresso valor={p.percentual} tom={tom} altura={compacto ? 4 : 6} rotuloAcessivel="Prazo decorrido" />
    </div>
  )
}

export function CartaoObra({ obra, para, mostrarEmpresa }: { obra: ObraLista; para: string; mostrarEmpresa?: boolean }) {
  const st = STATUS_OBRA[obra.status]
  return (
    <Link
      to={para}
      className="group cartao flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-marinho-300 hover:shadow-cartao focus-visible:-translate-y-0.5"
    >
      <div className="relative">
        <ImagemAssinada
          caminho={obra.capa_thumb_path}
          alt={`Capa da obra ${obra.nome}`}
          className="aspect-[16/9] w-full"
          classeImg="transition-transform duration-700 group-hover:scale-[1.04]"
          fallback={
            <div className="milimetrado flex size-full items-center justify-center">
              <HardHat className="size-7 text-marinho-300" strokeWidth={1.3} />
            </div>
          }
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <Selo tom={st.tom} className="bg-white/95 shadow-suave backdrop-blur">{st.rotulo}</Selo>
          {obra.codigo && (
            <span className="rounded bg-marinho-950/70 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-white backdrop-blur">{obra.codigo}</span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 border-t border-linha p-4">
        <div className="min-w-0">
          {mostrarEmpresa && obra.empresas?.nome && <p className="rotulo mb-0.5 truncate text-ambar-700">{obra.empresas.nome}</p>}
          <h3 className="truncate font-display text-[14.5px] font-bold text-marinho-900 group-hover:text-marinho-600">{obra.nome}</h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-tinta-fraca">
            <MapPin className="size-3 shrink-0" />
            {[obra.cidade, obra.uf].filter(Boolean).join(' / ') || obra.endereco || 'Local não informado'}
          </p>
        </div>
        <div className="mt-auto pontilhado-t pt-3">
          <PrazoObra obra={obra} compacto />
        </div>
      </div>
    </Link>
  )
}

export function LinhaRelatorio({ r, para }: { r: RelatorioLista; para: string }) {
  const st = STATUS_RELATORIO[r.status]
  return (
    <Link
      to={para}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-marinho-50/60 sm:gap-4"
    >
      <span className="flex w-12 shrink-0 flex-col items-center rounded-md border border-linha bg-papel py-1.5 group-hover:border-marinho-200">
        <span className="font-mono text-[8.5px] tracking-widest text-tinta-fraca">RDO</span>
        <span className="num font-display text-[14px] leading-tight font-extrabold text-marinho-900">{numeroRelatorio(r.numero)}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-tinta">
          <Calendar className="size-3.5 text-tinta-fraca" />
          <span className="num">{formatarData(r.data)}</span>
          <span className="truncate font-normal text-tinta-fraca capitalize">· {diaDaSemana(r.data)}</span>
        </p>
        <div className="mt-1 flex items-center gap-2.5">
          <ClimaResumo manha={r.clima_manha} tarde={r.clima_tarde} noite={r.clima_noite} />
          {r.condicao_manha === 'impraticavel' || r.condicao_tarde === 'impraticavel' ? (
            <span className="text-[11px] font-medium text-perigo-600">Impraticável</span>
          ) : null}
        </div>
      </div>
      <Selo tom={st.tom}>{st.rotulo}</Selo>
      <ChevronRight className="size-4 text-tinta-fraca transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
