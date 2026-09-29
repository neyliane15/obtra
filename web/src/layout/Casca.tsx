import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  BriefcaseBusiness, Building2, ChevronsUpDown, ClipboardList, Download, HardHat, History, KeyRound, LayoutDashboard, LogOut, Menu, Package,
  Settings, ShieldCheck, UserCog, Users, Wrench, X,
} from 'lucide-react'
import { Simbolo } from '@/componentes/Logo'
import { Avatar } from '@/componentes/ui'
import { ModalTrocarSenha } from '@/componentes/TrocarSenha'
import { ImagemAssinada } from '@/componentes/midia'
import { useSessao, usePerfil } from '@/lib/sessao'
import { permissoes } from '@/lib/permissoes'
import { PAPEL } from '@/lib/rotulos'
import { formatarBytes, percentualUso } from '@/lib/formato'
import { paraNumero } from '@/tipos/banco'
import { useEmpresa } from '@/lib/consultas'

interface ItemNav {
  para: string
  rotulo: string
  icone: ReactNode
  grupo: 'obra' | 'cadastros' | 'gestao' | 'master'
  /** mostra na navegação inferior do celular */
  atalho?: boolean
}

function useItens(): ItemNav[] {
  const perfil = usePerfil()
  const p = permissoes(perfil.papel)
  const itens: ItemNav[] = [
    { para: '/painel', rotulo: 'Dashboard', icone: <LayoutDashboard />, grupo: 'obra', atalho: true },
    { para: '/obras', rotulo: 'Obras', icone: <HardHat />, grupo: 'obra', atalho: true },
    { para: '/relatorios', rotulo: 'Relatórios (RDO)', icone: <ClipboardList />, grupo: 'obra', atalho: true },
    { para: '/historico', rotulo: 'Histórico', icone: <History />, grupo: 'obra', atalho: true },
    { para: '/cadastros/mao-de-obra', rotulo: 'Mão de Obra', icone: <Users />, grupo: 'cadastros' },
    { para: '/cadastros/funcoes', rotulo: 'Funções', icone: <BriefcaseBusiness />, grupo: 'cadastros' },
    { para: '/cadastros/materiais', rotulo: 'Materiais', icone: <Package />, grupo: 'cadastros' },
    { para: '/cadastros/equipamentos', rotulo: 'Equipamentos', icone: <Wrench />, grupo: 'cadastros' },
    { para: '/exportacao', rotulo: 'Relatórios & Exportação', icone: <Download />, grupo: 'gestao' },
  ]
  if (p.gerenciarEquipe) itens.push({ para: '/usuarios', rotulo: 'Usuários & Clientes', icone: <UserCog />, grupo: 'gestao' })
  if (p.areaMaster) {
    itens.push({ para: '/master/empresas', rotulo: 'Empresas', icone: <Building2 />, grupo: 'master' })
    itens.push({ para: '/master/usuarios', rotulo: 'Todos os usuários', icone: <ShieldCheck />, grupo: 'master' })
  }
  return itens
}

const GRUPOS: Record<ItemNav['grupo'], string> = { obra: 'Operação', cadastros: 'Cadastros', gestao: 'Gestão', master: 'Plataforma' }

function ItemLateral({ para, icone, rotulo, aoNavegar, fim }: { para: string; icone: ReactNode; rotulo: string; aoNavegar?: () => void; fim?: boolean }) {
  return (
    <NavLink
      to={para}
      end={fim}
      onClick={aoNavegar}
      className={({ isActive }) =>
        clsx(
          'group relative flex h-[34px] items-center gap-2.5 rounded-md px-3 text-[12.5px] font-medium transition-colors [&_svg]:size-[15px]',
          isActive ? 'bg-ambar-500/[0.14] text-ambar-400' : 'text-marinho-200/75 hover:bg-white/[0.05] hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-1.5 bottom-1.5 -left-[13px] w-[3px] rounded-r bg-ambar-500" />}
          <span className={clsx(isActive ? 'text-ambar-400' : 'text-marinho-300/60 group-hover:text-marinho-200')}>{icone}</span>
          <span className="truncate">{rotulo}</span>
        </>
      )}
    </NavLink>
  )
}

function Navegacao({ aoNavegar }: { aoNavegar?: () => void }) {
  const itens = useItens()
  const grupos = (['obra', 'cadastros', 'gestao', 'master'] as const).filter((g) => itens.some((i) => i.grupo === g))
  return (
    <nav className="flex flex-col gap-4" aria-label="Principal">
      {grupos.map((g) => (
        <div key={g}>
          <p className="mb-1 flex items-center gap-2 px-3 font-mono text-[9px] tracking-[0.2em] text-marinho-300/55 uppercase">
            {GRUPOS[g]}
            <span className="h-px flex-1 border-t border-dashed border-white/10" />
          </p>
          <ul className="flex flex-col gap-px">
            {itens
              .filter((i) => i.grupo === g)
              .map((i) => (
                <li key={i.para}>
                  <ItemLateral para={i.para} icone={i.icone} rotulo={i.rotulo} aoNavegar={aoNavegar} />
                </li>
              ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Topo da lateral: logo + nome da empresa + "OBTRA · RDO". */
function Marca() {
  const { ehMaster, empresa } = useSessao()
  return (
    <div className="flex items-center gap-3">
      {empresa?.logo_path ? (
        <ImagemAssinada caminho={empresa.logo_path} alt="" className="size-10 shrink-0 rounded-lg bg-white ring-1 ring-white/10" classeImg="!object-contain p-1" />
      ) : (
        <Simbolo tamanho={40} className="shrink-0 rounded-[10px] ring-1 ring-white/10" />
      )}
      <div className="min-w-0">
        <p className="truncate font-display text-[14px] leading-tight font-bold text-white">{empresa?.nome ?? (ehMaster ? 'Obtra' : '—')}</p>
        <p className="mt-0.5 font-mono text-[9.5px] font-semibold tracking-[0.22em] text-ambar-400">OBTRA · RDO</p>
      </div>
    </div>
  )
}

function SeletorEmpresa() {
  const { ehMaster, empresas, empresaId, empresa, trocarEmpresa } = useSessao()
  if (!ehMaster) return null
  return (
    <label className="relative block rounded-lg border border-ambar-500/25 bg-ambar-500/[0.06] px-2.5 py-2 pr-7">
      <span className="block font-mono text-[9px] tracking-[0.18em] text-ambar-400/90 uppercase">Contexto master</span>
      <span className="block truncate text-[12px] font-semibold text-white">{empresa?.nome ?? 'Todas as empresas'}</span>
      <ChevronsUpDown className="absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-marinho-300" />
      <select
        className="absolute inset-0 cursor-pointer opacity-0"
        value={empresaId ?? ''}
        onChange={(e) => trocarEmpresa(e.target.value || null)}
        aria-label="Empresa em contexto"
      >
        <option value="">Todas as empresas</option>
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
            {e.ativa ? '' : ' (inativa)'}
          </option>
        ))}
      </select>
    </label>
  )
}

function UsoArmazenamento() {
  const { empresaId } = useSessao()
  const { data: empresa } = useEmpresa(empresaId)
  const perfil = usePerfil()
  if (!empresa || perfil.papel === 'colaborador') return null
  const usado = paraNumero(empresa.armazenamento_usado_bytes)
  const limite = empresa.limite_armazenamento_mb * 1024 * 1024
  const pct = percentualUso(usado, limite)
  return (
    <div className="rounded-lg border border-dashed border-white/12 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between font-mono text-[9.5px] tracking-wider text-marinho-300/80 uppercase">
        <span>Armazenamento</span>
        <span className="num">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <div className={clsx('h-full rounded-full', pct > 90 ? 'bg-perigo-600' : pct > 70 ? 'bg-ambar-500' : 'bg-marinho-400')} style={{ width: `${pct}%` }} />
      </div>
      <p className="num mt-1.5 text-[10.5px] text-marinho-200/70">
        {formatarBytes(usado)} de {formatarBytes(limite, 0)}
      </p>
    </div>
  )
}

export function MenuUsuario({ escuro = true, compacto = false }: { escuro?: boolean; compacto?: boolean }) {
  const perfil = usePerfil()
  const { sair } = useSessao()
  const [aberto, setAberto] = useState(false)
  const [senha, setSenha] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const f = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAberto(false)
    const t = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', f)
    document.addEventListener('keydown', t)
    return () => {
      document.removeEventListener('mousedown', f)
      document.removeEventListener('keydown', t)
    }
  }, [aberto])
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        className={clsx(
          'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors',
          escuro ? 'hover:bg-white/[0.06]' : 'hover:bg-marinho-50',
        )}
      >
        <Avatar nome={perfil.nome} tamanho={compacto ? 28 : 32} className={escuro ? '!ring-marinho-800' : ''} />
        {!compacto && (
          <span className="min-w-0 flex-1">
            <span className={clsx('block truncate text-[12.5px] font-semibold', escuro ? 'text-white' : 'text-marinho-900')}>{perfil.nome}</span>
            <span className={clsx('block truncate text-[11px]', escuro ? 'text-marinho-300/80' : 'text-tinta-fraca')}>{PAPEL[perfil.papel]}</span>
          </span>
        )}
        {!compacto && <ChevronsUpDown className={clsx('size-3.5', escuro ? 'text-marinho-300' : 'text-tinta-fraca')} />}
      </button>
      {aberto && (
        <div
          role="menu"
          className={clsx(
            'anim-subir absolute z-50 w-60 rounded-lg border border-linha bg-white p-1.5 shadow-flutuante',
            escuro ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2',
          )}
        >
          <div className="border-b border-dashed border-linha-forte px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-[12.5px] font-semibold text-marinho-900">{perfil.nome}</p>
            <p className="truncate text-[11px] text-tinta-fraca">{perfil.email}</p>
          </div>
          <button role="menuitem" onClick={() => { setSenha(true); setAberto(false) }} className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] text-tinta hover:bg-marinho-50">
            <KeyRound className="size-3.5 text-tinta-fraca" /> Trocar senha
          </button>
          <button role="menuitem" onClick={() => void sair()} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] text-perigo-600 hover:bg-perigo-50">
            <LogOut className="size-3.5" /> Sair
          </button>
        </div>
      )}
      <ModalTrocarSenha aberto={senha} aoFechar={() => setSenha(false)} />
    </div>
  )
}

function ConteudoLateral({ aoNavegar }: { aoNavegar?: () => void }) {
  const perfil = usePerfil()
  const { sair, empresaId } = useSessao()
  const p = permissoes(perfil.papel)
  return (
    <div className="blueprint relative flex h-full flex-col text-white">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
      <div className="border-b border-white/[0.07] px-5 pt-5 pb-4">
        <Marca />
      </div>
      {perfil.papel === 'master' && (
        <div className="px-4 pt-3">
          <SeletorEmpresa />
        </div>
      )}
      <div className="rolagem-fina flex-1 overflow-y-auto px-4 pt-4 pb-2">
        <Navegacao aoNavegar={aoNavegar} />
      </div>
      <div className="flex flex-col gap-2 border-t border-white/[0.07] px-4 pt-3 pb-4">
        <UsoArmazenamento />
        <div className="flex flex-col gap-px">
          {p.configurarEmpresa && (perfil.papel !== 'master' || empresaId) && (
            <ItemLateral para="/empresa" icone={<Settings />} rotulo="Configurações" aoNavegar={aoNavegar} />
          )}
          <button
            onClick={() => void sair()}
            className="flex h-[34px] items-center gap-2.5 rounded-md px-3 text-[12.5px] font-medium text-marinho-200/75 transition-colors hover:bg-white/[0.05] hover:text-white [&_svg]:size-[15px]"
          >
            <LogOut className="text-marinho-300/60" /> Sair
          </button>
        </div>
        <div className="mt-1 border-t border-dashed border-white/10 pt-2.5">
          <MenuUsuario />
        </div>
      </div>
    </div>
  )
}

function NavInferior({ aoMais }: { aoMais: () => void }) {
  const itens = useItens().filter((i) => i.atalho)
  return (
    <nav className="pb-seguro fixed inset-x-0 bottom-0 z-40 border-t border-linha bg-white/95 backdrop-blur lg:hidden" aria-label="Navegação inferior">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${itens.length + 1}, minmax(0, 1fr))` }}>
        {itens.map((i) => (
          <li key={i.para}>
            <NavLink
              to={i.para}
              className={({ isActive }) =>
                clsx(
                  'relative flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium [&_svg]:size-[18px]',
                  isActive ? 'text-marinho-900' : 'text-tinta-fraca',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-0 h-[2px] w-8 rounded-b bg-ambar-500" />}
                  {i.icone}
                  <span className="max-w-full truncate px-1">{i.rotulo.replace(' (RDO)', '')}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button onClick={aoMais} className="flex h-14 w-full flex-col items-center justify-center gap-1 text-[10px] font-medium text-tinta-fraca">
            <Menu className="size-[18px]" />
            Mais
          </button>
        </li>
      </ul>
    </nav>
  )
}

export function Casca() {
  const [gaveta, setGaveta] = useState(false)
  const local = useLocation()
  const { empresa, ehMaster } = useSessao()
  useEffect(() => setGaveta(false), [local.pathname])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [local.pathname])
  return (
    <div className="min-h-dvh">
      {/* lateral desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block">
        <ConteudoLateral />
      </aside>

      {/* topo mobile */}
      <header className="sticky top-0 z-30 flex h-13 items-center justify-between gap-3 border-b border-linha bg-white/90 px-4 backdrop-blur lg:hidden" style={{ height: 52 }}>
        <div className="flex min-w-0 items-center gap-2.5">
          <Simbolo tamanho={26} />
          <div className="min-w-0 leading-tight">
            <p className="font-display text-[14px] font-extrabold tracking-tight text-marinho-900">obtra</p>
            <p className={clsx('truncate text-[10.5px]', ehMaster ? 'text-ambar-700' : 'text-tinta-fraca')}>
              {empresa?.nome ?? (ehMaster ? 'Master · todas as empresas' : '')}
            </p>
          </div>
        </div>
        <MenuUsuario escuro={false} compacto />
      </header>

      {/* gaveta mobile */}
      {gaveta && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="anim-aparecer absolute inset-0 bg-marinho-950/50" onClick={() => setGaveta(false)} />
          <div className="anim-subir absolute inset-y-0 left-0 w-[82%] max-w-[300px] shadow-flutuante">
            <ConteudoLateral aoNavegar={() => setGaveta(false)} />
            <button onClick={() => setGaveta(false)} className="absolute top-4 right-3 rounded-md p-1.5 text-white/70 hover:bg-white/10" aria-label="Fechar menu">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <main className="lg:pl-[248px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 pt-5 pb-24 sm:px-6 lg:px-9 lg:pt-8 lg:pb-12">
          <Outlet />
        </div>
      </main>
      <NavInferior aoMais={() => setGaveta(true)} />
    </div>
  )
}
