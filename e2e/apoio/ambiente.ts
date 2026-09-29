/**
 * Endereços, contas da demonstração e acesso direto ao banco/arquivos do
 * ambiente local — usados para CONFERIR o que a interface fez (o que chegou
 * ao Storage, o que ficou no banco), nunca para pular a interface.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

export const RAIZ = fileURLToPath(new URL('../..', import.meta.url))

function lerEnvLocal(): Record<string, string> {
  const arq = join(RAIZ, '.env.local')
  if (!existsSync(arq)) return {}
  const saida: Record<string, string> = {}
  for (const linha of readFileSync(arq, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha)
    if (m) saida[m[1]!] = m[2]!
  }
  return saida
}
const env = lerEnvLocal()
export const API = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? ''

export const SENHA = 'obtra123'
export const USUARIOS = {
  master: 'master@obtra.app',
  admin: 'admin@construtoraaurora.com.br',
  engenheiro: 'engenheiro@construtoraaurora.com.br',
  mestre: 'mestre@construtoraaurora.com.br',
  cliente: 'cliente@exemplo.com',
  adminBeta: 'admin@betaengenharia.com.br',
} as const
export type Conta = keyof typeof USUARIOS

export const AURORA = '0b7a0000-0000-4000-8000-00000000a001'
export const BETA = '0b7a0000-0000-4000-8000-00000000b001'
export const OBRA_VISTA_AZUL = '0b7a0000-0000-4000-8000-0000000a0b01'
export const OBRA_PAULISTA = '0b7a0000-0000-4000-8000-0000000a0b02'
export const OBRA_BETA = '0b7a0000-0000-4000-8000-0000000b0b01'

/* ------------------------------------------------------------ banco -- */
let pool: pg.Pool | null = null
export function banco(): pg.Pool {
  pool ??= new pg.Pool({
    host: process.env.SOCK ?? '/home/pg/sock',
    user: 'postgres',
    database: process.env.BANCO ?? 'obtra_app',
    max: 2,
  })
  return pool
}

export async function sql<T = Record<string, unknown>>(texto: string, params: unknown[] = []): Promise<T[]> {
  const r = await banco().query(texto, params)
  return r.rows as T[]
}

export async function um<T = Record<string, unknown>>(texto: string, params: unknown[] = []): Promise<T> {
  const l = await sql<T>(texto, params)
  if (!l[0]) throw new Error(`consulta sem resultado: ${texto}`)
  return l[0]
}

/* ---------------------------------------------------------- storage -- */
export const PASTA_ARQUIVOS = join(RAIZ, '.local-storage')

export function arquivoNoDisco(caminho: string): string {
  return join(PASTA_ARQUIVOS, 'obtra', caminho)
}
export function existeNoStorage(caminho: string): boolean {
  return existsSync(arquivoNoDisco(caminho))
}
export function tamanhoNoStorage(caminho: string): number {
  return statSync(arquivoNoDisco(caminho)).size
}
export async function objetosSob(prefixo: string): Promise<{ name: string; size: number; mime: string }[]> {
  return sql(
    `select name, coalesce((metadata->>'size')::bigint, 0)::int as size, metadata->>'mimetype' as mime
       from storage.objects where bucket_id = 'obtra' and name like $1 order by name`,
    [`${prefixo}%`],
  )
}

/** Sufixo curto e único para nomes criados pelos testes. */
export function sufixo(): string {
  return `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1296).toString(36)}`
}
