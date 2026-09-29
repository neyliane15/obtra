import { test, expect, entrar, sair, semRolagemHorizontal } from './apoio/teste'
import { USUARIOS, type Conta } from './apoio/ambiente'

const PAPEIS: { conta: Conta; papel: string; nome: RegExp }[] = [
  { conta: 'master', papel: 'Master', nome: /Master do Obtra/ },
  { conta: 'admin', papel: 'Administrador', nome: /.+/ },
  { conta: 'engenheiro', papel: 'Colaborador', nome: /.+/ },
  { conta: 'mestre', papel: 'Colaborador', nome: /Antônio Lima/ },
  { conta: 'adminBeta', papel: 'Administrador', nome: /.+/ },
]

test.describe('Acesso @celular', () => {
  for (const { conta, papel } of PAPEIS) {
    test(`entra e sai como ${conta} (${papel})`, async ({ page }) => {
      await entrar(page, conta)
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Olá')
      await semRolagemHorizontal(page)
      await sair(page)
      // sem sessão, rota interna volta para o login
      await page.goto('/obras')
      await expect(page).toHaveURL(/\/entrar$/)
    })
  }

  test('entra e sai como cliente (portal)', async ({ page }) => {
    await entrar(page, 'cliente')
    await expect(page.getByText('PORTAL DO CLIENTE')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Olá/ })).toBeVisible()
    await semRolagemHorizontal(page)
    await sair(page)
    await page.goto('/portal')
    await expect(page).toHaveURL(/\/entrar$/)
  })

  test('senha errada mostra erro em português', async ({ page, vigia }) => {
    vigia.permitir(/^400 POST .*\/auth\/v1\/token/)
    await page.goto('/entrar')
    await page.locator('#email').fill(USUARIOS.admin)
    await page.locator('#senha').fill('senha-errada')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    await expect(page).toHaveURL(/\/entrar$/)
    expect(vigia.vistas(/^400 POST .*\/auth\/v1\/token/)).toHaveLength(1)
  })

  test('validação do formulário de entrada', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByText('Informe um e-mail válido.')).toBeVisible()
    await expect(page.getByText('Informe a senha.')).toBeVisible()
  })

  test('esqueci a senha', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByRole('link', { name: 'Esqueci minha senha' }).click()
    await expect(page).toHaveURL(/\/esqueci-senha$/)
    await page.getByRole('button', { name: 'Enviar link' }).click()
    await expect(page.getByText('Informe um e-mail válido.')).toBeVisible()
    await page.locator('#email-rec').fill(USUARIOS.engenheiro)
    await page.getByRole('button', { name: 'Enviar link' }).click()
    await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible()
    await expect(page.getByText(USUARIOS.engenheiro)).toBeVisible()
    await page.getByRole('link', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/entrar$/)
  })

  test('link de redefinição vencido explica e oferece outro', async ({ page }) => {
    await page.goto('/redefinir-senha')
    await expect(page.getByText('Este link expirou ou já foi usado.')).toBeVisible()
  })

  test('rota inexistente mostra 404 amigável', async ({ page }) => {
    await page.goto('/nao-existe/nada')
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
  })
})
