/**
 * Sobe as fotos da demonstração pelo MESMO caminho do app (Storage + linha em
 * `fotos`, capa em `obras.capa_path`), como o admin de cada empresa. Depois
 * ajusta, direto no banco, a data de cada foto (e do histórico) para o dia do
 * RDO, para a linha do tempo ficar plausível.
 *
 * Chamado pelo ferramentas/local/subir.sh. Uso avulso:
 *   node ferramentas/local/fotos-demo/carregar.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '../../..')
const env = Object.fromEntries(
  readFileSync(join(RAIZ, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

/** obra → capa e fotos por nº do RDO (0 = galeria da obra, sem RDO) */
const PLANO = [
  {
    email: 'admin@construtoraaurora.com.br',
    obras: {
      'Residencial Vista Azul': {
        capa: 'vista-capa',
        fotos: [
          [1, 'vista-torre', 'Vista geral do canteiro — estrutura chegando ao 6º pavimento'],
          [1, 'vista-armacao', 'Armação dos pilares do 5º pavimento'],
          [1, 'vista-formas', 'Fôrmas e escoramento da laje do 5º pavimento'],
          [2, 'vista-chuva', 'Laje protegida com lona durante a chuva da tarde'],
          [3, 'vista-concretagem', 'Lançamento do concreto com caminhão-bomba'],
          [3, 'vista-laje-pronta', 'Laje concluída — início da cura úmida'],
          [4, 'vista-eletrica', 'Tubulação elétrica embutida no 3º pavimento'],
          [4, 'vista-alvenaria', 'Alvenaria de vedação do 2º pavimento'],
        ],
      },
      'Edifício Comercial Paulista': {
        capa: 'paulista-fachada',
        fotos: [
          [1, 'paulista-fachada', 'Fachada norte — remoção do revestimento antigo'],
          [1, 'paulista-balancim', 'Balancim em operação na fachada norte'],
        ],
      },
      'Galpão Logístico Jundiaí': { capa: 'galpao-parado', fotos: [[1, 'galpao-parado', 'Área de expansão embargada — terraplenagem suspensa']] },
      'Reforma EMEF Anita Garibaldi': { capa: 'escola-entregue', fotos: [[0, 'escola-entregue', 'Fachada após a entrega: cobertura nova e rampa de acesso']] },
      'Clínica Bem Viver': { capa: 'clinica-terreno', fotos: [] },
    },
  },
  {
    email: 'admin@betaengenharia.com.br',
    obras: {
      'Condomínio Jardim das Flores': { capa: 'flores-fundacao', fotos: [[1, 'flores-fundacao', 'Estacas hélice contínua do bloco B']] },
    },
  },
]

const arquivo = (nome) => new Blob([readFileSync(join(AQUI, `${nome}.webp`))], { type: 'image/webp' })
const miniatura = (nome) => new Blob([readFileSync(join(AQUI, `${nome}_t.webp`))], { type: 'image/webp' })

async function subir(sb, caminho, blob) {
  const { error } = await sb.storage.from('obtra').upload(caminho, blob, { contentType: 'image/webp', upsert: false })
  if (error) throw new Error(`${caminho}: ${error.message}`)
}

async function principal() {
  let total = 0
  for (const { email, obras } of PLANO) {
    const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { error: eLogin } = await sb.auth.signInWithPassword({ email, password: 'obtra123' })
    if (eLogin) throw new Error(`login ${email}: ${eLogin.message}`)
    for (const [nomeObra, plano] of Object.entries(obras)) {
      const { data: obra, error } = await sb.from('obras').select('id, empresa_id, capa_path').eq('nome', nomeObra).single()
      if (error) throw new Error(`${nomeObra}: ${error.message}`)
      if (obra.capa_path) continue // já carregada
      const { data: rels } = await sb.from('relatorios').select('id, numero').eq('obra_id', obra.id)
      const porNumero = new Map((rels ?? []).map((r) => [r.numero, r.id]))
      if (plano.capa) {
        const id = randomUUID()
        const capa_path = `${obra.empresa_id}/${obra.id}/capa/${id}.webp`
        const capa_thumb_path = `${obra.empresa_id}/${obra.id}/capa/${id}_t.webp`
        await subir(sb, capa_path, arquivo(plano.capa))
        await subir(sb, capa_thumb_path, miniatura(plano.capa))
        const { error: eCapa } = await sb.from('obras').update({ capa_path, capa_thumb_path }).eq('id', obra.id)
        if (eCapa) throw new Error(`capa ${nomeObra}: ${eCapa.message}`)
      }
      for (const [numero, nome, legenda] of plano.fotos) {
        const id = randomUUID()
        const path = `${obra.empresa_id}/${obra.id}/fotos/${id}.webp`
        const thumb_path = `${obra.empresa_id}/${obra.id}/fotos/${id}_t.webp`
        await subir(sb, path, arquivo(nome))
        await subir(sb, thumb_path, miniatura(nome))
        const { error: eF } = await sb.from('fotos').insert({
          obra_id: obra.id,
          relatorio_id: numero ? (porNumero.get(numero) ?? null) : null,
          path,
          thumb_path,
          legenda,
          largura: 1600,
          altura: 1200,
          bytes: 0,
        })
        if (eF) throw new Error(`foto ${nome}: ${eF.message}`)
        total++
      }
    }
    await sb.auth.signOut()
  }

  // Datas plausíveis: a foto (e o histórico dela) no fim da tarde do dia do RDO,
  // enviada por quem criou o RDO; troca de capa não polui o histórico.
  const c = new pg.Client({ host: process.env.SOCK ?? '/home/pg/sock', user: 'postgres', database: process.env.BANCO ?? 'obtra_app' })
  await c.connect()
  try {
    await c.query(`
      update public.fotos f
         set criado_em = r.data + time '16:10' + (random() * interval '40 minutes'),
             criado_por = coalesce(r.criado_por, f.criado_por)
        from public.relatorios r where r.id = f.relatorio_id`)
    await c.query(`update public.fotos f set criado_em = o.previsao_termino + time '11:00'
                     from public.obras o where o.id = f.obra_id and f.relatorio_id is null`)
    await c.query(`
      update public.historico h
         set criado_em = f.criado_em, usuario_id = f.criado_por, usuario_nome = p.nome
        from public.fotos f join public.perfis p on p.id = f.criado_por
       where h.entidade = 'foto' and h.entidade_id = f.id`)
    await c.query(`delete from public.historico where entidade = 'obra' and acao = 'editou'`)
  } finally {
    await c.end()
  }
  console.log(`fotos da demo: ${total} fotos e 6 capas enviadas`)
}

principal().catch((e) => {
  console.error('fotos da demo:', e.message)
  process.exit(1)
})
