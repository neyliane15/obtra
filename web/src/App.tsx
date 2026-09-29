import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { LogOut, RefreshCw, ServerCog, ShieldOff } from 'lucide-react'
import { useSessao } from './lib/sessao'
import { configuracaoAusente } from './lib/supabase'
import { rotaInicial, ehEquipe, ehGestor } from './lib/permissoes'
import type { Papel } from './tipos/banco'
import { Casca } from './layout/Casca'
import { CascaPortal } from './layout/CascaPortal'
import { Botao, CarregandoPagina } from './componentes/ui'
import { Logo } from './componentes/Logo'
import { Entrar, EsqueciSenha, RedefinirSenha } from './paginas/Acesso'

const Painel = lazy(() => import('./paginas/Painel'))
const Obras = lazy(() => import('./paginas/Obras'))
const ObraDetalhe = lazy(() => import('./paginas/ObraDetalhe'))
const Relatorio = lazy(() => import('./paginas/Relatorio'))
const Equipe = lazy(() => import('./paginas/Equipe'))
const Clientes = lazy(() => import('./paginas/Clientes'))
const Configuracoes = lazy(() => import('./paginas/Configuracoes'))
const Empresas = lazy(() => import('./paginas/master/Empresas'))
const Usuarios = lazy(() => import('./paginas/master/Usuarios'))
const PortalInicio = lazy(() => import('./paginas/portal/PortalInicio'))
const PortalObra = lazy(() => import('./paginas/portal/PortalObra'))

function TelaCentral({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="milimetrado flex min-h-dvh items-center justify-center p-6">
      <div className="cantoneiras w-full max-w-md rounded-xl border border-linha bg-white p-7 text-center shadow-cartao">
        <Logo tamanho={26} className="mb-6" />
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-marinho-50 text-marinho-700 ring-1 ring-marinho-200">{icone}</span>
        <h1 className="mt-4 font-display text-[18px] font-extrabold text-marinho-900">{titulo}</h1>
        <div className="mt-2 text-[12.5px] text-tinta-suave">{children}</div>
      </div>
    </div>
  )
}

function Protegida({ papeis, children }: { papeis?: (p: Papel) => boolean; children: ReactNode }) {
  const { carregando, sessao, perfil, falha, recarregar, sair, recuperandoSenha } = useSessao()
  const local = useLocation()
  if (carregando) return <div className="min-h-dvh"><CarregandoPagina texto="Abrindo o canteiro…" /></div>
  if (!sessao) return <Navigate to="/entrar" replace state={{ de: local.pathname }} />
  if (recuperandoSenha) return <Navigate to="/redefinir-senha" replace />
  if (falha)
    return (
      <TelaCentral icone={<RefreshCw className="size-5" />} titulo="Não conseguimos carregar seu perfil">
        <p>{falha}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Botao variante="secundario" onClick={() => void sair()} icone={<LogOut className="size-3.5" />}>Sair</Botao>
          <Botao onClick={() => void recarregar()} icone={<RefreshCw className="size-3.5" />}>Tentar de novo</Botao>
        </div>
      </TelaCentral>
    )
  if (!perfil || !perfil.ativo || (perfil.papel !== 'master' && !perfil.empresa_id))
    return (
      <TelaCentral icone={<ShieldOff className="size-5" />} titulo="Acesso não liberado">
        <p>Sua conta existe, mas ainda não está vinculada a uma empresa ativa. Fale com o administrador da sua construtora.</p>
        <Botao variante="secundario" className="mt-5" onClick={() => void sair()} icone={<LogOut className="size-3.5" />}>Sair</Botao>
      </TelaCentral>
    )
  if (papeis && !papeis(perfil.papel)) return <Navigate to={rotaInicial(perfil.papel)} replace />
  return <>{children}</>
}

function Inicio() {
  const { carregando, sessao, perfil } = useSessao()
  if (carregando) return <div className="min-h-dvh"><CarregandoPagina /></div>
  if (!sessao) return <Navigate to="/entrar" replace />
  return <Navigate to={rotaInicial(perfil?.papel)} replace />
}

function NaoEncontrada() {
  return (
    <TelaCentral icone={<span className="font-mono text-[12px] font-bold">404</span>} titulo="Página não encontrada">
      <p>O endereço não existe ou foi movido.</p>
      <Botao className="mt-5" onClick={() => (window.location.href = '/')}>Ir para o início</Botao>
    </TelaCentral>
  )
}

const soMaster = (p: Papel) => p === 'master'

export function App() {
  if (configuracaoAusente)
    return (
      <TelaCentral icone={<ServerCog className="size-5" />} titulo="Configuração pendente">
        <p>
          Faltam as variáveis <code className="font-mono text-marinho-700">VITE_SUPABASE_URL</code> e{' '}
          <code className="font-mono text-marinho-700">VITE_SUPABASE_ANON_KEY</code>. Copie <code className="font-mono">.env.example</code> para{' '}
          <code className="font-mono">.env</code>, preencha com os dados do projeto Supabase e reinicie.
        </p>
      </TelaCentral>
    )
  return (
    <Suspense fallback={<div className="min-h-dvh"><CarregandoPagina /></div>}>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />

        <Route element={<Protegida papeis={ehEquipe}><Casca /></Protegida>}>
          <Route path="/painel" element={<Painel />} />
          <Route path="/obras" element={<Obras />} />
          <Route path="/obras/:id" element={<ObraDetalhe />} />
          <Route path="/relatorios/:id" element={<Relatorio />} />
          <Route path="/equipe" element={<Protegida papeis={ehGestor}><Equipe /></Protegida>} />
          <Route path="/clientes" element={<Protegida papeis={ehGestor}><Clientes /></Protegida>} />
          <Route path="/empresa" element={<Protegida papeis={ehGestor}><Configuracoes /></Protegida>} />
          <Route path="/master" element={<Navigate to="/master/empresas" replace />} />
          <Route path="/master/empresas" element={<Protegida papeis={soMaster}><Empresas /></Protegida>} />
          <Route path="/master/usuarios" element={<Protegida papeis={soMaster}><Usuarios /></Protegida>} />
        </Route>

        <Route element={<Protegida papeis={(p) => p === 'cliente'}><CascaPortal /></Protegida>}>
          <Route path="/portal" element={<PortalInicio />} />
          <Route path="/portal/obras/:id" element={<PortalObra />} />
          <Route path="/portal/relatorios/:id" element={<Relatorio />} />
        </Route>

        <Route path="*" element={<NaoEncontrada />} />
      </Routes>
    </Suspense>
  )
}
