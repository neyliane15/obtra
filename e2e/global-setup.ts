/**
 * Antes da suíte: garante o ambiente local no ar e, por padrão, recria banco
 * e arquivos (ferramentas/local/subir.sh) para cada execução partir da mesma
 * carga demo. E2E_SEM_RESET=1 reaproveita o que estiver rodando.
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, ANON } from './apoio/ambiente'

async function apiNoAr(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } })
    return r.status < 500
  } catch {
    return false
  }
}

export default async function globalSetup() {
  const raiz = fileURLToPath(new URL('..', import.meta.url))
  if (!process.env.E2E_SEM_RESET || !(await apiNoAr())) {
    execFileSync(resolve(raiz, 'ferramentas/local/subir.sh'), { stdio: 'inherit', cwd: raiz })
  }
  if (!(await apiNoAr())) throw new Error(`API local fora do ar em ${API}. Rode ferramentas/local/subir.sh.`)
}
