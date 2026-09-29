import { test, expect, entrar, irPeloMenu, aviso } from './apoio/teste'
import { sql, um, AURORA, BETA, OBRA_VISTA_AZUL, OBRA_BETA, USUARIOS } from './apoio/ambiente'

test.describe('Isolamento entre empresas', () => {
  test('admin da Beta não vê nada da Aurora — nem por URL direta', async ({ page }) => {
    const obrasAurora = await sql<{ nome: string }>('select nome from obras where empresa_id = $1', [AURORA])
    const obrasBeta = await sql<{ nome: string }>('select nome from obras where empresa_id = $1', [BETA])
    const rdoAurora = await um<{ id: string }>('select id from relatorios where empresa_id = $1 limit 1', [AURORA])
    const rdoAuroraAprovado = await um<{ id: string }>("select id from relatorios where empresa_id = $1 and status = 'aprovado' limit 1", [AURORA])

    await entrar(page, 'adminBeta')
    await expect(page.locator('aside').getByText('Beta Engenharia').first()).toBeVisible()

    // painel e obras
    await irPeloMenu(page, 'Obras')
    await expect(page.getByText(`${obrasBeta.length} ${obrasBeta.length === 1 ? 'obra cadastrada' : 'obras cadastradas'}`)).toBeVisible()
    for (const o of obrasAurora) await expect(page.getByText(o.nome)).toHaveCount(0)

    // URL direta de obra e relatórios da Aurora
    await page.goto(`/obras/${OBRA_VISTA_AZUL}`)
    await expect(page.getByText('Obra não encontrada')).toBeVisible()
    await page.goto(`/relatorios/${rdoAurora.id}`)
    await expect(page.getByText('Relatório não encontrado')).toBeVisible()
    await page.goto(`/relatorios/${rdoAuroraAprovado.id}`)
    await expect(page.getByText('Relatório não encontrado')).toBeVisible()
    await page.goto(`/relatorios/novo?obra=${OBRA_VISTA_AZUL}`)
    await expect(page.getByLabel('Obra')).toHaveValue('') // a obra da Aurora nem está entre as opções
    await expect(page.getByLabel('Obra').locator('option')).toHaveCount(obrasBeta.length + 1)
    const antes = await um<{ n: number }>('select count(*)::int n from relatorios where obra_id = $1', [OBRA_VISTA_AZUL])
    await page.getByRole('button', { name: 'Salvar Rascunho', exact: true }).click()
    await expect(aviso(page, 'Escolha a obra do relatório.')).toBeVisible()
    expect((await um<{ n: number }>('select count(*)::int n from relatorios where obra_id = $1', [OBRA_VISTA_AZUL])).n).toBe(antes.n)

    // listas globais
    await irPeloMenu(page, 'Relatórios (RDO)')
    const nBeta = await um<{ n: number }>('select count(*)::int n from relatorios where empresa_id = $1', [BETA])
    await expect(page.getByText(new RegExp(`^${nBeta.n} de ${nBeta.n} relatórios`))).toBeVisible()
    for (const o of obrasAurora) await expect(page.locator('tbody').getByText(o.nome)).toHaveCount(0)

    await irPeloMenu(page, 'Histórico')
    for (const o of obrasAurora) await expect(page.getByText(o.nome, { exact: false })).toHaveCount(0)

    await irPeloMenu(page, 'Mão de Obra')
    const colabAurora = await sql<{ nome: string }>('select nome from colaboradores where empresa_id = $1 limit 5', [AURORA])
    for (const c of colabAurora) await expect(page.getByText(c.nome, { exact: true })).toHaveCount(0)

    await irPeloMenu(page, 'Usuários & Clientes')
    for (const e of [USUARIOS.admin, USUARIOS.engenheiro, USUARIOS.mestre]) await expect(page.getByText(e)).toHaveCount(0)
    await page.getByRole('tab', { name: 'Clientes' }).click()
    await expect(page.getByText(USUARIOS.cliente)).toHaveCount(0)

    await irPeloMenu(page, 'Relatórios & Exportação')
    for (const o of obrasAurora) await expect(page.getByLabel('Obra').locator('option', { hasText: o.nome })).toHaveCount(0)

    // área master
    await page.goto('/master/empresas')
    await expect(page).toHaveURL(/\/painel$/)
    await page.goto('/master/usuarios')
    await expect(page).toHaveURL(/\/painel$/)
  })

  test('admin da Aurora também não abre obra da Beta', async ({ page }) => {
    await entrar(page, 'admin')
    await page.goto(`/obras/${OBRA_BETA}`)
    await expect(page.getByText('Obra não encontrada')).toBeVisible()
    const rdoBeta = await um<{ id: string }>('select id from relatorios where empresa_id = $1 limit 1', [BETA])
    await page.goto(`/relatorios/${rdoBeta.id}`)
    await expect(page.getByText('Relatório não encontrado')).toBeVisible()
  })
})
