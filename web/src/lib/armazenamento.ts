import { useQueries, useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { BUCKET, type Documento, type Foto } from '@/tipos/banco'
import { comprimirFoto, extensaoDoMime } from './imagem'
import { compactarPdf } from './pdf-compactar'

const VALIDADE_S = 3600
/** Guardamos a URL por 50 min: a assinatura vale 60. */
const FRESCOR_MS = 50 * 60 * 1000

/* ---------------------------------------------------------------------------
   URLs assinadas em lote: cada componente pede a sua, e as pedidas no mesmo
   "tique" viram UMA chamada createSignedUrls. O react-query guarda o cache.
   --------------------------------------------------------------------------- */
type Pendente = { resolver: (u: string | null) => void; rejeitar: (e: unknown) => void }
let fila = new Map<string, Pendente[]>()
let agendado = false

async function despachar() {
  agendado = false
  const lote = fila
  fila = new Map()
  const caminhos = [...lote.keys()]
  for (let i = 0; i < caminhos.length; i += 100) {
    const parte = caminhos.slice(i, i + 100)
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(parte, VALIDADE_S)
      if (error) throw error
      const mapa = new Map<string, string | null>()
      for (const item of data ?? []) {
        if (item.path) mapa.set(item.path, item.error ? null : item.signedUrl)
      }
      for (const c of parte) for (const p of lote.get(c) ?? []) p.resolver(mapa.get(c) ?? null)
    } catch (e) {
      for (const c of parte) for (const p of lote.get(c) ?? []) p.rejeitar(e)
    }
  }
}

export function urlAssinada(caminho: string): Promise<string | null> {
  return new Promise((resolver, rejeitar) => {
    const lista = fila.get(caminho) ?? []
    lista.push({ resolver, rejeitar })
    fila.set(caminho, lista)
    if (!agendado) {
      agendado = true
      setTimeout(despachar, 0)
    }
  })
}

export function useUrlAssinada(caminho: string | null | undefined) {
  return useQuery({
    queryKey: ['url-assinada', caminho],
    queryFn: () => urlAssinada(caminho!),
    enabled: !!caminho,
    staleTime: FRESCOR_MS,
    gcTime: FRESCOR_MS,
    retry: 1,
  })
}

export function useUrlsAssinadas(caminhos: (string | null | undefined)[]) {
  return useQueries({
    queries: caminhos.map((c) => ({
      queryKey: ['url-assinada', c],
      queryFn: () => urlAssinada(c!),
      enabled: !!c,
      staleTime: FRESCOR_MS,
      gcTime: FRESCOR_MS,
    })),
  })
}

/** Baixa um objeto do bucket como Blob (para PDF). */
export async function baixarBlob(caminho: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho)
  if (error) return null
  return data
}

/* ---------------------------------------------------------------------------
   Envio
   --------------------------------------------------------------------------- */
function novoId(): string {
  return crypto.randomUUID()
}

export const MENSAGEM_COTA = 'Limite de armazenamento da empresa atingido'

/** Espaço da empresa (null quando o usuário não enxerga a linha — o servidor decide). */
async function espacoDaEmpresa(empresaId: string): Promise<{ usado: number; limite: number } | null> {
  const { data } = await supabase.from('empresas').select('armazenamento_usado_bytes, limite_armazenamento_mb').eq('id', empresaId).maybeSingle()
  if (!data) return null
  const d = data as { armazenamento_usado_bytes: number | string; limite_armazenamento_mb: number }
  return { usado: Number(d.armazenamento_usado_bytes) || 0, limite: d.limite_armazenamento_mb * 1024 * 1024 }
}

/** O Storage ainda aceita arquivos desta empresa? (mesma regra da política do bucket) */
async function bucketTemEspaco(caminho: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('storage_tem_espaco', { p_nome: caminho })
  return error ? true : data !== false
}

/**
 * Confere a cota ANTES de enviar. O banco é quem tranca (política do bucket e
 * gatilho da cota), mas o Storage recusa com um genérico "row-level security"
 * — sem esta conferência o usuário leria "sem permissão" em vez de "limite
 * atingido", e ainda gastaria o envio à toa.
 */
export async function garantirEspaco(empresaId: string, bytesNovos: number) {
  const e = await espacoDaEmpresa(empresaId)
  if (e && e.usado + bytesNovos > e.limite) throw new Error(MENSAGEM_COTA)
  if (!(await bucketTemEspaco(`${empresaId}/`))) throw new Error(MENSAGEM_COTA)
}

async function subir(caminho: string, blob: Blob, mime: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, blob, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: false,
  })
  if (!error) return
  // Recusa da política do bucket: se o motivo for a cota (alguém encheu o
  // espaço no meio do caminho), diga isso com todas as letras.
  if (/row-level security|unauthorized/i.test(error.message) && !(await bucketTemEspaco(caminho))) {
    throw new Error(MENSAGEM_COTA)
  }
  throw error
}

export async function removerArquivos(caminhos: (string | null | undefined)[]) {
  const validos = caminhos.filter((c): c is string => !!c)
  for (let i = 0; i < validos.length; i += 100) {
    await supabase.storage.from(BUCKET).remove(validos.slice(i, i + 100))
  }
}

export interface EnvioFoto {
  empresaId: string
  obraId: string
  relatorioId?: string | null
  legenda?: string | null
}

/** Comprime, sobe foto + miniatura e grava a linha em `fotos`. */
export async function enviarFoto(arquivo: File, destino: EnvioFoto): Promise<Foto> {
  const { foto, mini } = await comprimirFoto(arquivo)
  await garantirEspaco(destino.empresaId, foto.blob.size + mini.blob.size)
  const id = novoId()
  const base = `${destino.empresaId}/${destino.obraId}/fotos/${id}`
  const path = `${base}.${extensaoDoMime(foto.mime)}`
  const thumb = `${base}_t.${extensaoDoMime(mini.mime)}`
  await subir(path, foto.blob, foto.mime)
  try {
    await subir(thumb, mini.blob, mini.mime)
    const { data, error } = await supabase
      .from('fotos')
      .insert({
        obra_id: destino.obraId,
        relatorio_id: destino.relatorioId ?? null,
        path,
        thumb_path: thumb,
        legenda: destino.legenda ?? null,
        largura: foto.largura,
        altura: foto.altura,
        bytes: foto.blob.size + mini.blob.size,
      })
      .select('*')
      .single()
    if (error) throw error
    return data as Foto
  } catch (e) {
    await removerArquivos([path, thumb])
    throw e
  }
}

export async function excluirFoto(foto: Pick<Foto, 'id' | 'path' | 'thumb_path'>) {
  const { error } = await supabase.from('fotos').delete().eq('id', foto.id)
  if (error) throw error
  await removerArquivos([foto.path, foto.thumb_path])
}

/** Capa da obra ou logo: versão média + miniatura. */
export async function enviarCapa(arquivo: File, empresaId: string, obraId: string) {
  const { foto, mini } = await comprimirFoto(arquivo)
  // capa não entra na soma de fotos/documentos, mas ocupa o bucket
  if (!(await bucketTemEspaco(`${empresaId}/`))) throw new Error(MENSAGEM_COTA)
  const id = novoId()
  const base = `${empresaId}/${obraId}/capa/${id}`
  const capa_path = `${base}.${extensaoDoMime(foto.mime)}`
  const capa_thumb_path = `${base}_t.${extensaoDoMime(mini.mime)}`
  await subir(capa_path, foto.blob, foto.mime)
  await subir(capa_thumb_path, mini.blob, mini.mime)
  return { capa_path, capa_thumb_path }
}

export async function enviarLogo(arquivo: File, empresaId: string) {
  const { comprimirImagem } = await import('./imagem')
  const img = await comprimirImagem(arquivo, 512, 0.85)
  if (!(await bucketTemEspaco(`${empresaId}/`))) throw new Error(MENSAGEM_COTA)
  const caminho = `${empresaId}/logo/${novoId()}.${extensaoDoMime(img.mime)}`
  await subir(caminho, img.blob, img.mime)
  return caminho
}

export async function enviarDocumento(arquivo: File, empresaId: string, obraId: string, visivelCliente: boolean): Promise<Documento> {
  const blob = await compactarPdf(arquivo)
  await garantirEspaco(empresaId, blob.size)
  const path = `${empresaId}/${obraId}/docs/${novoId()}.pdf`
  await subir(path, blob, 'application/pdf')
  const { data, error } = await supabase
    .from('documentos')
    .insert({
      obra_id: obraId,
      nome: arquivo.name,
      path,
      bytes: blob.size,
      mime: 'application/pdf',
      visivel_cliente: visivelCliente,
    })
    .select('*')
    .single()
  if (error) {
    await removerArquivos([path])
    throw error
  }
  return data as Documento
}

export async function excluirDocumento(doc: Pick<Documento, 'id' | 'path'>) {
  const { error } = await supabase.from('documentos').delete().eq('id', doc.id)
  if (error) throw error
  await removerArquivos([doc.path])
}

/** Lista recursivamente todos os objetos sob um prefixo ("pasta"). */
export async function listarRecursivo(prefixo: string): Promise<string[]> {
  const saida: string[] = []
  const pilha = [prefixo.replace(/\/+$/, '')]
  while (pilha.length) {
    const pasta = pilha.pop()!
    let offset = 0
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET).list(pasta, { limit: 1000, offset })
      if (error) throw error
      const itens = data ?? []
      for (const item of itens) {
        const caminho = `${pasta}/${item.name}`
        // pastas vêm sem id (e sem metadata)
        if (item.id === null || item.id === undefined) pilha.push(caminho)
        else saida.push(caminho)
      }
      if (itens.length < 1000) break
      offset += 1000
    }
  }
  return saida
}

/** Apaga tudo sob o prefixo. Devolve quantos arquivos foram removidos. */
export async function removerPasta(prefixo: string): Promise<number> {
  const arquivos = await listarRecursivo(prefixo)
  await removerArquivos(arquivos)
  return arquivos.length
}

/** Abre um PDF do bucket numa aba nova (ou baixa, em navegadores que bloqueiam). */
export async function abrirDocumento(caminho: string, nome: string) {
  const url = await urlAssinada(caminho)
  if (!url) throw new Error('Arquivo não encontrado.')
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener'
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
}
