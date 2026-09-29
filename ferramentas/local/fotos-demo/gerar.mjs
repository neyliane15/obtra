/**
 * Gera as "fotos de obra" da demonstração (ilustrações pintadas em canvas, com
 * grão e vinheta de foto) e grava em WebP — foto 1600×1200 q0,72 e miniatura
 * 400×300 q0,6, exatamente o que o app gera no navegador.
 *
 * Só precisa rodar de novo se mudar as cenas; os .webp ficam versionados.
 * Uso: node ferramentas/local/fotos-demo/gerar.mjs
 * (usa o Chromium do Playwright; PW_CHROMIUM aponta outro executável)
 */
import { writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const AQUI = dirname(fileURLToPath(import.meta.url))

/** nome do arquivo → cena e variação */
export const CENAS = {
  'vista-torre': { cena: 'torre', semente: 3, andares: 6, clima: 'claro', hora: 'manha' },
  'vista-armacao': { cena: 'armacao', semente: 7, clima: 'claro' },
  'vista-formas': { cena: 'torre', semente: 11, andares: 5, clima: 'nublado', perto: true },
  'vista-chuva': { cena: 'laje', semente: 5, clima: 'chuvoso' },
  'vista-concretagem': { cena: 'concretagem', semente: 9, clima: 'claro' },
  'vista-laje-pronta': { cena: 'laje', semente: 21, clima: 'claro' },
  'vista-alvenaria': { cena: 'alvenaria', semente: 13, clima: 'claro' },
  'vista-eletrica': { cena: 'alvenaria', semente: 17, clima: 'nublado', eletrica: true },
  'paulista-fachada': { cena: 'fachada', semente: 4, clima: 'nublado' },
  'paulista-balancim': { cena: 'fachada', semente: 8, clima: 'claro', perto: true },
  'galpao-parado': { cena: 'galpao', semente: 6, clima: 'chuvoso' },
  'escola-entregue': { cena: 'escola', semente: 2, clima: 'claro' },
  'clinica-terreno': { cena: 'terreno', semente: 12, clima: 'claro' },
  'flores-fundacao': { cena: 'fundacao', semente: 15, clima: 'claro' },
  'vista-capa': { cena: 'torre', semente: 1, andares: 7, clima: 'claro', hora: 'tarde' },
}

/* O pintor roda dentro da página. */
function pintar(opcoes) {
  const W = 1600
  const H = 1200
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')
  let s = opcoes.semente * 9301 + 49297
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const entre = (a, b) => a + (b - a) * r()
  const clima = opcoes.clima

  /* ---------------------------------------------------------- céu e chão */
  function ceu(horizonte) {
    const g = c.createLinearGradient(0, 0, 0, horizonte)
    if (clima === 'chuvoso') {
      g.addColorStop(0, '#5d6873'); g.addColorStop(1, '#a3adb5')
    } else if (clima === 'nublado') {
      g.addColorStop(0, '#8fa3b8'); g.addColorStop(1, '#d9e0e6')
    } else if (opcoes.hora === 'tarde') {
      g.addColorStop(0, '#4f86c6'); g.addColorStop(0.7, '#a9cbe8'); g.addColorStop(1, '#f3dcc0')
    } else {
      g.addColorStop(0, '#3f7fcf'); g.addColorStop(1, '#bcd9f2')
    }
    c.fillStyle = g
    c.fillRect(0, 0, W, horizonte + 2)
    const nuvens = clima === 'claro' ? 5 : 14
    c.save()
    c.filter = `blur(${clima === 'claro' ? 18 : 30}px)`
    for (let i = 0; i < nuvens; i++) {
      const x = entre(-100, W + 100)
      const y = entre(20, horizonte * (clima === 'claro' ? 0.45 : 0.8))
      c.fillStyle = clima === 'chuvoso' ? `rgba(70,78,88,${entre(0.4, 0.7)})` : `rgba(255,255,255,${entre(0.45, 0.85)})`
      for (let k = 0; k < 5; k++) {
        c.beginPath()
        c.ellipse(x + entre(-120, 120), y + entre(-25, 25), entre(80, 220), entre(30, 70), 0, 0, Math.PI * 2)
        c.fill()
      }
    }
    c.restore()
  }
  function chao(horizonte, cor1 = '#8a7159', cor2 = '#6b5642') {
    const g = c.createLinearGradient(0, horizonte, 0, H)
    g.addColorStop(0, cor1)
    g.addColorStop(1, cor2)
    c.fillStyle = g
    c.fillRect(0, horizonte, W, H - horizonte)
    for (let i = 0; i < 2600; i++) {
      const y = entre(horizonte, H)
      const t = (y - horizonte) / (H - horizonte)
      c.fillStyle = `rgba(${r() > 0.5 ? '40,30,20' : '200,180,150'},${0.12 + t * 0.15})`
      c.fillRect(entre(0, W), y, 1 + t * 4, 1 + t * 3)
    }
    if (clima === 'chuvoso') {
      for (let i = 0; i < 9; i++) {
        const y = entre(horizonte + 40, H - 40)
        const t = (y - horizonte) / (H - horizonte)
        c.fillStyle = 'rgba(160,170,180,0.55)'
        c.beginPath()
        c.ellipse(entre(0, W), y, 60 + t * 220, 8 + t * 30, 0, 0, Math.PI * 2)
        c.fill()
      }
    }
  }
  function chuva() {
    if (clima !== 'chuvoso') return
    c.strokeStyle = 'rgba(220,228,236,0.28)'
    c.lineWidth = 1.3
    for (let i = 0; i < 900; i++) {
      const x = entre(-100, W)
      const y = entre(0, H)
      c.beginPath()
      c.moveTo(x, y)
      c.lineTo(x + 7, y + 26)
      c.stroke()
    }
  }

  /* ------------------------------------------------------------ peças */
  function operario(x, y, esc = 1, capacete = '#f7f7f2') {
    c.save()
    c.translate(x, y)
    c.scale(esc, esc)
    c.fillStyle = '#2c3440'
    c.fillRect(-9, -34, 7, 34)
    c.fillRect(2, -34, 7, 34)
    c.fillStyle = r() > 0.5 ? '#f08a1c' : '#d9e021'
    c.fillRect(-12, -68, 24, 36)
    c.fillStyle = '#e9eef2'
    c.fillRect(-12, -52, 24, 3)
    c.fillStyle = '#b98363'
    c.beginPath(); c.arc(0, -78, 9, 0, Math.PI * 2); c.fill()
    c.fillStyle = capacete
    c.beginPath(); c.arc(0, -81, 10.5, Math.PI, 0); c.fill()
    c.fillRect(-13, -82, 26, 3)
    c.restore()
  }
  function grua(x, base, altura, lanca, lado = 1) {
    c.save()
    c.strokeStyle = '#e7b416'
    c.fillStyle = '#e7b416'
    const larg = 26
    const topo = base - altura
    c.lineWidth = 3
    c.strokeRect(x - larg / 2, topo, larg, altura)
    c.lineWidth = 1.6
    for (let y = topo; y < base; y += larg) {
      c.beginPath(); c.moveTo(x - larg / 2, y); c.lineTo(x + larg / 2, y + larg); c.moveTo(x + larg / 2, y); c.lineTo(x - larg / 2, y + larg); c.stroke()
    }
    // lança e contralança
    const y0 = topo - 4
    c.lineWidth = 3
    c.beginPath(); c.moveTo(x - lanca * 0.3 * lado, y0); c.lineTo(x + lanca * lado, y0); c.stroke()
    c.beginPath(); c.moveTo(x - lanca * 0.3 * lado, y0 - 18); c.lineTo(x + lanca * lado, y0 - 6); c.stroke()
    c.lineWidth = 1.2
    for (let i = -0.3; i < 1; i += 0.035) {
      const xx = x + lanca * i * lado
      c.beginPath(); c.moveTo(xx, y0); c.lineTo(xx + 14 * lado, y0 - 16 + i * 10); c.stroke()
    }
    // torre de topo e tirantes
    c.lineWidth = 2
    c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y0 - 70); c.lineTo(x + lanca * 0.7 * lado, y0 - 8); c.moveTo(x, y0 - 70); c.lineTo(x - lanca * 0.3 * lado, y0 - 16); c.stroke()
    // contrapeso e cabine
    c.fillStyle = '#6b7280'
    c.fillRect(x - lanca * 0.3 * lado - (lado > 0 ? 0 : 40), y0 - 4, 40, 26)
    c.fillStyle = '#e7b416'
    c.fillRect(x - 14, y0 + 2, 28, 22)
    c.fillStyle = '#9fc4e6'
    c.fillRect(x - 10, y0 + 6, 20, 10)
    // carrinho, cabo e carga
    const xc = x + lanca * entre(0.45, 0.8) * lado
    c.strokeStyle = '#333'
    c.lineWidth = 1.2
    c.beginPath(); c.moveTo(xc, y0); c.lineTo(xc, y0 + entre(160, 320)); c.stroke()
    c.restore()
  }
  /** Prédio em estrutura: fachada frontal + lateral em fuga. */
  function torre({ x, base, largura, andares, construidos, alvenaria, peAndar, fundo = 0.35 }) {
    const lat = largura * fundo
    const sobe = lat * 0.28
    const topoY = base - construidos * peAndar
    // lateral
    for (let a = 0; a < construidos; a++) {
      const y = base - (a + 1) * peAndar
      c.fillStyle = a < alvenaria ? '#9c5a3c' : '#6f757c'
      c.beginPath()
      c.moveTo(x + largura, y + peAndar); c.lineTo(x + largura + lat, y + peAndar - sobe); c.lineTo(x + largura + lat, y - sobe); c.lineTo(x + largura, y)
      c.closePath(); c.fill()
      if (a >= alvenaria) {
        c.fillStyle = '#2d3238'
        c.beginPath()
        c.moveTo(x + largura, y + peAndar - 10); c.lineTo(x + largura + lat, y + peAndar - 10 - sobe); c.lineTo(x + largura + lat, y + 10 - sobe); c.lineTo(x + largura, y + 10)
        c.closePath(); c.fill()
      }
    }
    // frente
    const vaos = Math.max(4, Math.round(largura / 110))
    const passo = largura / vaos
    for (let a = 0; a < construidos; a++) {
      const y = base - (a + 1) * peAndar
      // interior escuro
      c.fillStyle = '#34393f'
      c.fillRect(x, y, largura, peAndar)
      if (a < alvenaria) {
        c.fillStyle = a < alvenaria - 2 ? '#d8d3c8' : '#b8643e'
        c.fillRect(x, y, largura, peAndar)
        if (a >= alvenaria - 2) {
          c.strokeStyle = 'rgba(80,40,25,0.35)'
          c.lineWidth = 1
          for (let yy = y + 8; yy < y + peAndar; yy += 9) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + largura, yy); c.stroke() }
        }
        c.fillStyle = a < alvenaria - 2 ? '#3d5367' : '#2a2e33'
        for (let v = 0; v < vaos; v++) c.fillRect(x + v * passo + passo * 0.25, y + peAndar * 0.28, passo * 0.5, peAndar * 0.45)
      }
      // laje
      c.fillStyle = '#a9aeb3'
      c.fillRect(x - 4, y - 2, largura + 8, 11)
      c.fillStyle = 'rgba(0,0,0,0.15)'
      c.fillRect(x - 4, y + 7, largura + 8, 3)
    }
    // pilares
    c.fillStyle = '#9ea3a8'
    for (let v = 0; v <= vaos; v++) c.fillRect(x + v * passo - 7, topoY, 14, base - topoY)
    // fôrmas e arranques no topo
    if (construidos < andares) {
      c.fillStyle = '#b8894f'
      c.fillRect(x - 6, topoY - 16, largura + 12, 16)
      c.strokeStyle = '#6a3c1f'
      c.lineWidth = 2
      for (let v = 0; v <= vaos; v++) {
        for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + v * passo + k * 3, topoY - 16); c.lineTo(x + v * passo + k * 3 + entre(-2, 2), topoY - 16 - peAndar * 0.8); c.stroke() }
      }
      // escoras
      c.strokeStyle = '#8a8f96'
      c.lineWidth = 2
      for (let k = 0; k < vaos * 3; k++) { const xx = x + 10 + k * (largura / (vaos * 3)); c.beginPath(); c.moveTo(xx, topoY); c.lineTo(xx, topoY + peAndar); c.stroke() }
    }
    // tela de proteção nos andares de cima
    c.fillStyle = 'rgba(40,120,70,0.35)'
    c.fillRect(x - 10, topoY, 10, peAndar * Math.min(3, construidos))
  }
  function tapume(y, cor = '#1e3a8a') {
    c.fillStyle = cor
    c.fillRect(0, y - 90, W, 90)
    c.fillStyle = 'rgba(255,255,255,0.12)'
    for (let x = 0; x < W; x += 120) c.fillRect(x, y - 90, 2, 90)
    c.fillStyle = '#f29a2e'
    c.fillRect(0, y - 90, W, 6)
    c.fillStyle = 'rgba(0,0,0,0.25)'
    c.fillRect(0, y - 4, W, 4)
  }

  /* ------------------------------------------------------------ cenas */
  const cenas = {
    torre() {
      const hz = opcoes.perto ? 900 : 860
      ceu(hz)
      const pe = opcoes.perto ? 120 : 64
      const largura = opcoes.perto ? 1000 : 640
      const x = opcoes.perto ? 180 : entre(360, 520)
      grua(x + largura * 0.25, hz + 10, (opcoes.andares + 3) * pe + 60, opcoes.perto ? 900 : 760, r() > 0.5 ? 1 : -1)
      chao(hz)
      torre({ x, base: hz + 20, largura, andares: 14, construidos: opcoes.andares, alvenaria: Math.max(0, opcoes.andares - 3), peAndar: pe })
      if (!opcoes.perto) tapume(hz + 150)
      // canteiro: pilhas de material
      c.fillStyle = '#a45a33'
      for (let i = 0; i < 4; i++) c.fillRect(entre(80, 380), entre(hz + 190, hz + 280), 90, 40)
      c.fillStyle = '#7e8791'
      c.beginPath(); c.moveTo(1150, hz + 330); c.lineTo(1290, hz + 230); c.lineTo(1430, hz + 330); c.fill()
      for (let i = 0; i < 5; i++) operario(entre(200, 1400), entre(hz + 220, hz + 320), entre(1.1, 1.5))
      chuva()
    },
    armacao() {
      ceu(700)
      // laje em primeiro plano
      c.fillStyle = '#9da2a6'
      c.fillRect(0, 700, W, 500)
      for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(60,60,60,${entre(0.05, 0.2)})`; c.fillRect(entre(0, W), entre(700, H), 2, 2) }
      // pilares: gaiolas de aço
      const pilares = [[260, 1.4], [760, 1], [1180, 0.8], [1450, 0.6]]
      for (const [px, e] of pilares) {
        const base = 700 + 420 * e
        const alto = 620 * e
        const larg = 90 * e
        // fôrma de madeira de um lado
        c.fillStyle = '#c39a62'
        c.fillRect(px - larg * 0.9, base - alto * 0.45, larg * 0.35, alto * 0.45)
        c.strokeStyle = '#5c3a22'
        c.lineWidth = 5 * e
        for (let k = 0; k < 5; k++) { const xx = px - larg / 2 + (k * larg) / 4; c.beginPath(); c.moveTo(xx, base); c.lineTo(xx + entre(-3, 3), base - alto); c.stroke() }
        c.lineWidth = 2.5 * e
        c.strokeStyle = '#6e4a33'
        for (let yy = base - 20 * e; yy > base - alto + 30 * e; yy -= 34 * e) c.strokeRect(px - larg / 2 - 3, yy, larg + 6, 4 * e)
      }
      // tábuas e escoras
      c.fillStyle = '#b98b52'
      c.fillRect(0, 1090, 700, 34)
      c.fillRect(120, 1040, 540, 28)
      operario(1000, 1030, 1.9, '#ffd21f')
      operario(560, 900, 1.4)
    },
    laje() {
      ceu(520)
      // cidade ao fundo
      for (let i = 0; i < 18; i++) {
        const w = entre(60, 160), h = entre(60, 240), x = entre(0, W)
        c.fillStyle = `rgba(${clima === 'claro' ? '120,140,165' : '120,128,138'},${entre(0.5, 0.8)})`
        c.fillRect(x, 520 - h, w, h)
      }
      // superfície da laje em perspectiva
      const g = c.createLinearGradient(0, 520, 0, H)
      g.addColorStop(0, clima === 'chuvoso' ? '#7b8187' : '#b5b8ba')
      g.addColorStop(1, clima === 'chuvoso' ? '#4e5358' : '#8e9296')
      c.fillStyle = g
      c.beginPath(); c.moveTo(0, 560); c.lineTo(W, 540); c.lineTo(W, H); c.lineTo(0, H); c.fill()
      // juntas e arranques de pilar
      c.strokeStyle = 'rgba(40,40,40,0.25)'
      for (let k = 0; k < 12; k++) { c.beginPath(); c.moveTo(W / 2 + (k - 6) * 40, 550); c.lineTo(W / 2 + (k - 6) * 330, H); c.stroke() }
      for (const [x, y, e] of [[300, 650, 0.7], [900, 620, 0.55], [1350, 700, 0.8], [620, 900, 1.2]]) {
        c.strokeStyle = '#5f3c28'
        c.lineWidth = 4 * e
        for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x + k * 14 * e, y); c.lineTo(x + k * 14 * e, y - 140 * e); c.stroke() }
      }
      if (clima === 'chuvoso') {
        // lona azul e poças refletindo o céu
        c.fillStyle = '#2f5fa8'
        c.beginPath(); c.moveTo(80, 1000); c.lineTo(760, 930); c.lineTo(900, 1180); c.lineTo(40, 1200); c.fill()
        c.strokeStyle = 'rgba(255,255,255,0.18)'
        for (let k = 0; k < 8; k++) { c.beginPath(); c.moveTo(80 + k * 90, 995 - k * 9); c.lineTo(60 + k * 110, 1195); c.stroke() }
        for (let i = 0; i < 12; i++) {
          c.fillStyle = 'rgba(190,200,210,0.55)'
          c.beginPath(); c.ellipse(entre(900, W), entre(620, 1150), entre(40, 180), entre(8, 30), 0, 0, Math.PI * 2); c.fill()
        }
      } else {
        operario(1100, 860, 1.6)
        operario(1250, 820, 1.4, '#ffd21f')
        // mangueira de cura
        c.strokeStyle = '#2d6b3a'
        c.lineWidth = 6
        c.beginPath(); c.moveTo(0, 1100); c.bezierCurveTo(400, 980, 700, 1150, 1080, 870); c.stroke()
      }
      chuva()
    },
    concretagem() {
      ceu(760)
      chao(760, '#a5a7a8', '#7b7e80')
      // concreto fresco
      c.fillStyle = '#8b8f92'
      c.beginPath(); c.moveTo(0, 820); c.lineTo(W, 780); c.lineTo(W, H); c.lineTo(0, H); c.fill()
      for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(210,210,205,0.35)'; c.beginPath(); c.ellipse(entre(0, W), entre(830, H), entre(30, 120), entre(6, 20), 0, 0, Math.PI * 2); c.fill() }
      // lança da bomba
      c.strokeStyle = '#f2f2ee'
      c.lineCap = 'round'
      c.lineWidth = 34
      c.beginPath(); c.moveTo(1700, 900); c.lineTo(1320, 180); c.lineTo(760, 120); c.lineTo(520, 560); c.stroke()
      c.strokeStyle = '#e46b16'
      c.lineWidth = 8
      c.beginPath(); c.moveTo(1700, 900); c.lineTo(1320, 180); c.lineTo(760, 120); c.lineTo(520, 560); c.stroke()
      c.strokeStyle = '#1b1b1b'
      c.lineWidth = 22
      c.beginPath(); c.moveTo(520, 560); c.quadraticCurveTo(500, 760, 560, 860); c.stroke()
      c.lineCap = 'butt'
      operario(520, 930, 1.9)
      operario(700, 950, 1.9, '#ffd21f')
      operario(380, 900, 1.7)
      // mangote do vibrador
      c.strokeStyle = '#222'
      c.lineWidth = 7
      c.beginPath(); c.moveTo(700, 880); c.quadraticCurveTo(820, 1000, 980, 960); c.stroke()
    },
    alvenaria() {
      // interior: parede de blocos cerâmicos
      c.fillStyle = '#6e7277'
      c.fillRect(0, 0, W, H)
      c.fillStyle = '#9ea2a5'
      c.fillRect(0, 0, W, 90)
      const topo = opcoes.eletrica ? 120 : 300
      const bw = 170, bh = 110
      for (let y = H - 150; y > topo; y -= bh + 12) {
        const off = ((H - y) / (bh + 12)) % 2 ? bw / 2 : 0
        for (let x = -off; x < W; x += bw + 12) {
          const tom = entre(-12, 12)
          c.fillStyle = `rgb(${190 + tom},${104 + tom},${64 + tom})`
          c.fillRect(x, y - bh, bw, bh)
          c.fillStyle = 'rgba(0,0,0,0.12)'
          c.fillRect(x, y - 14, bw, 14)
        }
      }
      c.fillStyle = 'rgba(200,196,188,0.35)'
      for (let y = H - 150; y > topo; y -= bh + 12) c.fillRect(0, y, W, 12)
      if (opcoes.eletrica) {
        // rasgos com eletrodutos amarelos
        c.strokeStyle = '#f1d21c'
        c.lineWidth = 16
        for (const x of [420, 980]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 700); c.bezierCurveTo(x, 760, x + 60, 760, x + 60, 800); c.stroke() }
        c.fillStyle = '#e9e7df'
        c.fillRect(460, 780, 60, 90)
        c.fillRect(1020, 780, 60, 90)
      } else {
        // linha de nível e ferramentas
        c.strokeStyle = '#e2231a'
        c.lineWidth = 2
        c.beginPath(); c.moveTo(0, topo - 30); c.lineTo(W, topo - 50); c.stroke()
        operario(1200, 1150, 3.2)
      }
      // piso
      c.fillStyle = '#8b8d8f'
      c.fillRect(0, H - 150, W, 150)
      c.fillStyle = '#b9a58a'
      c.fillRect(100, H - 110, 260, 70)
    },
    fachada() {
      ceu(1200)
      const x = opcoes.perto ? 100 : 380
      const w = opcoes.perto ? 1400 : 840
      // prédio corporativo alto
      c.fillStyle = '#9aa3ab'
      c.fillRect(x, 60, w, H)
      const col = opcoes.perto ? 6 : 8
      const lin = opcoes.perto ? 8 : 16
      const cw = w / col, lh = (H - 60) / lin
      for (let i = 0; i < col; i++) {
        for (let j = 0; j < lin; j++) {
          const novo = j < lin * 0.55 && i < col * 0.6
          c.fillStyle = novo ? (r() > 0.5 ? '#3c5670' : '#46637f') : '#6f7a84'
          c.fillRect(x + i * cw + 6, 60 + j * lh + 6, cw - 12, lh - 12)
          c.fillStyle = novo ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'
          c.beginPath(); c.moveTo(x + i * cw + 6, 60 + j * lh + 6); c.lineTo(x + i * cw + cw * 0.5, 60 + j * lh + 6); c.lineTo(x + i * cw + 6, 60 + j * lh + lh * 0.6); c.fill()
          if (novo) { c.strokeStyle = '#c9ced3'; c.lineWidth = 4; c.strokeRect(x + i * cw + 4, 60 + j * lh + 4, cw - 8, lh - 8) }
        }
      }
      // balancins
      for (const bx of opcoes.perto ? [620] : [x + w * 0.62, x + w * 0.18]) {
        const by = opcoes.perto ? 640 : entre(500, 800)
        c.strokeStyle = '#222'
        c.lineWidth = 2
        c.beginPath(); c.moveTo(bx + 20, 0); c.lineTo(bx + 20, by); c.moveTo(bx + (opcoes.perto ? 380 : 180), 0); c.lineTo(bx + (opcoes.perto ? 380 : 180), by); c.stroke()
        const bw = opcoes.perto ? 400 : 200
        c.fillStyle = '#d7d9db'
        c.fillRect(bx, by, bw, opcoes.perto ? 26 : 14)
        c.strokeStyle = '#e46b16'
        c.lineWidth = opcoes.perto ? 5 : 3
        c.strokeRect(bx, by - (opcoes.perto ? 70 : 36), bw, opcoes.perto ? 70 : 36)
        const e = opcoes.perto ? 1.5 : 0.7
        operario(bx + bw * 0.3, by, e)
        operario(bx + bw * 0.7, by, e, '#ffd21f')
      }
      // andaime na base
      c.strokeStyle = '#c7ccd1'
      c.lineWidth = 4
      for (let yy = H - 300; yy < H; yy += 70) { c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke() }
      for (let xx = 0; xx < W; xx += 110) { c.beginPath(); c.moveTo(xx, H - 300); c.lineTo(xx, H); c.stroke() }
    },
    galpao() {
      ceu(760)
      chao(760, '#7d6a55', '#5a4b3c')
      // pórticos metálicos em perspectiva
      for (let k = 0; k < 8; k++) {
        const e = 1 - k * 0.1
        const cx = 820 + k * 40
        const base = 760 + 260 * e
        const hw = 560 * e
        const hh = 380 * e
        c.strokeStyle = '#42505e'
        c.lineWidth = 16 * e
        c.beginPath(); c.moveTo(cx - hw, base); c.lineTo(cx - hw, base - hh); c.lineTo(cx, base - hh - 120 * e); c.lineTo(cx + hw, base - hh); c.lineTo(cx + hw, base); c.stroke()
      }
      c.strokeStyle = '#56626e'
      c.lineWidth = 5
      c.beginPath(); c.moveTo(260, 640); c.lineTo(1100, 730); c.moveTo(820, 520); c.lineTo(1100, 610); c.moveTo(1380, 640); c.lineTo(1100, 730); c.stroke()
      // cerca e placa de embargo
      c.strokeStyle = '#d9d9d9'
      c.lineWidth = 3
      for (let x = 0; x < W; x += 60) { c.beginPath(); c.moveTo(x, 1080); c.lineTo(x, 980); c.stroke() }
      c.beginPath(); c.moveTo(0, 990); c.lineTo(W, 990); c.moveTo(0, 1040); c.lineTo(W, 1040); c.stroke()
      c.fillStyle = '#f3c318'
      c.fillRect(1150, 900, 260, 140)
      c.fillStyle = '#1b1b1b'
      c.fillRect(1170, 925, 220, 16)
      c.fillRect(1170, 960, 180, 10)
      c.fillRect(1170, 985, 200, 10)
      c.fillStyle = '#555'
      c.fillRect(1270, 1040, 12, 120)
      chuva()
    },
    escola() {
      ceu(760)
      // gramado
      c.fillStyle = '#6f9a4a'
      c.fillRect(0, 760, W, H - 760)
      for (let i = 0; i < 1800; i++) { c.fillStyle = `rgba(${r() > 0.5 ? '40,80,30' : '150,190,110'},0.35)`; c.fillRect(entre(0, W), entre(760, H), 2, 5) }
      // prédio térreo pintado
      c.fillStyle = '#f1ede3'
      c.fillRect(160, 470, 1280, 330)
      c.fillStyle = '#2b55b8'
      c.fillRect(160, 700, 1280, 100)
      // telhado novo
      c.fillStyle = '#b8472f'
      c.beginPath(); c.moveTo(120, 480); c.lineTo(800, 330); c.lineTo(1480, 480); c.fill()
      c.strokeStyle = 'rgba(0,0,0,0.15)'
      for (let k = 0; k < 40; k++) { c.beginPath(); c.moveTo(130 + k * 34, 480); c.lineTo(800, 332); c.stroke() }
      c.fillStyle = '#6b8fb3'
      for (let k = 0; k < 9; k++) c.fillRect(220 + k * 135, 520, 80, 120)
      // rampa de acessibilidade
      c.fillStyle = '#c9c4ba'
      c.beginPath(); c.moveTo(640, 800); c.lineTo(960, 800); c.lineTo(960, 760); c.fill()
      c.strokeStyle = '#8a8f96'
      c.lineWidth = 4
      c.beginPath(); c.moveTo(640, 770); c.lineTo(960, 730); c.stroke()
      // árvores
      for (const [x, e] of [[70, 1.2], [1520, 1]]) {
        c.fillStyle = '#5a4030'
        c.fillRect(x - 12 * e, 560, 24 * e, 260)
        c.fillStyle = '#3f6f35'
        c.beginPath(); c.arc(x, 520, 140 * e, 0, Math.PI * 2); c.fill()
        c.fillStyle = 'rgba(120,170,90,0.4)'
        c.beginPath(); c.arc(x - 40, 480, 70 * e, 0, Math.PI * 2); c.fill()
      }
    },
    terreno() {
      ceu(720)
      c.fillStyle = '#6f9a4a'
      c.fillRect(0, 720, W, H)
      chao(820, '#9c7a55', '#7a5d40')
      tapume(900, '#1e3a8a')
      // placa de obra
      c.fillStyle = '#555'
      c.fillRect(1030, 560, 14, 260)
      c.fillRect(1330, 560, 14, 260)
      c.fillStyle = '#0b1f3a'
      c.fillRect(980, 420, 420, 220)
      c.fillStyle = '#f29a2e'
      c.fillRect(980, 420, 420, 18)
      c.fillStyle = '#ffffff'
      c.fillRect(1010, 470, 260, 22)
      c.fillRect(1010, 510, 330, 12)
      c.fillRect(1010, 535, 300, 12)
      c.fillRect(1010, 560, 220, 12)
      c.fillRect(1010, 600, 150, 12)
      // topografia: piquetes
      c.fillStyle = '#e2231a'
      for (let i = 0; i < 8; i++) c.fillRect(entre(100, 900), entre(960, 1150), 6, 30)
    },
    fundacao() {
      ceu(720)
      chao(720, '#8a6a4c', '#5d4631')
      // perfuratriz
      c.fillStyle = '#e7b416'
      c.fillRect(900, 820, 380, 150)
      c.fillStyle = '#2b2b2b'
      c.fillRect(880, 960, 420, 50)
      c.fillStyle = '#1f1f1f'
      for (let k = 0; k < 7; k++) { c.beginPath(); c.arc(900 + k * 64, 1010, 22, 0, Math.PI * 2); c.fill() }
      c.fillStyle = '#e7b416'
      c.fillRect(860, 60, 36, 900)
      c.strokeStyle = '#5b5b5b'
      c.lineWidth = 16
      c.beginPath(); c.moveTo(830, 120); c.lineTo(830, 990); c.stroke()
      c.strokeStyle = '#8c8c8c'
      c.lineWidth = 4
      for (let y = 140; y < 980; y += 24) { c.beginPath(); c.moveTo(812, y); c.lineTo(848, y + 12); c.stroke() }
      c.fillStyle = '#9fc4e6'
      c.fillRect(1180, 840, 80, 60)
      // armaduras de estaca no chão
      c.strokeStyle = '#6e4a33'
      c.lineWidth = 5
      for (let k = 0; k < 3; k++) { const y = 1060 + k * 40; c.beginPath(); c.moveTo(120, y); c.lineTo(640, y - 30); c.stroke(); for (let x = 140; x < 640; x += 40) { c.beginPath(); c.ellipse(x, y - ((x - 120) / 520) * 30, 6, 18, 0, 0, Math.PI * 2); c.stroke() } }
      operario(720, 1000, 1.6)
      operario(1400, 1020, 1.6, '#ffd21f')
    },
  }
  cenas[opcoes.cena]()

  /* ------------------------------------------------ "revelação" da foto */
  const img = c.getImageData(0, 0, W, H)
  const d = img.data
  const quente = opcoes.hora === 'tarde' ? 10 : clima === 'claro' ? 4 : -2
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 16
    d[i] = d[i] + n + quente
    d[i + 1] = d[i + 1] + n
    d[i + 2] = d[i + 2] + n - quente
  }
  c.putImageData(img, 0, 0)
  const copia = document.createElement('canvas')
  copia.width = W
  copia.height = H
  const cc = copia.getContext('2d')
  cc.filter = 'blur(0.7px) contrast(1.04) saturate(0.92)'
  cc.drawImage(cv, 0, 0)
  const v = cc.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(10,15,25,0.38)')
  cc.fillStyle = v
  cc.fillRect(0, 0, W, H)

  const mini = document.createElement('canvas')
  mini.width = 400
  mini.height = 300
  const mc = mini.getContext('2d')
  mc.imageSmoothingQuality = 'high'
  mc.drawImage(copia, 0, 0, 400, 300)
  return { foto: copia.toDataURL('image/webp', 0.72), mini: mini.toDataURL('image/webp', 0.6) }
}

async function principal() {
  const navegador = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const pagina = await navegador.newPage()
  const so = process.argv.slice(2)
  for (const [nome, opcoes] of Object.entries(CENAS)) {
    if (so.length && !so.includes(nome)) continue
    const { foto, mini } = await pagina.evaluate(pintar, opcoes)
    const b = (u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64')
    writeFileSync(join(AQUI, `${nome}.webp`), b(foto))
    writeFileSync(join(AQUI, `${nome}_t.webp`), b(mini))
    console.log(`${nome}: ${(b(foto).length / 1024).toFixed(0)} KB + ${(b(mini).length / 1024).toFixed(0)} KB`)
  }
  await navegador.close()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal()
export const existe = (nome) => existsSync(join(AQUI, `${nome}.webp`))
export const arquivos = () => readdirSync(AQUI).filter((f) => f.endsWith('.webp'))
