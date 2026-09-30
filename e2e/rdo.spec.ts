import { readFileSync } from 'node:fs'
import type { Locator, Page } from '@playwright/test'
import { test, expect, entrar, aviso, modal, confirmar, irPeloMenu, campo, sair } from './apoio/teste'
import { sql, um, sufixo, existeNoStorage, OBRA_VISTA_AZUL, OBRA_PAULISTA, API, ANON } from './apoio/ambiente'
import { fotoJpeg, lerPdf, pdfGordo } from './apoio/arquivos'

/** Seção colapsável do RDO pelo título. */
function secao(page: Page, titulo: string): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) })
}
async function abrirSecao(page: Page, titulo: string) {
  const s = secao(page, titulo)
  const botao = s.locator('> button[aria-expanded]')
  if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click()
  return s
}
function cartaoClima(page: Page, periodo: 'Manhã' | 'Tarde' | 'Noite') {
  return secao(page, 'Condição Climática')
    .locator('div')
    .filter({ hasText: periodo })
    .filter({ has: page.getByRole('radiogroup', { name: 'Clima' }) })
    .last()
}

const s = sufixo()
const COLAB = `Carlos Impermeabilização ${s}`
const FUNCAO = `Impermeabilizador ${s}`
const ATIVIDADE = `Concretagem da laje do 5º pavimento ${s}`
const OCORRENCIA = 'Chuva forte à tarde paralisou a concretagem'
const OBS = 'Visita da fiscalização às 10h.'
const COMENTARIO_EQUIPE = 'Favor conferir a armadura antes de concretar.'
const COMENTARIO_CLIENTE = `Ficou ótimo, obrigado! ${s}`
let rdoId = ''
let rdoNumero = 0

test.describe.serial('RDO de ponta a ponta', () => {
  test('colaborador cria o RDO, preenche todas as seções e envia para aprovação', async ({ page }) => {
    await entrar(page, 'engenheiro')
    await irPeloMenu(page, 'Relatórios (RDO)')
    await page.getByRole('button', { name: 'Novo RDO' }).first().click()
    await expect(page).toHaveURL(/\/relatorios\/novo$/)
    await expect(page.getByRole('heading', { name: 'Novo Relatório Diário' })).toBeVisible()

    // 01 cabeçalho + copiar anterior
    await page.getByLabel('Obra').selectOption(OBRA_VISTA_AZUL)
    const cab = secao(page, 'Cabeçalho do Relatório')
    await expect(cab.getByRole('textbox', { name: 'Responsável' })).not.toHaveValue('')
    await cab.getByRole('button', { name: /Copiar mão de obra, equipamentos e horário/ }).click()
    await expect(aviso(page, /Copiado do RD-\d+\./)).toBeVisible()

    // 02 prazo (automático da obra)
    await expect(secao(page, 'Informações de Prazo')).toContainText('Prazo contratual')
    await expect(secao(page, 'Informações de Prazo').getByText(/^\d+ dias$/).first()).toBeVisible()

    // 03 horário com intervalo → horas calculadas
    const hor = secao(page, 'Horário de Trabalho')
    await campo(hor, 'Entrada').fill('0700')
    await campo(hor, 'Saída').fill('1730')
    await campo(hor, 'Intervalo início').fill('1200')
    await campo(hor, 'Intervalo fim').fill('1300')
    await campo(hor, 'Intervalo fim').blur()
    await expect(hor.getByText('09h30')).toBeVisible()

    // 04 clima
    const manha = cartaoClima(page, 'Manhã')
    await manha.getByRole('radio', { name: 'Claro', exact: true }).click()
    await manha.getByRole('radio', { name: 'Praticável', exact: true }).click()
    const tarde = cartaoClima(page, 'Tarde')
    await tarde.getByRole('radio', { name: 'Chuvoso', exact: true }).click()
    await tarde.getByRole('radio', { name: 'Impraticável', exact: true }).click()
    await campo(secao(page, 'Condição Climática'), 'Pluviometria (mm)').fill('12,5')

    // 05 mão de obra: copiada + novo colaborador + nova função + linha livre
    const mo = secao(page, 'Mão de Obra')
    const copiadas = await mo.getByRole('listitem').count()
    expect(copiadas).toBeGreaterThan(0)
    await mo.getByRole('button', { name: 'Nova função' }).click()
    let d = modal(page)
    await expect(d.getByRole('heading', { name: 'Nova função' })).toBeVisible()
    await campo(d, 'Nome da função').fill(FUNCAO)
    await d.getByRole('button', { name: 'Cadastrar e adicionar' }).click()
    await expect(aviso(page, 'Função cadastrada.')).toBeVisible()
    await expect(mo.getByRole('listitem')).toHaveCount(copiadas + 1)
    const linhaFuncao = mo.getByRole('listitem').last()
    await expect(linhaFuncao.getByLabel('Função')).toHaveValue(FUNCAO)
    await linhaFuncao.getByLabel('Quantidade').fill('3')

    await mo.getByRole('button', { name: 'Novo colaborador' }).click()
    d = modal(page)
    await campo(d, 'Nome do colaborador').fill(COLAB)
    await campo(d, 'Função').selectOption({ label: FUNCAO })
    await campo(d, 'Vínculo').selectOption('terceirizada')
    await campo(d, 'Empresa terceirizada').fill('Impermeabiliza Já')
    await d.getByRole('button', { name: 'Cadastrar e adicionar' }).click()
    await expect(aviso(page, 'Colaborador cadastrado.')).toBeVisible()
    const linhaColab = mo.getByRole('listitem').last()
    await expect(linhaColab.getByLabel('Colaborador')).toHaveValue(/[0-9a-f-]{36}/)
    await expect(linhaColab.getByLabel('Função')).toHaveValue(FUNCAO)
    await expect(linhaColab.getByLabel('Vínculo')).toHaveValue('terceirizada')

    await mo.getByRole('button', { name: 'Adicionar linha' }).click()
    const livre = mo.getByRole('listitem').last()
    await livre.getByLabel('Função').fill('Servente')
    await livre.getByLabel('Quantidade').fill('4')
    await expect(mo.getByRole('listitem')).toHaveCount(copiadas + 3)

    // 06 equipamentos
    const eq = secao(page, 'Equipamentos')
    const eqAntes = await eq.getByRole('listitem').count()
    await eq.getByRole('button', { name: 'Adicionar equipamento' }).click()
    await eq.getByRole('listitem').last().getByLabel('Equipamento').fill('Vibrador de concreto')
    await eq.getByRole('listitem').last().getByLabel('Quantidade').fill('2')

    // 07 atividades
    const at = secao(page, 'Atividades Realizadas')
    await at.getByRole('button', { name: 'Adicionar atividade' }).click()
    await at.getByRole('listitem').last().getByLabel('Descrição').fill(ATIVIDADE)
    await at.getByRole('listitem').last().getByLabel('Situação').selectOption('concluida')
    await expect(at.getByRole('listitem').last().getByText('100%')).toBeVisible()

    // 08 ocorrências
    const oc = secao(page, 'Ocorrências')
    await oc.getByRole('button', { name: 'Registrar ocorrência' }).click()
    await oc.getByRole('listitem').last().getByLabel('Tipo').selectOption('clima')
    await oc.getByRole('listitem').last().getByLabel('Descrição').fill(OCORRENCIA)

    // 09 comentários (observações do dia; conversa só depois de salvar)
    const com = await abrirSecao(page, 'Comentários')
    await expect(com.getByText('Os comentários ficam disponíveis depois de salvar o rascunho.')).toBeVisible()
    await com.getByLabel('Observações').fill(OBS)

    // 10/11 materiais
    const rec = secao(page, 'Materiais Recebidos')
    await rec.getByRole('button', { name: 'Adicionar material' }).click()
    await rec.getByRole('listitem').last().getByLabel('Material').fill('Cimento CP-II 50 kg')
    await rec.getByRole('listitem').last().getByLabel('Quantidade').fill('50')
    await rec.getByRole('listitem').last().getByLabel('Unidade').fill('sc')
    const uti = secao(page, 'Materiais Utilizados')
    await uti.getByRole('button', { name: 'Adicionar material' }).click()
    await uti.getByRole('listitem').last().getByLabel('Material').fill('Aço CA-50 10 mm')
    await uti.getByRole('listitem').last().getByLabel('Quantidade').fill('1,5')
    await uti.getByRole('listitem').last().getByLabel('Unidade').fill('t')

    // 12 notas de compras
    const nc = secao(page, 'Notas de Compras')
    await nc.getByRole('button', { name: 'Adicionar nota' }).click()
    const nota = nc.getByRole('listitem').last()
    await nota.getByLabel('Fornecedor').fill('Depósito Central')
    await nota.getByLabel('Número da nota').fill('000987')
    await nota.getByLabel('Valor').fill('1.530,50')
    await nota.getByLabel('Valor').blur()
    await nota.getByLabel('Descrição da nota').fill('Cimento e areia')
    await expect(nc.getByText('R$ 1.530,50')).toBeVisible()
    // PDF e foto da nota, vinculados à nota
    let seletor = page.waitForEvent('filechooser')
    await nota.getByRole('button', { name: 'Anexar PDF da nota' }).click()
    await (await seletor).setFiles(await pdfGordo('nota-000123.pdf', 2))
    await expect(aviso(page, 'PDF da nota anexado.')).toBeVisible()
    seletor = page.waitForEvent('filechooser')
    await nota.getByRole('button', { name: 'Anexar foto da nota' }).click()
    await (await seletor).setFiles(await fotoJpeg(page, 1600, 2200, 0.9, 'nota.jpg'))
    await expect(aviso(page, 'Foto da nota anexada.')).toBeVisible()
    await expect(nota.getByRole('button', { name: 'Remover PDF da nota' })).toBeVisible()
    await expect(nota.getByRole('button', { name: 'Remover foto da nota' })).toBeVisible()

    // 13 fotos: anexadas ANTES de salvar (sobem junto com o primeiro salvamento)
    const galNova = await abrirSecao(page, 'Galeria de Fotos')
    await galNova.locator('input[type=file]').setInputFiles([
      await fotoJpeg(page, 1800, 1200, 0.9, 'laje.jpg'),
      await fotoJpeg(page, 1200, 900, 0.9, 'sobra.jpg'),
    ])
    await expect(galNova.getByText('2 fotos serão enviadas ao salvar o relatório (comprimidas no aparelho).')).toBeVisible()
    await galNova.getByRole('button', { name: 'Tirar sobra.jpg' }).click()
    await expect(galNova.getByText('1 foto será enviada ao salvar o relatório (comprimidas no aparelho).')).toBeVisible()
    await galNova.getByLabel('Legenda de laje.jpg').fill('Laje concretada — vista do eixo B')

    // salvar rascunho
    await page.getByRole('button', { name: 'Salvar Rascunho', exact: true }).click()
    await expect(aviso(page, 'Relatório salvo.')).toBeVisible()
    await expect(page).toHaveURL(/\/relatorios\/[0-9a-f-]{36}$/)
    rdoId = page.url().split('/').pop()!
    rdoNumero = (await um<{ numero: number }>('select numero from relatorios where id = $1', [rdoId])).numero
    await expect(page.getByRole('heading', { name: `Relatório Diário · RD-${rdoNumero}` })).toBeVisible()

    // a nota guardou os dois anexos (documentos internos, fora do alcance do cliente)
    const anexos = await um<{ pdf_mime: string; foto_mime: string; pdf_vis: boolean; foto_vis: boolean }>(
      `select dp.mime pdf_mime, df.mime foto_mime, dp.visivel_cliente pdf_vis, df.visivel_cliente foto_vis
         from relatorio_notas_compras n join documentos dp on dp.id = n.pdf_documento_id join documentos df on df.id = n.foto_documento_id
        where n.relatorio_id = $1`, [rdoId])
    expect(anexos).toEqual({ pdf_mime: 'application/pdf', foto_mime: 'image/webp', pdf_vis: false, foto_vis: false })
    // a foto anexada antes de salvar subiu com a legenda, ligada ao RDO criado
    await expect.poll(async () => await sql('select legenda from fotos where relatorio_id = $1', [rdoId])).toEqual([{ legenda: 'Laje concretada — vista do eixo B' }])
    await expect(secao(page, 'Galeria de Fotos').getByLabel('Legenda da foto')).toHaveValue('Laje concretada — vista do eixo B')

    // comentário da equipe
    const com2 = await abrirSecao(page, 'Comentários')
    await com2.getByLabel('Novo comentário').fill(COMENTARIO_EQUIPE)
    await com2.getByRole('button', { name: 'Comentar' }).click()
    await expect(com2.getByText(COMENTARIO_EQUIPE)).toBeVisible()

    // ---- recarregar: tudo persistido
    await page.reload()
    await expect(page.getByRole('heading', { name: `Relatório Diário · RD-${rdoNumero}` })).toBeVisible()
    const hor2 = secao(page, 'Horário de Trabalho')
    await expect(campo(hor2, 'Entrada')).toHaveValue('07:00')
    await expect(campo(hor2, 'Saída')).toHaveValue('17:30')
    await expect(campo(hor2, 'Intervalo início')).toHaveValue('12:00')
    await expect(campo(hor2, 'Intervalo fim')).toHaveValue('13:00')
    await expect(hor2.getByText('09h30')).toBeVisible()
    await expect(cartaoClima(page, 'Manhã').getByRole('radio', { name: 'Claro', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(cartaoClima(page, 'Manhã').getByRole('radio', { name: 'Praticável', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(cartaoClima(page, 'Tarde').getByRole('radio', { name: 'Chuvoso', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(cartaoClima(page, 'Tarde').getByRole('radio', { name: 'Impraticável', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(campo(secao(page, 'Condição Climática'), 'Pluviometria (mm)')).toHaveValue('12,5')
    const mo2 = secao(page, 'Mão de Obra')
    await expect(mo2.getByRole('listitem')).toHaveCount(copiadas + 3)
    await expect(mo2.getByLabel('Função').nth(copiadas)).toHaveValue(FUNCAO)
    await expect(mo2.getByLabel('Quantidade').nth(copiadas)).toHaveValue('3')
    await expect(mo2.getByLabel('Colaborador').nth(copiadas + 1).locator('option:checked')).toHaveText(COLAB)
    await expect(mo2.getByLabel('Empresa terceirizada').last()).toHaveValue('Impermeabiliza Já')
    await expect(mo2.getByLabel('Função').nth(copiadas + 2)).toHaveValue('Servente')
    await expect(mo2.getByLabel('Quantidade').nth(copiadas + 2)).toHaveValue('4')
    await expect(secao(page, 'Equipamentos').getByRole('listitem')).toHaveCount(eqAntes + 1)
    await expect(secao(page, 'Equipamentos').getByLabel('Equipamento').last()).toHaveValue('Vibrador de concreto')
    await expect(secao(page, 'Atividades Realizadas').getByLabel('Descrição').last()).toHaveValue(ATIVIDADE)
    await expect(secao(page, 'Atividades Realizadas').getByLabel('Situação').last()).toHaveValue('concluida')
    await expect(secao(page, 'Ocorrências').getByLabel('Tipo').last()).toHaveValue('clima')
    await expect(secao(page, 'Ocorrências').getByLabel('Descrição').last()).toHaveValue(OCORRENCIA)
    await expect((await abrirSecao(page, 'Comentários')).getByLabel('Observações')).toHaveValue(OBS)
    await expect(secao(page, 'Comentários').getByText(COMENTARIO_EQUIPE)).toBeVisible()
    await expect(secao(page, 'Materiais Recebidos').getByLabel('Material').last()).toHaveValue('Cimento CP-II 50 kg')
    await expect(secao(page, 'Materiais Recebidos').getByLabel('Quantidade').last()).toHaveValue('50')
    await expect(secao(page, 'Materiais Recebidos').getByLabel('Unidade').last()).toHaveValue('sc')
    await expect(secao(page, 'Materiais Utilizados').getByLabel('Quantidade').last()).toHaveValue('1.5')
    await expect(secao(page, 'Materiais Utilizados').getByLabel('Unidade').last()).toHaveValue('t')
    await expect(secao(page, 'Notas de Compras').getByLabel('Fornecedor').last()).toHaveValue('Depósito Central')
    await expect(secao(page, 'Notas de Compras').getByText('R$ 1.530,50')).toBeVisible()
    await expect(secao(page, 'Galeria de Fotos').getByLabel('Legenda da foto')).toHaveValue('Laje concretada — vista do eixo B')

    // banco confere
    const r = await um<Record<string, unknown>>(
      `select status, responsavel, horario_inicio::text hi, horario_fim::text hf, intervalo_inicio::text ii, intervalo_fim::text if_,
              clima_manha, clima_tarde, condicao_manha, condicao_tarde, pluviometria_mm::text pluv, observacoes
         from relatorios where id = $1`,
      [rdoId],
    )
    expect(r).toMatchObject({ status: 'preenchendo', hi: '07:00:00', hf: '17:30:00', ii: '12:00:00', if_: '13:00:00', clima_manha: 'claro', clima_tarde: 'chuvoso', condicao_manha: 'praticavel', condicao_tarde: 'impraticavel', pluv: '12.5', observacoes: OBS })
    expect(await um('select valor::text, numero_nota from relatorio_notas_compras where relatorio_id = $1', [rdoId])).toEqual({ valor: '1530.50', numero_nota: '000987' })
    expect(await um('select colaborador_nome, funcao, tipo, empresa_terceira from relatorio_mao_obra where relatorio_id = $1 and colaborador_nome = $2', [rdoId, COLAB])).toEqual({ colaborador_nome: COLAB, funcao: FUNCAO, tipo: 'terceirizada', empresa_terceira: 'Impermeabiliza Já' })

    // ---- enviar para aprovação; colaborador não aprova
    await expect(page.getByRole('button', { name: 'Salvar e Aprovar' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Enviar para Aprovação' }).click()
    await expect(aviso(page, 'Enviado para aprovação.')).toBeVisible()
    await expect(page.getByText('Pendente Aprovação').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Voltar a rascunho' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Salvar e Aprovar' })).toHaveCount(0)
    expect((await um<{ status: string }>('select status from relatorios where id = $1', [rdoId])).status).toBe('revisar')

    // colaborador não vê o menu de usuários nem entra por URL
    await expect(page.getByRole('link', { name: 'Usuários & Clientes' })).toHaveCount(0)
    await page.goto('/usuarios')
    await expect(page).toHaveURL(/\/painel$/)
    await page.goto('/master/empresas')
    await expect(page).toHaveURL(/\/painel$/)
    await page.goto('/empresa')
    await expect(page).toHaveURL(/\/painel$/)
  })

  test('admin aprova ("Salvar e Aprovar"), baixa o PDF, reabre e aprova de novo', async ({ page }) => {
    test.skip(!rdoId, 'depende do RDO criado no teste anterior')
    await entrar(page, 'admin')
    await irPeloMenu(page, 'Relatórios (RDO)')
    await expect(page.getByRole('button', { name: /pendentes? de aprovação/ })).toBeVisible()
    await page.getByRole('button', { name: /pendentes? de aprovação/ }).click()
    await page.locator('tr').filter({ hasText: `RD-${rdoNumero}` }).filter({ hasText: 'Residencial Vista Azul' }).click()
    await expect(page).toHaveURL(new RegExp(`/relatorios/${rdoId}$`))

    // admin ajusta e aprova no mesmo clique
    await secao(page, 'Atividades Realizadas').getByLabel('Descrição').last().fill(`${ATIVIDADE} (revisado)`)
    await page.getByRole('button', { name: 'Salvar e Aprovar' }).click()
    await confirmar(page, 'Aprovar')
    await expect(aviso(page, 'Relatório aprovado.')).toBeVisible()
    await expect(page.getByText(/aprovado em \d{2}\/\d{2}\/\d{4}/)).toBeVisible()
    const r = await um<{ status: string; aprovador: string }>(
      'select r.status, p.email aprovador from relatorios r join perfis p on p.id = r.aprovado_por where r.id = $1',
      [rdoId],
    )
    expect(r).toEqual({ status: 'aprovado', aprovador: 'admin@construtoraaurora.com.br' })
    expect((await um<{ d: string }>('select descricao d from relatorio_atividades where relatorio_id = $1 order by ordem desc limit 1', [rdoId])).d).toBe(`${ATIVIDADE} (revisado)`)

    // PDF do RDO (equipe: com notas de compras)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()])
    expect(dl.suggestedFilename()).toMatch(new RegExp(`^RD-${rdoNumero}-.+\\.pdf$`))
    const pdf = await lerPdf(await dl.path())
    expect(pdf.paginas).toBeGreaterThanOrEqual(1)
    for (const t of [`RD-${rdoNumero}`, 'Residencial Vista Azul', 'Construtora Aurora', '09h30', FUNCAO, COLAB, 'Vibrador de concreto', `${ATIVIDADE} (revisado)`, OCORRENCIA, 'Cimento CP-II 50 kg', 'Aço CA-50 10 mm', 'Depósito Central', 'R$ 1.530,50', OBS]) {
      expect(pdf.texto, `PDF deveria conter "${t}"`).toContain(t)
    }
    test.info().annotations.push({ type: 'pdf-rdo', description: `${pdf.paginas} página(s), ${pdf.bytes} bytes` })

    // reabrir → rascunho; aprovar de novo
    await page.getByRole('button', { name: 'Reabrir' }).click()
    await expect(aviso(page, 'Relatório reaberto como rascunho.')).toBeVisible()
    await expect(page.getByText('Rascunho').first()).toBeVisible()
    expect((await um<{ status: string; ap: string | null }>('select status, aprovado_por ap from relatorios where id = $1', [rdoId]))).toEqual({ status: 'preenchendo', ap: null })
    await page.getByRole('button', { name: 'Salvar e Aprovar' }).click()
    await confirmar(page, 'Aprovar')
    await expect(aviso(page, 'Relatório aprovado.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible()
  })

  test('colaborador não edita RDO aprovado', async ({ page, vigia }) => {
    vigia.permitir(/^40\d POST .*\/rpc\/mudar_status_relatorio/) // tentativa proposital pela API
    test.skip(!rdoId, 'depende do RDO criado')
    await entrar(page, 'engenheiro')
    await page.goto(`/relatorios/${rdoId}`)
    await expect(page.getByRole('heading', { name: `Relatório Diário · RD-${rdoNumero}` })).toBeVisible()
    await expect(page.getByText('Aprovado').first()).toBeVisible()
    for (const b of ['Salvar Rascunho', 'Salvar', 'Enviar para Aprovação', 'Salvar e Aprovar', 'Reabrir', 'Adicionar linha', 'Adicionar atividade']) {
      await expect(page.getByRole('button', { name: b, exact: true })).toHaveCount(0)
    }
    await expect(campo(secao(page, 'Horário de Trabalho'), 'Entrada')).toHaveAttribute('readonly', '')
    await expect(secao(page, 'Mão de Obra').getByRole('combobox')).toHaveCount(0)
    await expect(secao(page, 'Atividades Realizadas')).toContainText(`${ATIVIDADE} (revisado)`)
    // nem pela API (a RLS devolve 0 linhas; a RPC recusa com mensagem)
    const r = await page.evaluate(
      async ({ id, api, anon }) => {
        const chave = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))!
        const token = JSON.parse(localStorage.getItem(chave)!).access_token as string
        const resp = await fetch(`${api}/rest/v1/rpc/mudar_status_relatorio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anon },
          body: JSON.stringify({ p_relatorio: id, p_status: 'preenchendo' }),
        })
        return { status: resp.status, corpo: await resp.text() }
      },
      { id: rdoId, api: API, anon: ANON },
    )
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(r.corpo).toContain('Somente o administrador aprova ou reabre um relatório aprovado')
  })

  test('PDF do período (obra) e CSV da exportação', async ({ page }) => {
    test.skip(!rdoId, 'depende do RDO criado')
    await entrar(page, 'admin')
    // PDF do período pela página da obra
    await page.goto(`/obras/${OBRA_VISTA_AZUL}`)
    await page.getByRole('button', { name: 'PDF do período' }).click()
    const d = modal(page)
    await campo(d, 'De').fill('01/09/2026')
    const [dl] = await Promise.all([page.waitForEvent('download'), d.getByRole('button', { name: 'Gerar PDF' }).click()])
    await expect(aviso(page, 'PDF do período gerado.')).toBeVisible()
    expect(dl.suggestedFilename()).toMatch(/^Relatorio-periodo-.+-2026-09-01-a-\d{4}-\d{2}-\d{2}\.pdf$/)
    const pdf = await lerPdf(await dl.path())
    const n = await um<{ n: number }>("select count(*)::int n from relatorios where obra_id = $1 and data >= '2026-09-01' and data <= current_date", [OBRA_VISTA_AZUL])
    expect(pdf.paginas).toBeGreaterThanOrEqual(n.n + 1)
    for (const t of ['Residencial Vista Azul', `RD-${rdoNumero}`, 'RD-1', OCORRENCIA]) expect(pdf.texto).toContain(t)
    test.info().annotations.push({ type: 'pdf-periodo', description: `${pdf.paginas} páginas para ${n.n} RDOs, ${pdf.bytes} bytes` })

    // Exportação: CSVs
    await irPeloMenu(page, 'Relatórios & Exportação')
    await page.getByLabel('Obra').selectOption(OBRA_VISTA_AZUL)
    await campo(page, 'De').fill('01/09/2026')
    const baixar = async (bloco: string) => {
      const b = page.locator('section').filter({ has: page.getByRole('heading', { name: bloco }) })
      const [arq] = await Promise.all([page.waitForEvent('download'), b.getByRole('button', { name: 'Baixar CSV' }).click()])
      return { nome: arq.suggestedFilename(), texto: readFileSync(await arq.path(), 'utf8') }
    }
    const rel = await baixar('Planilha de relatórios')
    expect(rel.nome).toMatch(/^relatorios-residencial-vista-azul-2026-09-01-a-.+\.csv$/)
    expect(rel.texto.charCodeAt(0)).toBe(0xfeff) // BOM para o Excel
    const linhas = rel.texto.slice(1).split('\r\n')
    expect(linhas[0]).toBe('Nº;Obra;Data;Dia;Status;Responsável;Entrada;Saída;Horas;Clima manhã;Condição manhã;Clima tarde;Condição tarde;Chuva (mm);Efetivo;Atividades;Observações')
    expect(linhas).toHaveLength(n.n + 1)
    const minha = linhas.find((l) => l.startsWith(`RD-${rdoNumero};`))!
    expect(minha).toContain(';Aprovado;')
    expect(minha).toContain(';07:00;17:30;09h30;Claro;Praticável;Chuvoso;Impraticável;12,5;')
    const mo = await baixar('Mão de obra')
    expect(mo.texto).toContain(`RD-${rdoNumero};Residencial Vista Azul;`)
    expect(mo.texto).toContain(`${COLAB};${FUNCAO};Terceirizada;Impermeabiliza Já;1`)
    const mat = await baixar('Materiais')
    expect(mat.texto).toContain('Recebido;Cimento CP-II 50 kg;50;sc')
    expect(mat.texto).toContain('Utilizado;Aço CA-50 10 mm;1,5;t')
  })

  test('cliente vê o RDO aprovado, fotos e comenta — sem as notas de compras', async ({ page }) => {
    test.skip(!rdoId, 'depende do RDO criado')
    const respostasNotas: string[] = []
    page.on('response', async (r) => {
      if (r.url().includes('/rest/v1/relatorio_notas_compras')) respostasNotas.push(await r.text())
    })
    await entrar(page, 'cliente')
    await page.getByRole('link', { name: /Residencial Vista Azul/ }).first().click()
    await expect(page).toHaveURL(new RegExp(`/portal/obras/${OBRA_VISTA_AZUL}`))
    const item = page.getByRole('listitem').filter({ hasText: `RD${rdoNumero}` })
    await expect(item).toBeVisible()
    await item.getByRole('link', { name: 'Ver' }).click()
    await expect(page).toHaveURL(new RegExp(`/portal/relatorios/${rdoId}$`))
    await expect(page.getByText(`RELATÓRIO DIÁRIO · RD-${rdoNumero}`)).toBeVisible()
    await expect(page.getByText(`${ATIVIDADE} (revisado)`)).toBeVisible()
    await expect(page.getByText(OCORRENCIA)).toBeVisible()
    await expect(page.getByText('Aprovado pela construtora em')).toBeVisible()
    // foto com legenda + lightbox
    await page.getByRole('button', { name: /Ampliar foto: Laje concretada/ }).click()
    const lb = page.getByRole('dialog', { name: 'Visualizador de fotos' })
    await expect(lb).toBeVisible()
    await expect(lb.getByText('Laje concretada — vista do eixo B')).toBeVisible()
    await expect(lb.getByRole('img')).toHaveJSProperty('complete', true)
    await page.keyboard.press('Escape')
    await expect(lb).toHaveCount(0)
    // notas: nem na tela, nem na resposta da API
    await expect(page.getByText('Depósito Central')).toHaveCount(0)
    await expect(page.getByText('Notas de Compras')).toHaveCount(0)
    expect(respostasNotas.length).toBeGreaterThan(0)
    for (const corpo of respostasNotas) expect(corpo).toBe('[]')

    // PDF do cliente: sem notas
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()])
    const pdf = await lerPdf(await dl.path())
    expect(pdf.texto).toContain(`RD-${rdoNumero}`)
    expect(pdf.texto).toContain(`${ATIVIDADE} (revisado)`)
    expect(pdf.texto).not.toContain('Depósito Central')
    expect(pdf.texto).not.toContain('Notas de compras')

    // comenta
    await page.getByLabel('Novo comentário').fill(COMENTARIO_CLIENTE)
    await page.getByRole('button', { name: 'Comentar' }).click()
    await expect(page.getByText(COMENTARIO_CLIENTE)).toBeVisible()
    await expect(page.getByText(COMENTARIO_EQUIPE)).toBeVisible()
    // espera a gravação (a tela pode mostrar o texto uns milissegundos antes de a consulta direta o enxergar)
    await expect.poll(async () => (await sql(
      'select p.papel from relatorio_comentarios c join perfis p on p.id = c.autor_id where c.relatorio_id = $1 and c.texto = $2',
      [rdoId, COMENTARIO_CLIENTE],
    ))[0]?.papel).toBe('cliente')
    await sair(page)
  })

  test('foto do RDO: excluir remove os arquivos do Storage', async ({ page }) => {
    test.skip(!rdoId, 'depende do RDO criado')
    const f = await um<{ path: string; thumb_path: string }>('select path, thumb_path from fotos where relatorio_id = $1', [rdoId])
    expect(existeNoStorage(f.path) && existeNoStorage(f.thumb_path)).toBe(true)
    await entrar(page, 'admin')
    await page.goto(`/relatorios/${rdoId}`)
    const gal = await abrirSecao(page, 'Galeria de Fotos')
    await gal.getByRole('button', { name: 'Excluir foto' }).click()
    await confirmar(page, 'Excluir')
    await expect(gal.getByRole('button', { name: /Ampliar foto/ })).toHaveCount(0)
    expect(await sql('select 1 from fotos where relatorio_id = $1', [rdoId])).toHaveLength(0)
    expect(existeNoStorage(f.path)).toBe(false)
    expect(existeNoStorage(f.thumb_path)).toBe(false)
    expect(await sql("select 1 from storage.objects where name in ($1, $2)", [f.path, f.thumb_path])).toHaveLength(0)
  })

  test('RDO de outra obra: colaborador não exclui e numeração segue por obra', async ({ page }) => {
    await entrar(page, 'engenheiro')
    await irPeloMenu(page, 'Relatórios (RDO)')
    await expect(page.getByRole('button', { name: 'Excluir' })).toHaveCount(0)
    await page.getByLabel('Obra').selectOption(OBRA_PAULISTA)
    await expect(page.getByText(/^\d+ de \d+ relatórios/)).toBeVisible()
    const n = await um<{ n: number }>('select count(*)::int n from relatorios where obra_id = $1', [OBRA_PAULISTA])
    await expect(page.locator('tbody tr')).toHaveCount(n.n)
  })
})
