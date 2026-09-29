import { test, expect, entrar, aviso, modal, confirmar, irPeloMenu, campo, sair } from './apoio/teste'
import { sql, um, sufixo, objetosSob, existeNoStorage, AURORA, OBRA_VISTA_AZUL, OBRA_PAULISTA } from './apoio/ambiente'
import { fotoJpeg, logoPng } from './apoio/arquivos'
import type { Browser } from '@playwright/test'

async function tentarEntrar(browser: Browser, email: string, senha: string) {
  const ctx = await browser.newContext({ locale: 'pt-BR' })
  const p = await ctx.newPage()
  await p.goto('/entrar')
  await p.locator('#email').fill(email)
  await p.locator('#senha').fill(senha)
  await p.getByRole('button', { name: 'Entrar' }).click()
  return { ctx, p }
}

test.describe('Administrador', () => {
  test('CRUD de obra com capa; excluir apaga banco e arquivos', async ({ page }) => {
    const s = sufixo()
    const nome = `Obra Teste ${s}`
    await entrar(page, 'admin')
    await irPeloMenu(page, 'Obras')
    await expect(page.getByRole('heading', { name: 'Obras' })).toBeVisible()
    const antes = Number((await page.getByText(/obras? cadastradas?/).textContent())!.match(/\d+/)![0])

    // criar
    await page.getByRole('button', { name: 'Nova Obra' }).first().click()
    let d = modal(page)
    await d.locator('input[type=file]').setInputFiles(await fotoJpeg(page, 2400, 1600, 0.9, 'capa.jpg'))
    await expect(d.getByAltText('Prévia da capa')).toBeVisible()
    await campo(d, 'Nome da obra').fill(nome)
    await campo(d, 'Código').fill(`OB-${s}`)
    await campo(d, 'Contratante').fill('Contratante Teste Ltda')
    await campo(d, 'Responsável técnico').fill('Eng. Teste — CREA 123')
    await campo(d, 'Cidade').fill('Sorocaba')
    await campo(d, 'UF').selectOption('SP')
    await campo(d, 'Início').fill('01/09/2026')
    await campo(d, 'Prazo (dias)').fill('120')
    await expect(d.getByText('Calculada: 30/12/2026')).toBeVisible()
    await d.getByRole('button', { name: 'Cadastrar obra' }).click()
    await expect(aviso(page, 'Obra cadastrada.')).toBeVisible()
    await expect(page).toHaveURL(/\/obras\/[0-9a-f-]{36}$/)
    const id = page.url().split('/').pop()!
    await expect(page.getByRole('heading', { name: nome })).toBeVisible()
    await expect(page.getByAltText(`Capa da obra ${nome}`)).toBeVisible()
    const obra = await um<{ capa_path: string; capa_thumb_path: string; previsao_termino: string; prazo_dias: number }>(
      "select capa_path, capa_thumb_path, to_char(previsao_termino, 'YYYY-MM-DD') previsao_termino, prazo_dias from obras where id = $1",
      [id],
    )
    expect(obra.prazo_dias).toBe(120)
    expect(obra.previsao_termino).toBe('2026-12-30')
    expect(obra.capa_path).toMatch(new RegExp(`^${AURORA}/${id}/capa/.+\\.webp$`))
    expect(existeNoStorage(obra.capa_path) && existeNoStorage(obra.capa_thumb_path)).toBe(true)

    // uma foto na obra, para a exclusão ter o que apagar
    await page.getByRole('tab', { name: /Fotos/ }).click()
    await page.locator('input[type=file][multiple]').setInputFiles(await fotoJpeg(page, 1000, 750, 0.85, 'f.jpg'))
    await expect(page.getByText('1 foto enviada')).toBeVisible()

    // lista (tabela)
    await irPeloMenu(page, 'Obras')
    await expect(page.getByText(`${antes + 1} obras cadastradas`)).toBeVisible()
    const linha = page.locator('tr').filter({ hasText: nome })
    await expect(linha).toContainText('Contratante Teste Ltda')
    await expect(linha).toContainText('Sorocaba - SP')
    await expect(linha).toContainText('120d')
    await page.getByPlaceholder('Buscar obra, contratante ou responsável…').fill('Contratante Teste')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await page.getByPlaceholder('Buscar obra, contratante ou responsável…').fill('')

    // editar: status e troca de capa (a antiga some do Storage)
    await linha.getByRole('button', { name: `Editar ${nome}` }).click()
    d = modal(page)
    await expect(d.getByRole('heading', { name: 'Editar obra' })).toBeVisible()
    await campo(d, 'Status').selectOption('paralisada')
    await d.locator('input[type=file]').setInputFiles(await fotoJpeg(page, 1600, 900, 0.9, 'capa2.jpg'))
    await d.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(aviso(page, 'Obra atualizada.')).toBeVisible()
    await expect(linha).toContainText('Paralisada')
    const obra2 = await um<{ capa_path: string }>('select capa_path from obras where id = $1', [id])
    expect(obra2.capa_path).not.toBe(obra.capa_path)
    expect(existeNoStorage(obra.capa_path)).toBe(false)
    expect(existeNoStorage(obra.capa_thumb_path)).toBe(false)

    // excluir: linha, relatórios/fotos em cascata e TODOS os arquivos da pasta
    expect((await objetosSob(`${AURORA}/${id}/`)).length).toBe(4) // capa+mini, foto+mini
    await linha.getByRole('button', { name: `Excluir ${nome}` }).click()
    await confirmar(page, 'Excluir obra', 'EXCLUIR')
    await expect(aviso(page, 'Obra excluída.')).toBeVisible()
    await expect(page.locator('tr').filter({ hasText: nome })).toHaveCount(0)
    expect(await sql('select 1 from obras where id = $1', [id])).toHaveLength(0)
    expect(await objetosSob(`${AURORA}/${id}/`)).toHaveLength(0)
  })

  test('cadastros: funções, mão de obra, materiais e equipamentos', async ({ page, vigia }) => {
    vigia.permitir(/^409 POST .*\/rest\/v1\/funcoes/) // nome duplicado, de propósito
    const s = sufixo()
    await entrar(page, 'admin')

    // funções
    await irPeloMenu(page, 'Funções')
    await page.getByRole('button', { name: 'Nova função' }).first().click()
    let d = modal(page)
    await campo(d, 'Nome da função').fill(`Soldador ${s}`)
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(aviso(page, 'Função cadastrada.')).toBeVisible()
    const linhaF = page.locator('tr').filter({ hasText: `Soldador ${s}` })
    await expect(linhaF).toBeVisible()
    // duplicada
    await page.getByRole('button', { name: 'Nova função' }).first().click()
    d = modal(page)
    await campo(d, 'Nome da função').fill(`Soldador ${s}`)
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(d.getByText('Já existe um cadastro com este nome.')).toBeVisible()
    await d.getByRole('button', { name: 'Cancelar' }).click()
    // editar
    await linhaF.getByRole('button', { name: 'Editar' }).click()
    d = modal(page)
    await campo(d, 'Nome da função').fill(`Soldador TIG ${s}`)
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(aviso(page, 'Alterações salvas.')).toBeVisible()
    const linhaF2 = page.locator('tr').filter({ hasText: `Soldador TIG ${s}` })
    await expect(linhaF2).toBeVisible()

    // mão de obra (colaborador terceirizado com função)
    await irPeloMenu(page, 'Mão de Obra')
    await page.getByRole('button', { name: 'Novo colaborador' }).first().click()
    d = modal(page)
    await campo(d, 'Nome').fill(`José Teste ${s}`)
    await campo(d, 'Função').selectOption({ label: `Soldador TIG ${s}` })
    await campo(d, 'Vínculo').selectOption('terceirizada')
    await campo(d, 'Empresa terceirizada').fill('Solda Forte Ltda')
    await campo(d, 'Telefone').fill('(11) 98888-7777')
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(aviso(page, 'Colaborador cadastrado.')).toBeVisible()
    const linhaC = page.locator('tr').filter({ hasText: `José Teste ${s}` })
    await expect(linhaC).toContainText(`Soldador TIG ${s}`)
    await expect(linhaC).toContainText('Terceirizada · Solda Forte Ltda')
    // desativar e mostrar inativos
    await linhaC.getByTitle('Ativar/desativar').click()
    await expect(page.locator('tr').filter({ hasText: `José Teste ${s}` })).toHaveCount(0)
    await page.getByRole('switch').click()
    await expect(page.locator('tr').filter({ hasText: `José Teste ${s}` })).toContainText('Inativo')

    // materiais
    await irPeloMenu(page, 'Materiais')
    await page.getByRole('button', { name: 'Novo material' }).first().click()
    d = modal(page)
    await campo(d, 'Material').fill(`Areia média ${s}`)
    await campo(d, 'Unidade').fill('m³')
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(aviso(page, 'Material cadastrado.')).toBeVisible()
    await expect(page.locator('tr').filter({ hasText: `Areia média ${s}` })).toContainText('m³')

    // equipamentos + excluir
    await irPeloMenu(page, 'Equipamentos')
    await page.getByRole('button', { name: 'Novo equipamento' }).first().click()
    d = modal(page)
    await campo(d, 'Equipamento').fill(`Guindaste ${s}`)
    await campo(d, 'Identificação').fill('PAT-0099')
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(aviso(page, 'Equipamento cadastrado.')).toBeVisible()
    const linhaE = page.locator('tr').filter({ hasText: `Guindaste ${s}` })
    await expect(linhaE).toContainText('PAT-0099')
    await linhaE.getByRole('button', { name: 'Excluir' }).click()
    await confirmar(page, 'Excluir')
    await expect(aviso(page, 'Excluído.')).toBeVisible()
    await expect(page.locator('tr').filter({ hasText: `Guindaste ${s}` })).toHaveCount(0)
    expect(await sql('select 1 from equipamentos where nome = $1', [`Guindaste ${s}`])).toHaveLength(0)
  })

  test('equipe: cria colaborador, redefine senha, desativa e exclui', async ({ page, browser, vigia }) => {
    vigia.permitir(/^409 POST .*\/rpc\/admin_criar_usuario/) // e-mail duplicado, de propósito
    const s = sufixo()
    const email = `colab.${s}@teste.com.br`
    const nome = `Colaborador ${s}`
    await entrar(page, 'admin')
    await irPeloMenu(page, 'Usuários & Clientes')
    await expect(page.getByRole('tab', { name: 'Equipe' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('button', { name: 'Novo usuário' }).first().click()
    let d = modal(page)
    await expect(d.getByRole('radio', { name: 'Colaborador' })).toHaveAttribute('aria-checked', 'true')
    await campo(d, 'Nome completo').fill(nome)
    await campo(d, 'E-mail').fill(email)
    await campo(d, 'Cargo').fill('Técnico de edificações')
    await d.getByRole('button', { name: 'Criar acesso' }).click()
    await expect(d.getByRole('heading', { name: 'Acesso criado' })).toBeVisible()
    await d.getByRole('button', { name: 'Concluir' }).click()
    const linha = page.locator('li').filter({ hasText: email })
    await expect(linha).toContainText('Colaborador')
    await expect(linha).toContainText('Técnico de edificações')

    // e-mail duplicado
    await page.getByRole('button', { name: 'Novo usuário' }).first().click()
    d = modal(page)
    await campo(d, 'Nome completo').fill('Outro')
    await campo(d, 'E-mail').fill(email)
    await d.getByRole('button', { name: 'Criar acesso' }).click()
    await expect(d.getByText('E-mail já cadastrado.')).toBeVisible()
    await d.getByRole('button', { name: 'Cancelar' }).click()

    // redefinir senha → nova senha entra
    await linha.getByRole('button', { name: `Ações para ${nome}` }).click()
    await page.getByRole('menuitem', { name: 'Redefinir senha' }).click()
    d = modal(page)
    await d.locator('#rs').fill('NovaSenha#2026')
    await d.getByRole('button', { name: 'Redefinir' }).click()
    await expect(d.getByText('NovaSenha#2026')).toBeVisible()
    await d.getByRole('button', { name: 'Concluir' }).click()
    let t = await tentarEntrar(browser, email, 'NovaSenha#2026')
    await expect(t.p).toHaveURL(/\/painel$/)
    await expect(t.p.getByRole('link', { name: 'Usuários & Clientes' })).toHaveCount(0)
    await t.ctx.close()

    // desativar → a pessoa entra mas não vê nada
    await linha.getByRole('button', { name: `Ações para ${nome}` }).click()
    await page.getByRole('menuitem', { name: 'Desativar acesso' }).click()
    await expect(aviso(page, `${nome} foi desativado.`)).toBeVisible()
    await expect(linha).toContainText('Inativo')
    t = await tentarEntrar(browser, email, 'NovaSenha#2026')
    await expect(t.p.getByRole('heading', { name: 'Acesso não liberado' })).toBeVisible()
    await t.ctx.close()

    // excluir
    await linha.getByRole('button', { name: `Ações para ${nome}` }).click()
    await page.getByRole('menuitem', { name: 'Excluir usuário' }).click()
    await confirmar(page, 'Excluir usuário')
    await expect(aviso(page, 'Usuário excluído.')).toBeVisible()
    await expect(page.locator('li').filter({ hasText: email })).toHaveCount(0)
    expect(await sql('select 1 from auth.users where email = $1', [email])).toHaveLength(0)
  })

  test('cliente: acesso único com obras, troca de obras vinculadas', async ({ page, browser }) => {
    const s = sufixo()
    const email = `cliente.${s}@teste.com.br`
    const nome = `Cliente ${s}`
    await entrar(page, 'admin')
    await irPeloMenu(page, 'Usuários & Clientes')
    await page.getByRole('tab', { name: 'Clientes' }).click()
    await expect(page).toHaveURL(/aba=clientes/)
    await page.getByRole('button', { name: 'Novo cliente' }).first().click()
    let d = modal(page)
    await expect(d.getByRole('heading', { name: 'Novo cliente' })).toBeVisible()
    await campo(d, 'Nome completo').fill(nome)
    await campo(d, 'E-mail').fill(email)
    await campo(d, 'Telefone / WhatsApp').fill('(11) 97777-6666')
    await d.getByRole('checkbox', { name: 'Residencial Vista Azul' }).check()
    const senha = await d.locator('#nu-senha').inputValue()
    await d.getByRole('button', { name: 'Criar acesso' }).click()
    await expect(d.getByRole('heading', { name: 'Acesso criado' })).toBeVisible()
    await expect(d.getByRole('link', { name: 'Enviar por WhatsApp' })).toHaveAttribute('href', /wa\.me\/5511977776666\?text=/)
    await d.getByRole('button', { name: 'Concluir' }).click()
    const linha = page.locator('li').filter({ hasText: email })
    await expect(linha).toContainText('Residencial Vista Azul')

    // trocar as obras
    await linha.getByRole('button', { name: 'Obras' }).click()
    d = modal(page)
    await d.getByRole('checkbox', { name: 'Residencial Vista Azul' }).uncheck()
    await d.getByRole('checkbox', { name: 'Edifício Comercial Paulista' }).check()
    await d.getByRole('button', { name: 'Salvar' }).click()
    await expect(aviso(page, 'Obras do cliente atualizadas.')).toBeVisible()
    await expect(linha).toContainText('Edifício Comercial Paulista')
    await expect(linha).not.toContainText('Residencial Vista Azul')
    const vinc = await sql<{ obra_id: string }>(
      'select oc.obra_id from obra_clientes oc join perfis p on p.id = oc.cliente_id where p.email = $1',
      [email],
    )
    expect(vinc.map((v) => v.obra_id)).toEqual([OBRA_PAULISTA])

    // o cliente entra e vê só essa obra
    const t = await tentarEntrar(browser, email, senha)
    await expect(t.p).toHaveURL(/\/portal$/)
    await expect(t.p.getByRole('heading', { name: 'Edifício Comercial Paulista' })).toBeVisible()
    await expect(t.p.getByText('Residencial Vista Azul')).toHaveCount(0)
    await t.ctx.close()

    // vincular pela obra também (aba Clientes da obra)
    await page.goto(`/obras/${OBRA_VISTA_AZUL}?aba=clientes`)
    await page.getByLabel('Cliente', { exact: true }).selectOption({ label: `${nome} — ${email}` })
    await page.getByRole('button', { name: 'Vincular' }).click()
    await expect(aviso(page, 'Cliente vinculado à obra.')).toBeVisible()
    expect(await sql('select 1 from obra_clientes oc join perfis p on p.id = oc.cliente_id where p.email = $1', [email])).toHaveLength(2)
    await sair(page)
  })

  test('configurações da empresa: dados, logo e uso de armazenamento', async ({ page }) => {
    await entrar(page, 'admin')
    await page.locator('aside').getByRole('link', { name: 'Configurações' }).click()
    await expect(page.getByRole('heading', { name: 'Empresa', exact: true })).toBeVisible()
    await campo(page, 'Telefone').fill('(11) 4000-1234')
    await page.getByRole('button', { name: 'Salvar dados' }).click()
    await expect(aviso(page, 'Dados da empresa salvos.')).toBeVisible()
    expect((await um<{ telefone: string }>('select telefone from empresas where id = $1', [AURORA])).telefone).toBe('(11) 4000-1234')

    // limite não é do admin: o formulário nem oferece
    await expect(page.getByLabel('Limite de armazenamento (MB)')).toHaveCount(0)

    const antes = await um<{ logo_path: string | null }>('select logo_path from empresas where id = $1', [AURORA])
    await page.locator('input[type=file][accept="image/*"]').setInputFiles(await logoPng(page))
    await expect(aviso(page, 'Logo atualizada')).toBeVisible()
    const depois = await um<{ logo_path: string }>('select logo_path from empresas where id = $1', [AURORA])
    expect(depois.logo_path).toMatch(new RegExp(`^${AURORA}/logo/.+\\.webp$`))
    expect(existeNoStorage(depois.logo_path)).toBe(true)
    if (antes.logo_path) expect(existeNoStorage(antes.logo_path)).toBe(false)
    await expect(page.getByAltText('Logo da empresa')).toBeVisible()
    // a lateral passa a mostrar a logo
    await expect(page.locator('aside img').first()).toBeVisible()

    // uso de armazenamento: soma de fotos + documentos, igual ao banco
    const uso = await um<{ n: number }>('select count(*)::int n from fotos where empresa_id = $1', [AURORA])
    await expect(page.getByText(new RegExp(`^${uso.n} · `))).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Uso do armazenamento' })).toBeVisible()
    await expect(page.locator('aside').getByText('Armazenamento')).toBeVisible()
  })
})
