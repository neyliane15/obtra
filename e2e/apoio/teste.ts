/**
 * `test` do Obtra: todo teste ganha um vigia que falha o teste se aparecer
 * erro no console do navegador, exceção na página ou resposta HTTP 4xx/5xx
 * que o teste não declarou como esperada (`vigia.permitir(...)`).
 */
import { test as base, expect, type Locator, type Page, type Response } from '@playwright/test'
import { SENHA, USUARIOS, type Conta } from './ambiente'

interface Ocorrencia {
  tipo: 'console' | 'pagina' | 'http'
  texto: string
}

export class Vigia {
  private ocorrencias: Ocorrencia[] = []
  private permitidos: RegExp[] = []
  private respostas: { status: number; url: string; metodo: string }[] = []

  constructor(page: Page) {
    page.on('console', (m) => {
      if (m.type() === 'error') this.ocorrencias.push({ tipo: 'console', texto: m.text() })
    })
    page.on('pageerror', (e) => this.ocorrencias.push({ tipo: 'pagina', texto: `${e.name}: ${e.message}` }))
    page.on('response', (r: Response) => {
      const status = r.status()
      const url = r.url()
      this.respostas.push({ status, url, metodo: r.request().method() })
      if (status >= 400) this.ocorrencias.push({ tipo: 'http', texto: `${status} ${r.request().method()} ${url}` })
    })
  }

  /** Declara erros esperados (casados contra "status método url" ou o texto do console). */
  permitir(...padroes: RegExp[]) {
    this.permitidos.push(...padroes)
  }

  /** Respostas vistas até agora (para conferir que algo foi, de fato, recusado). */
  vistas(filtro: RegExp) {
    return this.respostas.filter((r) => filtro.test(`${r.status} ${r.metodo} ${r.url}`))
  }

  pendencias(): Ocorrencia[] {
    // O Chromium repete toda resposta 4xx/5xx como "Failed to load resource"
    // no console: ela já é julgada pela resposta HTTP, não conta duas vezes.
    return this.ocorrencias.filter((o) => {
      if (this.permitidos.some((p) => p.test(o.texto))) return false
      if (o.tipo === 'console' && /^Failed to load resource: the server responded with a status of \d+/.test(o.texto)) return false
      return true
    })
  }
}

export const test = base.extend<{ vigia: Vigia }>({
  vigia: [
    async ({ page }, usar, info) => {
      const v = new Vigia(page)
      await usar(v)
      const p = v.pendencias()
      if (p.length && info.status === info.expectedStatus) {
        throw new Error(`Erros inesperados no navegador:\n${p.map((o) => `  [${o.tipo}] ${o.texto}`).join('\n')}`)
      }
    },
    { auto: true },
  ],
})

export { expect }

/* ------------------------------------------------------------ ações -- */
export async function entrar(page: Page, conta: Conta, senha = SENHA) {
  await page.goto('/entrar')
  await page.locator('#email').fill(USUARIOS[conta])
  await page.locator('#senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  const destino = conta === 'cliente' ? /\/portal$/ : /\/painel$/
  await expect(page).toHaveURL(destino)
  await expect(page.getByRole('status').filter({ hasText: /Abrindo o canteiro|Carregando/ })).toHaveCount(0)
}

export async function sair(page: Page) {
  // Desktop: "Sair" na lateral. Celular/portal: menu do usuário no topo.
  await page.locator('aside button:visible, header button[aria-haspopup="menu"]:visible').first().waitFor()
  const lateral = page.locator('aside').getByRole('button', { name: 'Sair' })
  if (await lateral.isVisible()) {
    await lateral.click()
  } else {
    await page.locator('header button[aria-haspopup="menu"]:visible').first().click()
    await page.getByRole('menuitem', { name: 'Sair' }).click()
  }
  await expect(page).toHaveURL(/\/entrar$/)
}

/** Navega pelo menu (lateral no desktop, gaveta "Mais" no celular). */
export async function irPeloMenu(page: Page, rotulo: string | RegExp) {
  await page.locator('aside nav[aria-label="Principal"]:visible, nav[aria-label="Navegação inferior"]:visible').first().waitFor()
  const lateral = page.locator('aside nav[aria-label="Principal"]')
  if (await lateral.isVisible()) {
    await lateral.getByRole('link', { name: rotulo }).click()
    return
  }
  const inferior = page.getByRole('navigation', { name: 'Navegação inferior' })
  const atalho = inferior.getByRole('link', { name: rotulo })
  if (await atalho.count()) {
    await atalho.click()
    return
  }
  await inferior.getByRole('button', { name: 'Mais' }).click()
  await page.locator('nav[aria-label="Principal"]:visible').getByRole('link', { name: rotulo }).click()
}

/** Aviso (toast) de sucesso/erro/info com o texto. */
export function aviso(page: Page, texto: string | RegExp) {
  // .last(): o mesmo aviso pode estar duas vezes na tela (ação repetida em sequência)
  return page.locator('[aria-live="polite"] [role="status"], [aria-live="polite"] [role="alert"]').filter({ hasText: texto }).last()
}

/** Modal aberto (o último). */
export function modal(page: Page) {
  return page.getByRole('dialog').last()
}

/** Confirma a caixa "tem certeza?" (com texto a digitar, se houver). */
export async function confirmar(page: Page, botao: string | RegExp, digitar?: string) {
  const d = modal(page)
  if (digitar) await d.getByRole('textbox').last().fill(digitar)
  await d.getByRole('button', { name: botao }).click()
}

/** A página não rola para o lado (nada vaza a largura da janela). */
export async function semRolagemHorizontal(page: Page) {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    corpo: document.body.scrollWidth,
    janela: window.innerWidth,
  }))
  expect(Math.max(r.doc, r.corpo), `largura do conteúdo (${JSON.stringify(r)})`).toBeLessThanOrEqual(r.janela)
}

/** Campo de formulário pelo nome acessível exato (texto, número, seleção). */
export function campo(escopo: Page | Locator, nome: string) {
  const o = { name: nome, exact: true }
  return escopo.getByRole('textbox', o).or(escopo.getByRole('combobox', o)).or(escopo.getByRole('spinbutton', o))
}
