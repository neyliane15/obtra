/** Limpa o que costuma vir junto ao colar valores do painel do Supabase. */
function limpar(v: string | undefined): string {
  return (v ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim()
}

/**
 * Deixa só a origem do projeto: `https://abc.supabase.co`.
 * Aceita a URL com `/rest/v1/`, `/auth/v1`, barra final, aspas ou espaços.
 */
export function normalizarUrlSupabase(v: string | undefined): string | undefined {
  let u = limpar(v)
  if (!u) return undefined
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  u = u.replace(/\/+$/, '').replace(/\/(rest|auth|storage|functions|realtime)\/v\d+.*$/i, '').replace(/\/+$/, '')
  return u
}

export function normalizarChave(v: string | undefined): string | undefined {
  const c = limpar(v).replace(/\s+/g, '')
  return c || undefined
}
