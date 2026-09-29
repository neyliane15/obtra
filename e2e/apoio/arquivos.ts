/**
 * Arquivos de teste gerados na hora (nada binário versionado) e leitores
 * para conferir o que o app produziu: dimensões de WebP, texto de PDF.
 */
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'

export interface ArquivoTeste {
  name: string
  mimeType: string
  buffer: Buffer
}

/**
 * "Foto" gerada num canvas do navegador: céu em degradê, prédios, janelas e
 * granulação de sensor — o bastante para o JPEG pesar como foto de celular.
 */
export async function fotoJpeg(page: Page, largura: number, altura: number, qualidade = 0.92, nome = 'foto.jpg'): Promise<ArquivoTeste> {
  const b64 = await page.evaluate(
    async ({ largura, altura, qualidade }) => {
      const c = document.createElement('canvas')
      c.width = largura
      c.height = altura
      const g = c.getContext('2d')!
      const ceu = g.createLinearGradient(0, 0, 0, altura)
      ceu.addColorStop(0, '#6aa7e8')
      ceu.addColorStop(0.6, '#d8e8f7')
      ceu.addColorStop(1, '#8a7a62')
      g.fillStyle = ceu
      g.fillRect(0, 0, largura, altura)
      let s = 7
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
      for (let i = 0; i < 40; i++) {
        const w = largura * (0.04 + rnd() * 0.12)
        const h = altura * (0.2 + rnd() * 0.6)
        const x = rnd() * largura
        const y = altura * 0.85 - h
        g.fillStyle = `hsl(${200 + rnd() * 40}, ${10 + rnd() * 20}%, ${30 + rnd() * 40}%)`
        g.fillRect(x, y, w, h)
        g.fillStyle = 'rgba(255,240,180,0.55)'
        for (let yy = y + 10; yy < y + h - 20; yy += altura / 60)
          for (let xx = x + 8; xx < x + w - 16; xx += largura / 90) g.fillRect(xx, yy, largura / 200, altura / 120)
      }
      const img = g.getImageData(0, 0, largura, altura)
      const d = img.data
      for (let i = 0; i < d.length; i += 4) {
        const n = (rnd() - 0.5) * 34
        d[i] = d[i]! + n
        d[i + 1] = d[i + 1]! + n
        d[i + 2] = d[i + 2]! + n
      }
      g.putImageData(img, 0, 0)
      const blob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', qualidade))
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(bin)
    },
    { largura, altura, qualidade },
  )
  return { name: nome, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') }
}

/** PNG pequeno (logo). */
export async function logoPng(page: Page, nome = 'logo.png'): Promise<ArquivoTeste> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 900
    c.height = 600
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 900, 600)
    g.fillStyle = '#0b1f3a'
    g.fillRect(100, 100, 700, 400)
    g.fillStyle = '#f29a2e'
    g.beginPath()
    g.arc(450, 300, 140, 0, Math.PI * 2)
    g.fill()
    const blob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), 'image/png'))
    const buf = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(bin)
  })
  return { name: nome, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') }
}

/**
 * PDF "gordo" como os que vêm de scanner/escritório: várias páginas, sem
 * object streams e com metadados — o app deve regravá-lo menor.
 */
export async function pdfGordo(nome = 'projeto-estrutural.pdf', paginas = 30): Promise<ArquivoTeste> {
  const doc = await PDFDocument.create()
  const fonte = await doc.embedFont(StandardFonts.Helvetica)
  doc.setTitle('Projeto estrutural — prancha geral')
  doc.setAuthor('Escritório de Engenharia Exemplo')
  doc.setSubject('Documento de teste do Obtra')
  doc.setKeywords(['obra', 'estrutura', 'teste'])
  doc.setProducer('Gerador de teste')
  doc.setCreator('Obtra e2e')
  for (let i = 0; i < paginas; i++) {
    const p = doc.addPage([595, 842])
    p.drawText(`Prancha ${i + 1} — memorial descritivo`, { x: 50, y: 790, size: 16, font: fonte })
    for (let l = 0; l < 40; l++) p.drawText(`Item ${l + 1}: armadura, concreto fck 30 MPa, cobrimento 3 cm, vão ${l * 0.5} m`, { x: 50, y: 760 - l * 18, size: 9, font: fonte })
  }
  const bytes = await doc.save({ useObjectStreams: false })
  return { name: nome, mimeType: 'application/pdf', buffer: Buffer.from(bytes) }
}

/** Largura/altura de um WebP (VP8, VP8L ou VP8X). */
export function dimensoesWebp(b: Buffer): { largura: number; altura: number; formato: string } {
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') throw new Error('não é WebP')
  const tipo = b.toString('ascii', 12, 16)
  if (tipo === 'VP8 ') {
    return { largura: b.readUInt16LE(26) & 0x3fff, altura: b.readUInt16LE(28) & 0x3fff, formato: tipo }
  }
  if (tipo === 'VP8L') {
    const v = b.readUInt32LE(21)
    return { largura: (v & 0x3fff) + 1, altura: ((v >> 14) & 0x3fff) + 1, formato: tipo }
  }
  if (tipo === 'VP8X') {
    return { largura: 1 + b.readUIntLE(24, 3), altura: 1 + b.readUIntLE(27, 3), formato: tipo }
  }
  throw new Error(`WebP desconhecido: ${tipo}`)
}

/** Páginas e texto de um PDF (pdfjs, o mesmo leitor do Firefox). */
export async function lerPdf(caminho: string): Promise<{ paginas: number; texto: string; bytes: number }> {
  const dados = new Uint8Array(readFileSync(caminho))
  const bytes = dados.byteLength
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: dados, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise
  let texto = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i)
    const c = await pg.getTextContent()
    texto += c.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n'
  }
  const paginas = doc.numPages
  await doc.destroy()
  return { paginas, texto: texto.replace(/\s+/g, ' '), bytes }
}
