export const LIMITE_PDF_BYTES = 15 * 1024 * 1024

export function ehPdf(arquivo: File): boolean {
  return arquivo.type === 'application/pdf' || /\.pdf$/i.test(arquivo.name)
}

/**
 * Regrava o PDF com object streams e sem metadados. Se o resultado não
 * ficar menor (PDF já otimizado, ou criptografado), mantém o original.
 * Falha se o arquivo final passar de 15 MB.
 */
export async function compactarPdf(arquivo: File): Promise<Blob> {
  const original = new Uint8Array(await arquivo.arrayBuffer())
  let saida: Blob = new Blob([original], { type: 'application/pdf' })
  try {
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(original, { updateMetadata: false, ignoreEncryption: false })
    doc.setTitle('')
    doc.setAuthor('')
    doc.setSubject('')
    doc.setKeywords([])
    doc.setCreator('')
    doc.setProducer('')
    const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false })
    if (bytes.byteLength < original.byteLength) {
      saida = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
    }
  } catch {
    /* PDF protegido ou fora do padrão: sobe como está, se couber */
  }
  if (saida.size > LIMITE_PDF_BYTES) {
    throw new Error(`"${arquivo.name}" tem ${(saida.size / 1048576).toFixed(1)} MB mesmo compactado. O limite é 15 MB.`)
  }
  return saida
}

/** Nome de arquivo seguro para exibição/baixa. */
export function nomeSemExtensao(nome: string): string {
  return nome.replace(/\.[^.]+$/, '')
}
