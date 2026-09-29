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
    if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.'
    if (/rate limit|too many requests/i.test(m)) return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.'
    if (/Password should be at least/i.test(m)) return 'A senha deve ter pelo menos 6 caracteres.'
    if (/New password should be different/i.test(m)) return 'A nova senha deve ser diferente da atual.'
    if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para esta ação.'
    if (/duplicate key.*(nome|empresa_id)/i.test(m)) return 'Já existe um cadastro com esse nome.'
    if (/duplicate key|already exists/i.test(m)) return 'Esse registro já existe.'
    if (/foreign key/i.test(m)) return 'Não é possível concluir: há outros registros ligados a este.'
    if (/invalid input syntax/i.test(m)) return 'Algum campo tem um valor inválido. Confira datas, horas e números.'
    if (/violates check constraint/i.test(m)) return 'Algum campo tem um valor fora do permitido.'
    if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(m)) return 'Arquivo grande demais (limite de 15 MB).'
    if (/mime type .* is not supported|invalid mime/i.test(m)) return 'Tipo de arquivo não aceito. Envie imagens (JPG, PNG, WebP) ou PDF.'
    if (/timeout|timed out/i.test(m)) return 'O servidor demorou para responder. Tente de novo.'
    return m
  }
  return String(e)
}

/** Lança o erro de uma resposta do supabase, devolvendo os dados tipados. */
export function exigir<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}
