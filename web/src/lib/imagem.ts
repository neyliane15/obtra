/**
 * Compressão de imagens no navegador. O original NUNCA sobe: redesenhamos
 * num canvas (o que também descarta EXIF/GPS) e exportamos WebP. Se o
 * navegador não souber codificar WebP (Safari antigo), cai para JPEG.
 */

export const FOTO_LADO_MAIOR = 1600
export const FOTO_QUALIDADE = 0.72
export const MINI_LADO_MAIOR = 400
export const MINI_QUALIDADE = 0.6

export interface Dimensoes {
  largura: number
  altura: number
}

/** Reduz mantendo proporção para que o lado maior caiba em `ladoMaior`. Nunca amplia. */
export function calcularDimensoes(largura: number, altura: number, ladoMaior: number): Dimensoes {
  if (largura <= 0 || altura <= 0) return { largura: 0, altura: 0 }
  const maior = Math.max(largura, altura)
  if (maior <= ladoMaior) return { largura: Math.round(largura), altura: Math.round(altura) }
  const escala = ladoMaior / maior
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  }
}

/** Extensão de arquivo para o mime gerado. */
export function extensaoDoMime(mime: string): 'webp' | 'jpg' | 'png' {
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/png') return 'png'
  return 'jpg'
}

export interface ImagemComprimida {
  blob: Blob
  mime: string
  largura: number
  altura: number
}

type Fonte = ImageBitmap | HTMLImageElement

async function decodificar(arquivo: Blob): Promise<{ fonte: Fonte; largura: number; altura: number; liberar: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
      return { fonte: bmp, largura: bmp.width, altura: bmp.height, liberar: () => bmp.close() }
    } catch {
      /* cai para <img> */
    }
  }
  const url = URL.createObjectURL(arquivo)
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('Não foi possível ler esta imagem. Use JPG, PNG, WebP ou HEIC compatível.')
  }
  return { fonte: img, largura: img.naturalWidth, altura: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) }
}

function paraBlob(canvas: HTMLCanvasElement, mime: string, qualidade: number): Promise<Blob | null> {
  return new Promise((ok) => canvas.toBlob((b) => ok(b), mime, qualidade))
}

async function desenhar(fonte: Fonte, dim: Dimensoes, qualidade: number, fundoBranco: boolean): Promise<ImagemComprimida> {
  const canvas = document.createElement('canvas')
  canvas.width = dim.largura
  canvas.height = dim.altura
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível neste navegador.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (fundoBranco) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, dim.largura, dim.altura)
  }
  ctx.drawImage(fonte, 0, 0, dim.largura, dim.altura)
  let blob = await paraBlob(canvas, 'image/webp', qualidade)
  if (!blob || blob.type !== 'image/webp') {
    // sem WebP: JPEG não tem transparência, então pinta o fundo de branco
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, dim.largura, dim.altura)
    blob = await paraBlob(canvas, 'image/jpeg', qualidade)
  }
  canvas.width = canvas.height = 0
  if (!blob) throw new Error('Falha ao comprimir a imagem.')
  return { blob, mime: blob.type || 'image/jpeg', ...dim }
}

/** Gera a versão média e a miniatura de uma foto. */
export async function comprimirFoto(
  arquivo: Blob,
  opcoes: { lado?: number; qualidade?: number; ladoMini?: number; qualidadeMini?: number; fundoBranco?: boolean } = {},
): Promise<{ foto: ImagemComprimida; mini: ImagemComprimida }> {
  const { fonte, largura, altura, liberar } = await decodificar(arquivo)
  try {
    const fundo = opcoes.fundoBranco ?? false
    const foto = await desenhar(fonte, calcularDimensoes(largura, altura, opcoes.lado ?? FOTO_LADO_MAIOR), opcoes.qualidade ?? FOTO_QUALIDADE, fundo)
    const mini = await desenhar(fonte, calcularDimensoes(largura, altura, opcoes.ladoMini ?? MINI_LADO_MAIOR), opcoes.qualidadeMini ?? MINI_QUALIDADE, fundo)
    return { foto, mini }
  } finally {
    liberar()
  }
}

/** Uma única versão (ex.: logo). */
export async function comprimirImagem(arquivo: Blob, lado: number, qualidade: number): Promise<ImagemComprimida> {
  const { fonte, largura, altura, liberar } = await decodificar(arquivo)
  try {
    return await desenhar(fonte, calcularDimensoes(largura, altura, lado), qualidade, false)
  } finally {
    liberar()
  }
}

/**
 * Converte uma imagem (inclusive WebP) em JPEG data URL para o jsPDF, que
 * não lê WebP. `fundo` preenche transparências.
 */
export async function paraJpegDataUrl(blob: Blob, lado: number, qualidade = 0.82, fundo = '#ffffff'): Promise<{ dataUrl: string; largura: number; altura: number }> {
  const { fonte, largura, altura, liberar } = await decodificar(blob)
  try {
    const dim = calcularDimensoes(largura, altura, lado)
    const canvas = document.createElement('canvas')
    canvas.width = dim.largura
    canvas.height = dim.altura
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = fundo
    ctx.fillRect(0, 0, dim.largura, dim.altura)
    ctx.drawImage(fonte, 0, 0, dim.largura, dim.altura)
    const dataUrl = canvas.toDataURL('image/jpeg', qualidade)
    canvas.width = canvas.height = 0
    return { dataUrl, ...dim }
  } finally {
    liberar()
  }
}

export function ehImagem(arquivo: File): boolean {
  return arquivo.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(arquivo.name)
}
