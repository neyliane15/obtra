import { test, expect, entrar } from './apoio/teste'
import { sql, um, OBRA_VISTA_AZUL, OBRA_PAULISTA, OBRA_BETA } from './apoio/ambiente'
import { lerPdf } from './apoio/arquivos'

test.describe('Portal do cliente @celular', () => {
  test('vê só as suas obras e só RDOs aprovados', async ({ page }) => {
    await entrar(page, 'cliente')
    const minhas = await sql<{ nome: string }>(
      "select o.nome from obra_clientes oc join obras o on o.id = oc.obra_id join perfis p on p.id = oc.cliente_id where p.email = 'cliente@exemplo.com'",
    )
    await expect(page.locator('a[href^="/portal/obras/"]')).toHaveCount(minhas.length)
    await expect(page.getByRole('heading', { name: 'Residencial Vista Azul' })).toBeVisible()
    await expect(page.getByText('Edifício Comercial Paulista')).toHaveCount(0)

    await page.getByRole('link', { name: /Residencial Vista Azul/ }).first().click()
    const rel = await sql<{ numero: number; status: string }>('select numero, status from relatorios where obra_id = $1 order by numero', [OBRA_VISTA_AZUL])
    const aprovados = rel.filter((r) => r.status === 'aprovado')
    expect(rel.length).toBeGreaterThan(aprovados.length) // há não aprovados para provar o filtro
    await expect(page.getByRole('tab', { name: /Linha do tempo/ })).toContainText(String(aprovados.length))
    const linha = page.locator('ol > li')
    await expect(linha).toHaveCount(aprovados.length)
    for (const r of rel) {
      const item = page.locator('ol > li').filter({ hasText: new RegExp(`^RD${r.numero}(?!\\d)`) })
      await expect(item).toHaveCount(r.status === 'aprovado' ? 1 : 0)
    }
  })

  test('não abre RDO não aprovado nem obra alheia por URL direta', async ({ page }) => {
    await entrar(page, 'cliente')
    const naoAprovado = await um<{ id: string }>("select id from relatorios where obra_id = $1 and status <> 'aprovado' limit 1", [OBRA_VISTA_AZUL])
    await page.goto(`/portal/relatorios/${naoAprovado.id}`)
    await expect(page.getByText('Relatório não encontrado')).toBeVisible()
    await page.goto(`/portal/obras/${OBRA_PAULISTA}`)
    await expect(page.getByText('Obra não encontrada')).toBeVisible()
    await page.goto(`/portal/obras/${OBRA_BETA}`)
    await expect(page.getByText('Obra não encontrada')).toBeVisible()
  })

  test('rotas internas redirecionam para o portal', async ({ page }) => {
    await entrar(page, 'cliente')
    const rdo = await um<{ id: string }>('select id from relatorios where obra_id = $1 limit 1', [OBRA_VISTA_AZUL])
    for (const rota of ['/painel', '/obras', `/obras/${OBRA_VISTA_AZUL}`, '/relatorios', `/relatorios/${rdo.id}`, '/relatorios/novo', '/historico', '/cadastros/funcoes', '/exportacao', '/usuarios', '/empresa', '/master', '/master/empresas', '/master/usuarios']) {
      await page.goto(rota)
      await expect(page, `rota ${rota}`).toHaveURL(/\/portal$/)
    }
  })

  test('fotos (lightbox), PDF do RDO e PDF do período só com aprovados', async ({ page }) => {
    await entrar(page, 'cliente')
    await page.goto(`/portal/obras/${OBRA_VISTA_AZUL}?aba=fotos`)
    const visiveis = await um<{ n: number }>(
      "select count(*)::int n from fotos f left join relatorios r on r.id = f.relatorio_id where f.obra_id = $1 and (f.relatorio_id is null or r.status = 'aprovado')",
      [OBRA_VISTA_AZUL],
    )
    const total = await um<{ n: number }>('select count(*)::int n from fotos where obra_id = $1', [OBRA_VISTA_AZUL])
    expect(total.n).toBeGreaterThan(visiveis.n)
    await expect(page.getByRole('button', { name: /Ampliar foto/ })).toHaveCount(visiveis.n)
    await page.getByRole('button', { name: /Ampliar foto/ }).first().click()
    const lb = page.getByRole('dialog', { name: 'Visualizador de fotos' })
    await expect(lb.getByText(/FOTO 01 \//)).toBeVisible()
    await expect.poll(() => lb.getByRole('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(400)
    await lb.getByRole('button', { name: 'Próxima foto' }).click()
    await expect(lb.getByText(/FOTO 02 \//)).toBeVisible()
    await page.keyboard.press('Escape')

    // PDF de um RDO aprovado, pela linha do tempo
    await page.getByRole('tab', { name: /Linha do tempo/ }).click()
    const primeiro = page.locator('ol > li').first()
    const [dl] = await Promise.all([page.waitForEvent('download'), primeiro.getByRole('button', { name: 'PDF' }).click()])
    const pdf = await lerPdf(await dl.path())
    expect(pdf.paginas).toBeGreaterThanOrEqual(1)
    expect(pdf.texto).toContain('Residencial Vista Azul')
    expect(pdf.texto).not.toContain('Notas de compras')

    // PDF do período: só aprovados, sem notas
    await page.getByRole('button', { name: 'PDF do período' }).click()
    const d = page.getByRole('dialog').last()
    await expect(d.getByText('Somente aprovados')).toHaveCount(0) // forçado para o cliente
    await d.getByRole('textbox', { name: 'De', exact: true }).fill('01/08/2026')
    const [dl2] = await Promise.all([page.waitForEvent('download'), d.getByRole('button', { name: 'Gerar PDF' }).click()])
    const per = await lerPdf(await dl2.path())
    const naoAprov = await sql<{ numero: number }>("select numero from relatorios where obra_id = $1 and status <> 'aprovado'", [OBRA_VISTA_AZUL])
    for (const r of naoAprov) expect(per.texto).not.toMatch(new RegExp(`RD-${r.numero}\\b`))
    expect(per.texto).toContain('RD-1')
    expect(per.texto).not.toContain('Notas de compras')
  })
})
