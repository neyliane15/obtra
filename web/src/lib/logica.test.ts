import { describe, expect, it } from 'vitest'
import { calcularDimensoes, extensaoDoMime } from './imagem'
import { calcularPrazo, previsaoPorPrazo } from './prazo'
import { codigoRelatorio, formatarBytes, iniciais, lerNumero, normalizar, numeroRelatorio, percentualUso, telefoneWhatsApp } from './formato'
import { papeisCriaveis, permissoes, podeEditarRelatorio, rotaInicial, transicoesPermitidas } from './permissoes'
import { formatarDuracao, minutosTrabalhados, paraMinutos } from './horario'
import { celulaCsv, gerarCsv } from './csv'
import { gerarSenha, textoDeAcesso } from './senha'

describe('calcularDimensoes', () => {
  it('reduz paisagem para lado maior 1600', () => {
    expect(calcularDimensoes(4000, 3000, 1600)).toEqual({ largura: 1600, altura: 1200 })
  })
  it('reduz retrato pelo lado maior', () => {
    expect(calcularDimensoes(3024, 4032, 400)).toEqual({ largura: 300, altura: 400 })
  })
  it('nunca amplia', () => {
    expect(calcularDimensoes(800, 600, 1600)).toEqual({ largura: 800, altura: 600 })
  })
  it('protege dimensões inválidas', () => {
    expect(calcularDimensoes(0, 100, 400)).toEqual({ largura: 0, altura: 0 })
  })
  it('extensão pelo mime', () => {
    expect(extensaoDoMime('image/webp')).toBe('webp')
    expect(extensaoDoMime('image/jpeg')).toBe('jpg')
  })
})

describe('calcularPrazo', () => {
  const hoje = new Date('2026-03-11T12:00:00')
  it('usa prazo_dias', () => {
    const p = calcularPrazo({ data_inicio: '2026-03-01', prazo_dias: 100, previsao_termino: null }, hoje)
    expect(p).toMatchObject({ definido: true, decorridos: 10, total: 100, restantes: 90, percentual: 10, atrasado: false, termino: '2026-06-09' })
  })
  it('deriva total da previsão quando não há prazo', () => {
    const p = calcularPrazo({ data_inicio: '2026-03-01', prazo_dias: null, previsao_termino: '2026-03-21' }, hoje)
    expect(p.total).toBe(20)
    expect(p.percentual).toBe(50)
  })
  it('marca atraso e limita percentual a 100', () => {
    const p = calcularPrazo({ data_inicio: '2026-01-01', prazo_dias: 30, previsao_termino: null }, hoje)
    expect(p.atrasado).toBe(true)
    expect(p.percentual).toBe(100)
    expect(p.restantes).toBeLessThan(0)
  })
  it('sem início não está definido', () => {
    expect(calcularPrazo({ data_inicio: null, prazo_dias: 30, previsao_termino: null }, hoje).definido).toBe(false)
  })
  it('previsão por prazo', () => {
    expect(previsaoPorPrazo('2026-01-01', 31)).toBe('2026-02-01')
    expect(previsaoPorPrazo(null, 10)).toBeNull()
  })
})

describe('formato', () => {
  it('bytes em pt-BR', () => {
    expect(formatarBytes(0)).toBe('0 B')
    expect(formatarBytes(512)).toBe('512 B')
    expect(formatarBytes(1536)).toBe('1,5 KB')
    expect(formatarBytes(2 * 1024 ** 3)).toBe('2,0 GB')
    expect(formatarBytes(150 * 1024 ** 2)).toBe('150 MB')
  })
  it('percentual de uso limitado', () => {
    expect(percentualUso(50, 100)).toBe(50)
    expect(percentualUso(500, 100)).toBe(100)
    expect(percentualUso(10, 0)).toBe(0)
  })
  it('códigos de relatório', () => {
    expect(codigoRelatorio(38)).toBe('RD-38')
    expect(numeroRelatorio(7)).toBe('007')
  })
  it('lê números brasileiros', () => {
    expect(lerNumero('1.234,56')).toBe(1234.56)
    expect(lerNumero('12.5')).toBe(12.5)
    expect(lerNumero('R$ 10,00')).toBe(10)
    expect(lerNumero('')).toBeNull()
    expect(lerNumero('abc')).toBeNull()
  })
  it('iniciais, busca e WhatsApp', () => {
    expect(iniciais('Neyliane Freitas Canuto')).toBe('NC')
    expect(normalizar('Construção São João')).toBe('construcao sao joao')
    expect(telefoneWhatsApp('(21) 99876-5432')).toBe('5521998765432')
    expect(telefoneWhatsApp('+55 21 99876-5432')).toBe('5521998765432')
  })
})

describe('permissões', () => {
  it('colaborador não gerencia nem aprova', () => {
    const p = permissoes('colaborador')
    expect(p.criarRelatorio).toBe(true)
    expect(p.editarObra).toBe(true)
    expect(p.excluirObra).toBe(false)
    expect(p.gerenciarEquipe).toBe(false)
    expect(p.aprovarRelatorio).toBe(false)
  })
  it('cliente só lê', () => {
    const p = permissoes('cliente')
    expect(p.portalCliente).toBe(true)
    expect(p.criarRelatorio).toBe(false)
    expect(podeEditarRelatorio('cliente', 'preenchendo')).toBe(false)
  })
  it('aprovado só gestor edita', () => {
    expect(podeEditarRelatorio('colaborador', 'aprovado')).toBe(false)
    expect(podeEditarRelatorio('admin', 'aprovado')).toBe(true)
    expect(podeEditarRelatorio('colaborador', 'revisar')).toBe(true)
  })
  it('transições do fluxo', () => {
    expect(transicoesPermitidas('colaborador', 'preenchendo')).toEqual(['revisar'])
    expect(transicoesPermitidas('colaborador', 'aprovado')).toEqual([])
    expect(transicoesPermitidas('admin', 'revisar')).toEqual(['preenchendo', 'aprovado'])
    expect(transicoesPermitidas('cliente', 'aprovado')).toEqual([])
  })
  it('rotas e papéis criáveis', () => {
    expect(rotaInicial('cliente')).toBe('/portal')
    expect(rotaInicial('master')).toBe('/painel')
    expect(papeisCriaveis('colaborador')).toEqual([])
    expect(papeisCriaveis('admin')).not.toContain('master')
  })
})

describe('horário', () => {
  it('converte e calcula horas com intervalo', () => {
    expect(paraMinutos('08:30:00')).toBe(510)
    expect(minutosTrabalhados('08:00', '17:00', '12:00', '13:00')).toBe(480)
    expect(formatarDuracao(480)).toBe('08h00')
  })
  it('ignora intervalo incompleto e vira a meia-noite', () => {
    expect(minutosTrabalhados('08:00', '12:00', '10:00', null)).toBe(240)
    expect(minutosTrabalhados('22:00', '06:00')).toBe(480)
    expect(minutosTrabalhados(null, '06:00')).toBeNull()
    expect(formatarDuracao(null)).toBe('—')
  })
})

describe('csv e senha', () => {
  it('escapa células', () => {
    expect(celulaCsv('a;b')).toBe('"a;b"')
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""')
    expect(celulaCsv(1.5)).toBe('1,5')
    expect(gerarCsv(['A', 'B'], [[1, null]])).toBe('A;B\r\n1;')
  })
  it('gera senha legível com dígito e maiúscula', () => {
    let i = 0
    const s = gerarSenha(10, (n) => i++ % n)
    expect(s).toHaveLength(10)
    expect(s).toMatch(/[A-Z]/)
    expect(s).toMatch(/[2-9]/)
    expect(s).not.toMatch(/[01lIO]/)
    expect(gerarSenha(3)).toHaveLength(6)
  })
  it('texto de acesso', () => {
    const t = textoDeAcesso({ nome: 'Carlos Souza', email: 'c@x.com', senha: 'Ab3xyz', url: 'https://obtra.app', empresa: 'Aurora' })
    expect(t).toContain('Olá, Carlos!')
    expect(t).toContain('Senha: Ab3xyz')
  })
})

describe('campo de hora (24 h)', async () => {
  const { completarHora } = await import('@/componentes/ui')
  it('completa o que foi digitado', () => {
    expect(completarHora('7')).toBe('07:00')
    expect(completarHora('730')).toBe('07:30')
    expect(completarHora('17:45')).toBe('17:45')
    expect(completarHora('')).toBe('')
  })
  it('recusa hora inválida', () => {
    expect(completarHora('2500')).toBeNull()
    expect(completarHora('1275')).toBeNull()
  })
})
