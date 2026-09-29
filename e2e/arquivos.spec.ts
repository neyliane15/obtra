import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { test, expect, entrar, aviso, confirmar } from './apoio/teste'
import { sql, um, objetosSob, existeNoStorage, arquivoNoDisco, tamanhoNoStorage, BETA, OBRA_BETA, OBRA_PAULISTA, OBRA_VISTA_AZUL, AURORA, API, ANON } from './apoio/ambiente'
import { fotoJpeg, pdfGordo, dimensoesWebp } from './apoio/arquivos'

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
const mb = (n: number) => `${(n / 1048576).toFixed(2)} MB`

test.describe('Fotos e documentos', () => {
  test('foto grande (4000×3000, JPEG de vários MB) chega ao Storage como WebP ≤ 1600 px, com miniatura; lightbox; exclusão limpa', async ({ page }) => {
    test.setTimeout(120_000)
    await entrar(page, 'engenheiro')
    // JPEG de "celular": 4000×3000 entre 3 e 5 MB
    let original = await fotoJpeg(page, 4000, 3000, 0.9, 'IMG_20260929_101500.jpg')
    for (const q of [0.95, 0.85, 0.8, 0.75]) {
      if (original.buffer.length >= 3 * 1048576 && original.buffer.length <= 5 * 1048576) break
      original = await fotoJpeg(page, 4000, 3000, q, 'IMG_20260929_101500.jpg')
    }
    expect(original.buffer.length).toBeGreaterThanOrEqual(3 * 1048576)
    expect(original.buffer.length).toBeLessThanOrEqual(5 * 1048576)

    await page.goto(`/obras/${OBRA_PAULISTA}?aba=fotos`)
    const antes = new Set((await sql<{ id: string }>('select id from fotos where obra_id = $1', [OBRA_PAULISTA])).map((f) => f.id))
    const uploads: { url: string; bytes: number; tipo: string }[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/storage/v1/object/obtra/')) {
        uploads.push({ url: r.url(), bytes: r.postDataBuffer()?.length ?? 0, tipo: r.headers()['content-type'] ?? '' })
      }
    })
    await page.locator('input[type=file][multiple]').setInputFiles(original)
    await expect(page.getByText('1 foto enviada')).toBeVisible({ timeout: 30_000 })

    const nova = (await sql<{ id: string; path: string; thumb_path: string; bytes: string; largura: number; altura: number }>(
      'select id, path, thumb_path, bytes::text, largura, altura from fotos where obra_id = $1 order by criado_em desc',
      [OBRA_PAULISTA],
    )).find((f) => !antes.has(f.id))!
    expect(nova).toBeTruthy()
    // o original nunca sobe: só dois envios (média + miniatura), ambos WebP e pequenos
    expect(uploads).toHaveLength(2)
    for (const u of uploads) expect(u.bytes).toBeLessThan(original.buffer.length / 5)
    expect(nova.path).toMatch(/\/fotos\/[0-9a-f-]{36}\.webp$/)
    expect(nova.thumb_path).toMatch(/\/fotos\/[0-9a-f-]{36}_t\.webp$/)
    const media = readFileSync(arquivoNoDisco(nova.path))
    const mini = readFileSync(arquivoNoDisco(nova.thumb_path))
    const dm = dimensoesWebp(media)
    const dt = dimensoesWebp(mini)
    expect(Math.max(dm.largura, dm.altura)).toBeLessThanOrEqual(1600)
    expect(dm).toMatchObject({ largura: 1600, altura: 1200 })
    expect(Math.max(dt.largura, dt.altura)).toBeLessThanOrEqual(400)
    expect(nova.largura).toBe(1600)
    expect(nova.altura).toBe(1200)
    expect(Number(nova.bytes)).toBe(media.length + mini.length)
    const objs = await objetosSob(nova.path.replace(/\.webp$/, ''))
    expect(objs.map((o) => o.mime)).toEqual(['image/webp', 'image/webp'])
    expect(media.length).toBeLessThan(original.buffer.length * 0.2)
    const reducao = (1 - (media.length + mini.length) / original.buffer.length) * 100
    test.info().annotations.push({
      type: 'compressao-foto',
      description: `original JPEG 4000×3000 = ${mb(original.buffer.length)} → WebP ${dm.largura}×${dm.altura} = ${kb(media.length)} + miniatura ${dt.largura}×${dt.altura} = ${kb(mini.length)} (redução de ${reducao.toFixed(1)}%)`,
    })
    console.log(`[compressão] ${test.info().annotations.at(-1)!.description}`)

    // a grade usa a miniatura; o lightbox, a média
    const botao = page.getByRole('button', { name: /Ampliar foto/ }).first()
    await expect(botao.locator('img')).toHaveAttribute('src', new RegExp(nova.thumb_path.split('/').pop()!.replace('.', '\\.')))
    await botao.click()
    const lb = page.getByRole('dialog', { name: 'Visualizador de fotos' })
    await expect(lb.getByRole('img')).toHaveAttribute('src', new RegExp(nova.path.split('/').pop()!.replace('.', '\\.')))
    await expect.poll(() => lb.getByRole('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600)
    await lb.getByRole('button', { name: 'Fechar' }).click()
    await expect(lb).toHaveCount(0)

    // excluir: linha e arquivos
    await page.getByRole('button', { name: 'Excluir foto' }).first().click()
    await confirmar(page, 'Excluir')
    await expect(aviso(page, 'Foto excluída.')).toBeVisible()
    expect(await sql('select 1 from fotos where id = $1', [nova.id])).toHaveLength(0)
    expect(existeNoStorage(nova.path) || existeNoStorage(nova.thumb_path)).toBe(false)
  })

  test('PDF anexado é recompactado; cliente vê só os documentos liberados', async ({ page, browser }) => {
    await entrar(page, 'admin')
    await page.goto(`/obras/${OBRA_VISTA_AZUL}?aba=documentos`)
    const gordo = await pdfGordo('Projeto estrutural.pdf', 30)
    // visível ao cliente
    await page.getByRole('switch').click()
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await page.locator('input[type=file][accept*="pdf"]').setInputFiles(gordo)
    await expect(aviso(page, '1 documento enviado (compactados antes do envio).')).toBeVisible()
    const doc = await um<{ id: string; path: string; bytes: string; visivel_cliente: boolean }>(
      "select id, path, bytes::text, visivel_cliente from documentos where obra_id = $1 and nome = 'Projeto estrutural.pdf'",
      [OBRA_VISTA_AZUL],
    )
    expect(doc.visivel_cliente).toBe(true)
    const guardado = tamanhoNoStorage(doc.path)
    expect(Number(doc.bytes)).toBe(guardado)
    expect(guardado).toBeLessThan(gordo.buffer.length)
    const lido = await PDFDocument.load(readFileSync(arquivoNoDisco(doc.path)), { updateMetadata: false })
    expect(lido.getPageCount()).toBe(30)
    expect(lido.getTitle() ?? '').toBe('')
    expect(lido.getAuthor() ?? '').toBe('')
    test.info().annotations.push({
      type: 'compressao-pdf',
      description: `PDF de 30 páginas ${kb(gordo.buffer.length)} → ${kb(guardado)} (redução de ${((1 - guardado / gordo.buffer.length) * 100).toFixed(1)}%), metadados removidos`,
    })
    console.log(`[compressão] ${test.info().annotations.at(-1)!.description}`)
    await expect(page.getByRole('listitem').filter({ hasText: 'Projeto estrutural.pdf' })).toContainText('Cliente vê')

    // interno (não visível)
    await page.getByRole('switch').click()
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await page.locator('input[type=file][accept*="pdf"]').setInputFiles(await pdfGordo('Orçamento interno.pdf', 3))
    await expect(aviso(page, '1 documento enviado')).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Orçamento interno.pdf' })).toContainText('Interno')

    // arquivo que não é PDF é recusado com aviso
    await page.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'planilha.xlsx', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') })
    await expect(aviso(page, 'Somente arquivos PDF são aceitos.')).toBeVisible()

    // cliente: só o liberado, e abre
    const ctx = await browser.newContext({ locale: 'pt-BR' })
    const c = await ctx.newPage()
    await c.goto('/entrar')
    await c.locator('#email').fill('cliente@exemplo.com')
    await c.locator('#senha').fill('obtra123')
    await c.getByRole('button', { name: 'Entrar' }).click()
    await expect(c).toHaveURL(/\/portal$/)
    await c.goto(`/portal/obras/${OBRA_VISTA_AZUL}?aba=documentos`)
    await expect(c.getByRole('button', { name: 'Abrir Projeto estrutural.pdf' })).toBeVisible()
    await expect(c.getByText('Orçamento interno.pdf')).toHaveCount(0)
    await expect(c.getByRole('button', { name: 'Anexar PDF' })).toHaveCount(0)
    const [aba] = await Promise.all([c.waitForEvent('popup'), c.getByRole('button', { name: 'Abrir Projeto estrutural.pdf' }).click()])
    expect(aba.url()).toContain(doc.path.split('/').pop()!)
    await ctx.close()

    // excluir documento remove o arquivo
    const linha = page.getByRole('listitem').filter({ hasText: 'Orçamento interno.pdf' })
    const interno = await um<{ path: string }>("select path from documentos where nome = 'Orçamento interno.pdf' and obra_id = $1", [OBRA_VISTA_AZUL])
    await linha.getByRole('button', { name: 'Excluir documento' }).click()
    await confirmar(page, 'Excluir')
    await expect(aviso(page, 'Documento excluído.')).toBeVisible()
    expect(existeNoStorage(interno.path)).toBe(false)
  })

  test.describe('cota de armazenamento', () => {
    let limiteOriginal = 0
    test.beforeAll(async () => {
      limiteOriginal = (await um<{ l: number }>('select limite_armazenamento_mb l from empresas where id = $1', [BETA])).l
    })
    test.afterAll(async () => {
      await sql('update empresas set limite_armazenamento_mb = $2 where id = $1', [BETA, limiteOriginal])
    })

    test('empresa sem espaço: foto, documento e capa recusados com mensagem clara, sem sobrar arquivo', async ({ page, vigia }) => {
      vigia.permitir(/^(400|403|413) POST .*\/storage\/v1\/object\/obtra\//, /^4\d\d POST .*\/rest\/v1\/(fotos|documentos)/)
      await sql('update empresas set limite_armazenamento_mb = 0 where id = $1', [BETA])
      const objetosAntes = (await objetosSob(`${BETA}/`)).length
      await entrar(page, 'adminBeta')
      await page.goto(`/obras/${OBRA_BETA}?aba=fotos`)
      await page.locator('input[type=file][multiple]').setInputFiles(await fotoJpeg(page, 1200, 900, 0.8, 'x.jpg'))
      await expect(aviso(page, 'Limite de armazenamento da empresa atingido')).toBeVisible()
      await expect(page.getByText('1 falha')).toBeVisible()

      await page.getByRole('tab', { name: /Documentos/ }).click()
      await page.locator('input[type=file][accept*="pdf"]').setInputFiles(await pdfGordo('ART.pdf', 2))
      await expect(aviso(page, 'Limite de armazenamento da empresa atingido')).toBeVisible()
      expect(await sql("select 1 from documentos where nome = 'ART.pdf'")).toHaveLength(0)

      // capa da obra (não conta em fotos/documentos, mas ocupa o bucket)
      await page.getByRole('button', { name: 'Editar' }).first().click()
      const d = page.getByRole('dialog').last()
      await d.locator('input[type=file]').setInputFiles(await fotoJpeg(page, 1200, 800, 0.8, 'capa.jpg'))
      await d.getByRole('button', { name: 'Salvar alterações' }).click()
      await expect(aviso(page, 'Limite de armazenamento da empresa atingido')).toBeVisible()
      expect((await objetosSob(`${BETA}/`)).length).toBe(objetosAntes)
    })

    test('empresa quase no limite: o envio que estouraria é recusado com mensagem clara', async ({ page, vigia }) => {
      vigia.permitir(/^(400|403|413) POST .*\/storage\/v1\/object\/obtra\//, /^4\d\d POST .*\/rest\/v1\/(fotos|documentos)/)
      // 1 MB de limite; a Beta já usa ~100 KB da demo. Dez fotos cheias de detalhe (~150 KB cada em WebP) passam de 1 MB.
      await sql('update empresas set limite_armazenamento_mb = 1 where id = $1', [BETA])
      const objetosAntes = (await objetosSob(`${BETA}/`)).length
      await entrar(page, 'adminBeta')
      await page.goto(`/obras/${OBRA_BETA}?aba=fotos`)
      const fotos = []
      for (let i = 0; i < 10; i++) fotos.push(await fotoJpeg(page, 1600, 1200, 0.95, `lote-${i}.jpg`))
      await page.locator('input[type=file][multiple]').setInputFiles(fotos)
      await expect(aviso(page, 'Limite de armazenamento da empresa atingido')).toBeVisible({ timeout: 30_000 })
      const e = await um<{ usado: string; limite: string }>('select armazenamento_usado_bytes::text usado, (limite_armazenamento_mb::bigint*1048576)::text limite from empresas where id = $1', [BETA])
      expect(Number(e.usado)).toBeLessThanOrEqual(Number(e.limite))
      // o que ficou no bucket é exatamente o que está registrado (nada órfão)
      const registrados = await sql<{ n: number }>('select count(*)::int * 2 n from fotos where empresa_id = $1', [BETA])
      const logo = (await objetosSob(`${BETA}/logo/`)).length
      const capas = (await objetosSob(`${BETA}/`)).filter((o) => o.name.includes('/capa/')).length
      expect((await objetosSob(`${BETA}/`)).length).toBe(registrados[0]!.n + logo + capas)
      expect((await objetosSob(`${BETA}/`)).length).toBeGreaterThanOrEqual(objetosAntes)
    })
  })

  test('isolamento no Storage: admin da Beta não assina URL de arquivo da Aurora', async ({ page }) => {
    await entrar(page, 'adminBeta')
    const alvo = await um<{ path: string }>('select path from fotos where empresa_id = $1 limit 1', [AURORA])
    const r = await page.evaluate(async ({ caminho, api, anon }) => {
      const chave = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))!
      const token = JSON.parse(localStorage.getItem(chave)!).access_token as string
      const resp = await fetch(`${api}/storage/v1/object/sign/obtra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anon },
        body: JSON.stringify({ paths: [caminho], expiresIn: 60 }),
      })
      return { status: resp.status, corpo: await resp.json() }
    }, { caminho: alvo.path, api: API, anon: ANON })
    expect(r.status).toBe(200)
    expect(r.corpo[0].signedURL ?? null).toBeNull()
    expect(r.corpo[0].error).toBeTruthy()
  })
})
