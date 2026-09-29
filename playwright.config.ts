/**
 * Suíte de ponta a ponta do Obtra (Playwright).
 *
 * Roda contra o ambiente LOCAL (ferramentas/local/subir.sh): Postgres +
 * PostgREST + portão em 127.0.0.1:54321, com a carga demo. O global-setup
 * recria o banco e os arquivos antes de cada execução (E2E_SEM_RESET=1 pula).
 *
 *   npm run test:e2e                     # tudo, desktop + celular
 *   npm run test:e2e -- --project=desktop
 *   npm run test:e2e -- e2e/rdo.spec.ts
 */
import { defineConfig, devices } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

/** Usa o Chromium que estiver instalado, mesmo de outra versão do Playwright. */
function chromiumExecutavel(): string | undefined {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM
  try {
    if (existsSync(chromium.executablePath())) return undefined
  } catch {
    /* segue a busca */
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!base || !existsSync(base)) return undefined
  const candidatos = readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    .map((d) => join(base, d, 'chrome-linux', 'chrome'))
    .filter((c) => existsSync(c))
  return candidatos[0]
}

const executablePath = chromiumExecutavel()
const BASE = process.env.E2E_URL ?? 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // O banco é um só: os testes mexem em dados compartilhados, então rodam em fila.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      // Pixel 7 no Chromium (390 px de largura, toque, UA de celular).
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      // No celular: acesso, navegação por papel, layout sem rolagem lateral e o RDO.
      grep: /@celular/,
    },
  ],
  webServer: {
    command: 'npx vite --port 5173 --host 127.0.0.1 --strictPort',
    url: BASE,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
