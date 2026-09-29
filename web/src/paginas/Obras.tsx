import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { HardHat, Plus, Search } from 'lucide-react'
import { useObras } from '@/lib/consultas'
import { useSessao, usePerfil } from '@/lib/sessao'
import { permissoes } from '@/lib/permissoes'
import { mensagemDeErro } from '@/lib/supabase'
import { STATUS_OBRA } from '@/lib/rotulos'
import { normalizar } from '@/lib/formato'
import type { StatusObra } from '@/tipos/banco'
import { Botao, CabecalhoPagina, Erro, Esqueleto, Vazio } from '@/componentes/ui'
import { CartaoObra } from '@/componentes/obra'
import { FormularioObra } from '@/componentes/FormularioObra'


export default function Obras() {
  const perfil = usePerfil()
  const { ehMaster, empresaId } = useSessao()
  const p = permissoes(perfil.papel)
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<StatusObra | 'todas'>('todas')
  const obras = useObras()
  const novaAberta = params.get('nova') === '1'

  const lista = useMemo(() => {
    const q = normalizar(busca.trim())
    return (obras.data ?? []).filter(
      (o) =>
        (filtro === 'todas' || o.status === filtro) &&
        (!q || normalizar([o.nome, o.codigo, o.cidade, o.contratante, o.empresas?.nome].filter(Boolean).join(' ')).includes(q)),
    )
  }, [obras.data, busca, filtro])

  const contagem = (s: StatusObra | 'todas') => (obras.data ?? []).filter((o) => s === 'todas' || o.status === s).length

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Carteira"
        titulo="Obras"
        subtitulo={`${obras.data?.length ?? 0} obras${ehMaster && !empresaId ? ' em todas as empresas' : ''}`}
        acoes={p.criarObra && <Botao icone={<Plus className="size-4" />} onClick={() => setParams({ nova: '1' })}>Nova obra</Botao>}
      />

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="rolagem-fina -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
          {(['todas', ...Object.keys(STATUS_OBRA)] as (StatusObra | 'todas')[]).map((s) => (
            <button
              key={s}
              onClick={() => setFiltro(s)}
              aria-pressed={filtro === s}
              className={clsx(
                'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
                filtro === s ? 'border-marinho-900 bg-marinho-900 text-white' : 'border-linha-forte bg-white text-tinta-suave hover:border-marinho-300',
              )}
            >
              {s === 'todas' ? 'Todas' : STATUS_OBRA[s].rotulo}
              <span className={clsx('num text-[10.5px]', filtro === s ? 'text-marinho-200' : 'text-tinta-fraca')}>{contagem(s)}</span>
            </button>
          ))}
        </div>
        <label className="relative md:w-72">
          <span className="sr-only">Buscar obra</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-tinta-fraca" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, código, cidade…" className="campo pl-8" />
        </label>
      </div>

      {obras.isError ? (
        <Erro mensagem={mensagemDeErro(obras.error)} aoTentar={() => void obras.refetch()} />
      ) : obras.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Esqueleto key={i} className="h-[270px] rounded-lg" />)}
        </div>
      ) : lista.length === 0 ? (
        <Vazio
          titulo={obras.data?.length ? 'Nenhuma obra encontrada' : 'Nenhuma obra cadastrada'}
          descricao={obras.data?.length ? 'Ajuste a busca ou o filtro de status.' : 'Cadastre a primeira obra para começar a registrar os diários.'}
          icone={<HardHat className="size-3.5" />}
          acao={!obras.data?.length && p.criarObra && <Botao icone={<Plus className="size-4" />} onClick={() => setParams({ nova: '1' })}>Cadastrar obra</Botao>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((o, i) => (
            <div key={o.id} className="anim-subir" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
              <CartaoObra obra={o} para={`/obras/${o.id}`} mostrarEmpresa={ehMaster && !empresaId} />
            </div>
          ))}
        </div>
      )}

      {p.criarObra && (
        <FormularioObra aberto={novaAberta} aoFechar={() => setParams({})} aoSalvar={(id) => navegar(`/obras/${id}`)} />
      )}
    </>
  )
}
