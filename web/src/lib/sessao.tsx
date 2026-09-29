/**
 * Sessão: quem está logado, com que papel e em qual empresa.
 *
 * O master não pertence a empresa nenhuma: ele pode "entrar" no contexto de
 * uma (filtro guardado aqui e no localStorage) ou ver todas. Para os demais
 * papéis a empresa é a do perfil, sem escolha.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, configuracaoAusente, mensagemDeErro } from './supabase'
import type { Empresa, Perfil } from '@/tipos/banco'

interface EstadoSessao {
  carregando: boolean
  sessao: Session | null
  perfil: Perfil | null
  /** Empresa do usuário, ou a escolhida pelo master (null = todas). */
  empresa: Empresa | null
  empresaId: string | null
  ehMaster: boolean
  /** Master: lista de empresas para o seletor. */
  empresas: Empresa[]
  trocarEmpresa: (id: string | null) => void
  recuperandoSenha: boolean
  concluirRecuperacao: () => void
  falha: string | null
  recarregar: () => Promise<void>
  sair: () => Promise<void>
}

const Contexto = createContext<EstadoSessao | null>(null)
const CHAVE = 'obtra.empresa-contexto'

function lerEscolha(): string | null {
  try {
    return localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [carregando, setCarregando] = useState(!configuracaoAusente)
  const [sessao, setSessao] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [escolhida, setEscolhida] = useState<string | null>(lerEscolha)
  const [recuperandoSenha, setRecuperando] = useState(
    () => typeof window !== 'undefined' && /type=recovery/.test(window.location.hash),
  )
  const [falha, setFalha] = useState<string | null>(null)

  const carregarPerfil = useCallback(async (s: Session | null) => {
    setFalha(null)
    if (!s) {
      setPerfil(null)
      setEmpresas([])
      return
    }
    try {
      const { data, error } = await supabase.from('perfis').select('*').eq('id', s.user.id).maybeSingle()
      if (error) throw error
      const p = (data as Perfil | null) ?? null
      setPerfil(p)
      if (p) {
        let q = supabase.from('empresas').select('*').order('nome')
        if (p.papel !== 'master' && p.empresa_id) q = q.eq('id', p.empresa_id)
        const r = await q
        setEmpresas((r.data as Empresa[] | null) ?? [])
      }
    } catch (e) {
      setFalha(mensagemDeErro(e))
    }
  }, [])

  useEffect(() => {
    if (configuracaoAusente) return
    let vivo = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!vivo) return
      setSessao(data.session)
      await carregarPerfil(data.session)
      if (vivo) setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      if (evento === 'SIGNED_OUT') {
        setSessao(null)
        setPerfil(null)
        setEmpresas([])
        qc.clear()
        return
      }
      if (evento === 'SIGNED_IN' || evento === 'USER_UPDATED') {
        setSessao((anterior) => {
          if (anterior?.user.id !== s?.user.id) {
            // adia para fora do callback do auth (evita deadlock do supabase-js)
            setTimeout(() => {
              setCarregando(true)
              void carregarPerfil(s).finally(() => setCarregando(false))
            }, 0)
          }
          return s
        })
      } else if (evento === 'TOKEN_REFRESHED') {
        setSessao(s)
      }
    })
    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [carregarPerfil, qc])

  const ehMaster = perfil?.papel === 'master'
  const empresaId = ehMaster ? (empresas.some((e) => e.id === escolhida) ? escolhida : null) : (perfil?.empresa_id ?? null)
  const empresa = empresas.find((e) => e.id === empresaId) ?? null

  const trocarEmpresa = useCallback(
    (id: string | null) => {
      setEscolhida(id)
      try {
        if (id) localStorage.setItem(CHAVE, id)
        else localStorage.removeItem(CHAVE)
      } catch {
        /* navegação privada */
      }
      void qc.invalidateQueries()
    },
    [qc],
  )

  const recarregar = useCallback(async () => {
    await carregarPerfil(sessao)
  }, [carregarPerfil, sessao])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
    setRecuperando(false)
  }, [])

  const valor = useMemo<EstadoSessao>(
    () => ({
      carregando,
      sessao,
      perfil,
      empresa,
      empresaId,
      ehMaster,
      empresas,
      trocarEmpresa,
      recuperandoSenha,
      concluirRecuperacao: () => setRecuperando(false),
      falha,
      recarregar,
      sair,
    }),
    [carregando, sessao, perfil, empresa, empresaId, ehMaster, empresas, trocarEmpresa, recuperandoSenha, falha, recarregar, sair],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSessao(): EstadoSessao {
  const c = useContext(Contexto)
  if (!c) throw new Error('useSessao fora do ProvedorDeSessao')
  return c
}

/** Atalho: perfil garantido (use só dentro de rotas protegidas). */
export function usePerfil(): Perfil {
  const { perfil } = useSessao()
  if (!perfil) throw new Error('Perfil ausente')
  return perfil
}
