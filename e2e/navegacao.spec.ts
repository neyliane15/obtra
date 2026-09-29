import type { Page } from '@playwright/test'
import { test, expect, entrar, irPeloMenu, semRolagemHorizontal, modal } from './apoio/teste'
import { um, OBRA_VISTA_AZUL, AURORA } from './apoio/ambiente'

async function visitar(page: Page, rota: string, titulo: string | RegExp) {
  await page.goto(rota)
  await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(titulo)
  // espera imagens/listas assentarem antes de medir
  await page.waitForLoadState('networkidle')
  await semRolagemHorizontal(page)
}

test.describe('Todas as telas, sem rolagem lateral @celular', () => {
  test('equipe (admin): cada página do menu', async ({ page }) => {
    const rdo = await um<{ id: string; numero: number }>("select id, numero from relatorios where obra_id = $1 and status = 'aprovado' order by numero limit 1", [OBRA_VISTA_AZUL])
    await entrar(page, 'admin')
    await visitar(page, '/painel', 'Olá')
    await visitar(page, '/obras', 'Obras')
    for (const aba of ['relatorios', 'fotos', 'documentos', 'clientes', 'info']) {
      await visitar(page, `/obras/${OBRA_VISTA_AZUL}?aba=${aba}`, 'Residencial Vista Azul')
    }
    await visitar(page, '/relatorios', 'Relatórios Diários de Obra')
    await visitar(page, `/relatorios/${rdo.id}`, `RD-${rdo.numero}`)
    await visitar(page, '/relatorios/novo', 'Novo Relatório Diário')
    await visitar(page, '/historico', 'Histórico')
    await visitar(page, '/cadastros/mao-de-obra', 'Mão de Obra')
    await visitar(page, '/cadastros/funcoes', 'Funções')
    await visitar(page, '/cadastros/materiais', 'Materiais')
    await visitar(page, '/cadastros/equipamentos', 'Equipamentos')
    await visitar(page, '/exportacao', 'Relatórios & Exportação')
    await visitar(page, '/usuarios', 'Usuários & Clientes')
    await visitar(page, '/usuarios?aba=clientes', 'Usuários & Clientes')
    await visitar(page, '/empresa', 'Empresa')

    // modal grande no celular também cabe
    await page.goto('/obras?nova=1')
    await expect(modal(page).getByRole('heading', { name: 'Nova obra' })).toBeVisible()
    await semRolagemHorizontal(page)
  })

  test('navegação pelo menu (lateral no desktop, barra inferior + "Mais" no celular)', async ({ page }) => {
    await entrar(page, 'engenheiro')
    for (const [item, titulo] of [
      ['Obras', 'Obras'],
      ['Relatórios (RDO)', 'Relatórios Diários de Obra'],
      ['Histórico', 'Histórico'],
      ['Funções', 'Funções'],
      ['Materiais', 'Materiais'],
      ['Relatórios & Exportação', 'Relatórios & Exportação'],
      ['Dashboard', 'Olá'],
    ] as const) {
      await irPeloMenu(page, item)
      await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(titulo)
      await semRolagemHorizontal(page)
    }
  })

  test('master: empresas, usuários e contexto', async ({ page }) => {
    await entrar(page, 'master')
    await visitar(page, '/master/empresas', 'Empresas')
    await visitar(page, '/master/usuarios', 'Todos os usuários')
    await visitar(page, '/obras', 'Obras')
    await expect(page.getByText('em todas as empresas')).toBeVisible()
    await visitar(page, '/relatorios', 'Relatórios Diários de Obra')
    await visitar(page, '/painel', 'Olá')
    await expect(page.getByText('Visão geral de todas as empresas da plataforma')).toBeVisible()
    // escolher a empresa pelo seletor de contexto (menu lateral / gaveta)
    const seletor = page.locator('select[aria-label="Empresa em contexto"]:visible')
    if (!(await seletor.count())) {
      await page.getByRole('navigation', { name: 'Navegação inferior' }).getByRole('button', { name: 'Mais' }).click()
    }
    await seletor.selectOption(AURORA)
    await expect(page.getByText('Visão da empresa Construtora Aurora')).toBeVisible()
    await visitar(page, '/empresa', 'Empresa')
    await visitar(page, '/cadastros/funcoes', 'Funções')
  })

  test('cliente: portal', async ({ page }) => {
    const rdo = await um<{ id: string }>("select id from relatorios where obra_id = $1 and status = 'aprovado' order by numero limit 1", [OBRA_VISTA_AZUL])
    await entrar(page, 'cliente')
    await visitar(page, '/portal', 'Olá')
    for (const aba of ['linha', 'fotos', 'documentos']) await visitar(page, `/portal/obras/${OBRA_VISTA_AZUL}?aba=${aba}`, 'Residencial Vista Azul')
    await visitar(page, `/portal/relatorios/${rdo.id}`, /feira|sábado|domingo/)
  })

  test('RDO pelo celular: criar, preencher, salvar e enviar', async ({ page }) => {
    await entrar(page, 'mestre')
    await irPeloMenu(page, 'Relatórios (RDO)')
    await page.getByRole('button', { name: 'Novo RDO' }).first().click()
    // a URL muda antes de a página nova aparecer (transição do router): espere o título
    await expect(page.getByRole('heading', { name: 'Novo Relatório Diário' })).toBeVisible()
    await page.getByLabel('Obra').selectOption(OBRA_VISTA_AZUL)
    await page.getByRole('button', { name: /Copiar mão de obra, equipamentos e horário/ }).click()
    await expect(page.getByText(/Copiado do RD-\d+\./)).toBeVisible()
    const hor = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Horário de Trabalho' }) })
    await hor.getByRole('textbox', { name: 'Saída', exact: true }).fill('1600')
    await hor.getByRole('textbox', { name: 'Saída', exact: true }).blur()
    await expect(hor.getByText('08h00')).toBeVisible()
    const at = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Atividades Realizadas' }) })
    await at.getByRole('button', { name: 'Adicionar atividade' }).click()
    await at.getByLabel('Descrição').last().fill('Limpeza do canteiro (celular)')
    await semRolagemHorizontal(page)
    // rodapé fixo com rótulos curtos no celular
    const salvar = page.getByRole('button', { name: /^Salvar( Rascunho)?$/ })
    await expect(salvar).toBeVisible()
    await salvar.click()
    await expect(page.getByText('Relatório salvo.')).toBeVisible()
    await expect(page).toHaveURL(/\/relatorios\/[0-9a-f-]{36}$/)
    await page.getByRole('button', { name: /^Enviar( para Aprovação)?$/ }).click()
    await expect(page.getByText('Enviado para aprovação.')).toBeVisible()
    await semRolagemHorizontal(page)
  })

  test('telas de acesso', async ({ page }) => {
    for (const [rota, titulo] of [['/entrar', 'Entrar no Obtra'], ['/esqueci-senha', 'Esqueceu a senha?'], ['/redefinir-senha', 'Defina sua nova senha']] as const) {
      await page.goto(rota)
      await expect(page.getByRole('heading', { name: titulo })).toBeVisible()
      await semRolagemHorizontal(page)
    }
  })
})
