import { Link, Outlet } from 'react-router-dom'
import { Logo } from '@/componentes/Logo'
import { ImagemAssinada } from '@/componentes/midia'
import { useSessao } from '@/lib/sessao'
import { MenuUsuario } from './Casca'

/** Portal do cliente: uma casca leve, sem menu lateral. */
export function CascaPortal() {
  const { empresa } = useSessao()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-linha bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/portal" className="flex items-center gap-3" aria-label="Início do portal">
            <Logo tamanho={24} />
            {empresa && (
              <>
                <span className="hidden h-6 w-px bg-linha-forte sm:block" aria-hidden />
                <span className="flex min-w-0 items-center gap-2">
                  {empresa.logo_path && (
                    <ImagemAssinada caminho={empresa.logo_path} alt="" className="size-6 rounded bg-white" classeImg="!object-contain" />
                  )}
                  <span className="hidden truncate text-[12.5px] font-semibold text-tinta-suave sm:block">{empresa.nome}</span>
                </span>
              </>
            )}
          </Link>
          <div className="w-auto sm:w-56">
            <div className="hidden sm:block"><MenuUsuario escuro={false} /></div>
            <div className="sm:hidden"><MenuUsuario escuro={false} compacto /></div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-dashed border-linha-forte py-6 text-center font-mono text-[10px] tracking-widest text-tinta-fraca uppercase">
        Acompanhamento de obra · Obtra
      </footer>
    </div>
  )
}
