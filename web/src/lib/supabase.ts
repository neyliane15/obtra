import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Falta de configuração vira tela amigável (ver App), não tela branca. */
export const configuracaoAusente = !url || !chave

export const supabase: SupabaseClient = createClient(
  url || 'http://configuracao-ausente.invalid',
  chave || 'chave-ausente',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)

/** Extrai uma mensagem legível de qualquer erro (PostgREST, Auth, Storage, JS). */
export function mensagemDeErro(e: unknown): string {
  if (!e) return 'Erro desconhecido.'
  if (typeof e === 'string') return e
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = String((e as { message: unknown }).message)
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.'
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet.'
    if (/JWT expired/i.test(m)) return 'Sua sessão expirou. Entre novamente.'
    if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para esta ação.'
    if (/duplicate key/i.test(m)) return 'Registro duplicado.'
    return m
  }
  return String(e)
}

/** Lança o erro de uma resposta do supabase, devolvendo os dados tipados. */
export function exigir<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}
