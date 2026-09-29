import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { Botao, Modal } from './ui'
import { mensagemDeErro } from '@/lib/supabase'

type TipoAviso = 'sucesso' | 'erro' | 'info'
interface Aviso {
  id: number
  tipo: TipoAviso
  texto: string
}

interface PedidoConfirmacao {
  titulo: string
  descricao?: ReactNode
  confirmar?: string
  perigo?: boolean
  /** exige digitar este texto para liberar (exclusões graves) */
  digitar?: string
}

interface Api {
  sucesso: (t: string) => void
  erro: (e: unknown) => void
  info: (t: string) => void
  confirmar: (p: PedidoConfirmacao) => Promise<boolean>
}

const Ctx = createContext<Api | null>(null)

export function ProvedorDeAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const seq = useRef(0)
  const [pedido, setPedido] = useState<(PedidoConfirmacao & { resolver: (v: boolean) => void }) | null>(null)
  const [digitado, setDigitado] = useState('')

  const empurrar = useCallback((tipo: TipoAviso, texto: string) => {
    const id = ++seq.current
    setAvisos((a) => [...a.slice(-3), { id, tipo, texto }])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 6500 : 3800)
  }, [])

  const api = useMemo<Api>(
    () => ({
      sucesso: (t) => empurrar('sucesso', t),
      erro: (e) => empurrar('erro', mensagemDeErro(e)),
      info: (t) => empurrar('info', t),
      confirmar: (p) =>
        new Promise<boolean>((resolver) => {
          setDigitado('')
          setPedido({ ...p, resolver })
        }),
    }),
    [empurrar],
  )

  const fechar = (v: boolean) => {
    pedido?.resolver(v)
    setPedido(null)
  }
  const bloqueado = !!pedido?.digitar && digitado.trim() !== pedido.digitar

  return (
    <Ctx.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-[60px] z-[80] flex flex-col items-center gap-2 px-4 sm:top-5 sm:items-end sm:px-6 lg:top-6" aria-live="polite">
          {avisos.map((a) => (
            <div
              key={a.id}
              className={clsx(
                'anim-subir pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border bg-white px-3.5 py-3 text-[12.5px] shadow-flutuante',
                a.tipo === 'erro' ? 'border-perigo-600/30' : 'border-linha',
              )}
              role={a.tipo === 'erro' ? 'alert' : 'status'}
            >
              <span className={clsx('mt-px w-[3px] self-stretch rounded-full', a.tipo === 'sucesso' ? 'bg-ok-600' : a.tipo === 'erro' ? 'bg-perigo-600' : 'bg-marinho-500')} />
              {a.tipo === 'sucesso' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok-600" />}
              {a.tipo === 'erro' && <XCircle className="mt-0.5 size-4 shrink-0 text-perigo-600" />}
              {a.tipo === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-marinho-500" />}
              <span className="flex-1 text-tinta">{a.texto}</span>
              <button className="text-tinta-fraca hover:text-tinta" onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))} aria-label="Fechar aviso">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
      <Modal
        aberto={!!pedido}
        aoFechar={() => fechar(false)}
        titulo={pedido?.titulo ?? ''}
        largura="sm"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => fechar(false)}>Cancelar</Botao>
            <Botao variante={pedido?.perigo ? 'perigo' : 'primario'} disabled={bloqueado} onClick={() => fechar(true)}>
              {pedido?.confirmar ?? 'Confirmar'}
            </Botao>
          </>
        }
      >
        <div className="flex gap-3">
          {pedido?.perigo && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-perigo-50 text-perigo-600 ring-1 ring-perigo-600/20">
              <AlertTriangle className="size-4" />
            </span>
          )}
          <div className="flex-1 text-[12.5px] text-tinta-suave">
            {pedido?.descricao}
            {pedido?.digitar && (
              <label className="mt-3 block">
                <span className="rotulo">Digite <strong className="font-mono text-perigo-600 normal-case">{pedido.digitar}</strong> para confirmar</span>
                <input className="campo mt-1.5" value={digitado} onChange={(e) => setDigitado(e.target.value)} autoFocus />
              </label>
            )}
          </div>
        </div>
      </Modal>
    </Ctx.Provider>
  )
}

export function useAvisos(): Api {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAvisos fora do provedor')
  return c
}
