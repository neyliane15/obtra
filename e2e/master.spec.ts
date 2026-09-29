import { test, expect, entrar, aviso, modal, confirmar, irPeloMenu, campo } from './apoio/teste'
import { sql, um, sufixo, objetosSob, existeNoStorage, AURORA, USUARIOS } from './apoio/ambiente'
import { fotoJpeg, logoPng } from './apoio/arquivos'

test.describe('Master', () => {
  test('cria empresa com limite e administrador, entra no contexto, edita e exclui (com os arquivos)', async ({ page, browser }) => {
    const s = sufixo()
    const nome = `Construtora Teste ${s}`
    const emailAdmin = `admin.${s}@teste.com.br`

    await entrar(page, 'master')
    await irPeloMenu(page, 'Empresas')
    await expect(page).toHaveURL(/\/master\/empresas$/)

    // ---- criar empresa + limite
    await page.getByRole('button', { name: 'Nova empresa' }).first().click()
    let d = modal(page)
    await expect(d.getByRole('heading', { name: 'Nova empresa' })).toBeVisible()
    await campo(d, 'Nome').fill(nome)
    await campo(d, 'CNPJ').fill('12.345.678/0001-90')
    await campo(d, 'Cidade').fill('Campinas')
    await campo(d, 'UF').selectOption('SP')
    await campo(d, 'Limite de armazenamento (MB)').fill('1024')
    await d.getByRole('button', { name: 'Criar empresa' }).click()
    await expect(aviso(page, 'Empresa criada')).toBeVisible()
    const empresa = await um<{ id: string; limite_armazenamento_mb: number }>('select id, limite_armazenamento_mb from empresas where nome = $1', [nome])
    expect(empresa.limite_armazenamento_mb).toBe(1024)

    // ---- administrador da empresa (o modal abre sozinho)
    d = modal(page)
    await expect(d.getByRole('heading', { name: 'Novo usuário' })).toBeVisible()
    await expect(d.getByRole('radio', { name: 'Administrador' })).toHaveAttribute('aria-checked', 'true')
    await campo(d, 'Nome completo').fill(`Admin ${s}`)
    await campo(d, 'E-mail').fill(emailAdmin)
    const senhaAdmin = await d.locator('#nu-senha').inputValue()
    expect(senhaAdmin.length).toBeGreaterThanOrEqual(6)
    await d.getByRole('button', { name: 'Criar acesso' }).click()
    await expect(d.getByRole('heading', { name: 'Acesso criado' })).toBeVisible()
    await expect(d.getByText(emailAdmin)).toBeVisible()
    await expect(d.getByText(senhaAdmin)).toBeVisible()
    await d.getByRole('button', { name: 'Concluir' }).click()

    // o admin criado entra de verdade
    const outro = await browser.newContext({ locale: 'pt-BR' })
    const p2 = await outro.newPage()
    await p2.goto('/entrar')
    await p2.locator('#email').fill(emailAdmin)
    await p2.locator('#senha').fill(senhaAdmin)
    await p2.getByRole('button', { name: 'Entrar' }).click()
    await expect(p2).toHaveURL(/\/painel$/)
    await expect(p2.locator('aside').getByText(nome)).toBeVisible()
    await outro.close()

    // ---- editar (limite) pela lista
    const linha = page.locator('li').filter({ hasText: nome })
    await expect(linha).toContainText('1 GB')
    await linha.getByRole('button', { name: `Mais ações para ${nome}` }).click()
    await page.getByRole('menuitem', { name: 'Editar e limites' }).click()
    d = modal(page)
    await campo(d, 'Limite de armazenamento (MB)').fill('512')
    await campo(d, 'Telefone').fill('(19) 3333-4444')
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(aviso(page, 'Empresa atualizada.')).toBeVisible()
    await expect(linha).toContainText('512 MB')
    expect((await um<{ l: number }>('select limite_armazenamento_mb l from empresas where id = $1', [empresa.id])).l).toBe(512)

    // ---- entrar no contexto da empresa
    await linha.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/painel$/)
    await expect(page.locator('aside').getByText(nome).first()).toBeVisible()
    await expect(page.getByLabel('Empresa em contexto')).toHaveValue(empresa.id)

    // arquivos da empresa: logo (Configurações) + obra com capa
    await page.locator('aside').getByRole('link', { name: 'Configurações' }).click()
    await expect(page.getByRole('heading', { name: 'Empresa', exact: true })).toBeVisible()
    await page.locator('input[type=file][accept="image/*"]').setInputFiles(await logoPng(page))
    await expect(aviso(page, 'Logo atualizada')).toBeVisible()

    await irPeloMenu(page, 'Obras')
    await page.getByRole('button', { name: 'Nova Obra' }).first().click()
    d = modal(page)
    await expect(campo(d, 'Empresa')).toHaveValue(empresa.id)
    await campo(d, 'Nome da obra').fill(`Obra da ${nome}`)
    await d.locator('input[type=file]').setInputFiles(await fotoJpeg(page, 1200, 800, 0.8, 'capa.jpg'))
    await d.getByRole('button', { name: 'Cadastrar obra' }).click()
    await expect(page).toHaveURL(/\/obras\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: `Obra da ${nome}` })).toBeVisible()
    const arquivos = await objetosSob(`${empresa.id}/`)
    expect(arquivos.map((a) => a.name.split('/').slice(-2, -1)[0]).sort()).toEqual(['capa', 'capa', 'logo'])
    for (const a of arquivos) expect(existeNoStorage(a.name)).toBe(true)

    // ---- todos os usuários (master)
    await irPeloMenu(page, 'Todos os usuários')
    await expect(page.getByRole('heading', { name: 'Todos os usuários' })).toBeVisible()
    // em contexto, a lista já abre filtrada pela empresa do contexto
    await expect(page.getByLabel('Filtrar por empresa')).toHaveValue(empresa.id)
    await expect(page.getByText(emailAdmin)).toBeVisible()
    await expect(page.getByText(USUARIOS.adminBeta)).toHaveCount(0)
    await page.getByLabel('Filtrar por empresa').selectOption('')
    for (const e of [emailAdmin, USUARIOS.admin, USUARIOS.adminBeta, USUARIOS.cliente, USUARIOS.engenheiro]) {
      await expect(page.getByText(e, { exact: false }).first()).toBeVisible()
    }
    await page.getByLabel('Filtrar por empresa').selectOption(AURORA)
    await expect(page.getByText(emailAdmin)).toHaveCount(0)
    await expect(page.getByText(USUARIOS.adminBeta)).toHaveCount(0)
    await expect(page.getByText(USUARIOS.mestre)).toBeVisible()

    // ---- excluir a empresa: banco, contas e arquivos
    await irPeloMenu(page, 'Empresas')
    const linha2 = page.locator('li').filter({ hasText: nome })
    await linha2.getByRole('button', { name: `Mais ações para ${nome}` }).click()
    await page.getByRole('menuitem', { name: 'Excluir empresa' }).click()
    d = modal(page)
    await expect(d.getByRole('button', { name: 'Excluir empresa' })).toBeDisabled()
    await confirmar(page, 'Excluir empresa', nome)
    await expect(aviso(page, 'Empresa excluída (3 arquivos removidos).')).toBeVisible()
    await expect(page.locator('li').filter({ hasText: nome })).toHaveCount(0)
    expect(await sql('select 1 from empresas where id = $1', [empresa.id])).toHaveLength(0)
    expect(await sql('select 1 from perfis where email = $1', [emailAdmin])).toHaveLength(0)
    expect(await sql('select 1 from auth.users where email = $1', [emailAdmin])).toHaveLength(0)
    expect(await objetosSob(`${empresa.id}/`)).toHaveLength(0)
    for (const a of arquivos) expect(existeNoStorage(a.name)).toBe(false)
  })
})
