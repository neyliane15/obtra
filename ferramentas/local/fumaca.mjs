/**
 * Prova de fumaça do ambiente local com o `@supabase/supabase-js` DE VERDADE.
 *
 * Exercita o caminho que o front usa: login de cada usuário demo, isolamento
 * entre empresas e do cliente, RPCs, upload de WebP, URL assinada (unitária e
 * em lote), listagem, exclusão, criação de usuário pela RPC e login com ele,
 * troca da própria senha, refresh e logout.
 *
 * Uso: ferramentas/local/subir.sh && node ferramentas/local/fumaca.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..')
const env = Object.fromEntries(
  readFileSync(join(RAIZ, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_API = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const SENHA = 'obtra123'

// WebP 1×1 válido (RIFF/WEBP, VP8L).
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64')

let falhas = 0
let passos = 0
function conferir(descricao, condicao, detalhe) {
  passos++
  if (condicao) {
    console.log(`  ok   ${descricao}`)
  } else {
    falhas++
    console.log(`  FALHOU ${descricao}${detalhe ? ` — ${JSON.stringify(detalhe)}` : ''}`)
  }
}

const novoCliente = () =>
  createClient(URL_API, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

async function entrar(email, senha = SENHA) {
  const sb = novoCliente()
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`login de ${email} falhou: ${error.message}`)
  return { sb, usuario: data.user, sessao: data.session }
}

async function principal() {
  console.log(`fumaça em ${URL_API}`)

  // ----------------------------------------------------------- logins ----
  const master = await entrar('master@obtra.app')
  const admin = await entrar('admin@construtoraaurora.com.br')
  const eng = await entrar('engenheiro@construtoraaurora.com.br')
  const cliente = await entrar('cliente@exemplo.com')
  const beta = await entrar('admin@betaengenharia.com.br')
  conferir('os 5 usuários demo entram com obtra123', true)

  {
    const { error } = await novoCliente().auth.signInWithPassword({
      email: 'admin@construtoraaurora.com.br',
      password: 'errada',
    })
    conferir('senha errada é recusada (Invalid login credentials)', error?.message === 'Invalid login credentials', error)
  }

  const { data: perfilAdmin } = await admin.sb.from('perfis').select('*').eq('id', admin.usuario.id).single()
  conferir('perfil do admin: papel admin na Construtora Aurora', perfilAdmin?.papel === 'admin', perfilAdmin)
  const aurora = perfilAdmin.empresa_id

  // ----------------------------------------------------------- obras -----
  const nomes = async (sb) => ((await sb.from('obras').select('nome').order('nome')).data ?? []).map((o) => o.nome)
  const obrasMaster = await nomes(master.sb)
  const obrasAdmin = await nomes(admin.sb)
  const obrasBeta = await nomes(beta.sb)
  const obrasCliente = await nomes(cliente.sb)
  conferir('master vê as obras das duas empresas', obrasMaster.length === 6 && obrasMaster.includes('Condomínio Jardim das Flores'), obrasMaster)
  conferir('admin Aurora vê as 5 obras da Aurora e nenhuma da Beta', obrasAdmin.length === 5 && !obrasAdmin.includes('Condomínio Jardim das Flores'), obrasAdmin)
  conferir('admin Beta vê só a obra da Beta', obrasBeta.length === 1 && obrasBeta[0] === 'Condomínio Jardim das Flores', obrasBeta)
  conferir('cliente vê só o Residencial Vista Azul', obrasCliente.length === 1 && obrasCliente[0] === 'Residencial Vista Azul', obrasCliente)

  const { data: vista } = await eng.sb.from('obras').select('id, empresa_id').eq('nome', 'Residencial Vista Azul').single()

  // ------------------------------------------------ relatórios / cliente --
  const { data: relsCliente } = await cliente.sb
    .from('relatorios')
    .select('id, numero, status, relatorio_mao_obra(funcao, quantidade), relatorio_atividades(descricao)')
    .order('numero')
  conferir('cliente vê só relatórios aprovados (os 3+ do Vista Azul)', relsCliente?.length >= 3 && relsCliente.every((r) => r.status === 'aprovado'), relsCliente)
  conferir('cliente recebe os filhos do relatório aprovado (embed)', relsCliente?.[0]?.relatorio_mao_obra?.length > 0)

  const { data: naoAprovados } = await eng.sb.from('relatorios').select('id').eq('obra_id', vista.id).neq('status', 'aprovado')
  const { data: espiada } = await cliente.sb.from('relatorios').select('id').in('id', naoAprovados.map((r) => r.id))
  conferir('cliente não enxerga relatório não aprovado nem pelo id', naoAprovados.length >= 2 && espiada.length === 0, { naoAprovados, espiada })

  // ----------------------------------------------------- RPC de RDO ------
  const { data: ultimo } = await eng.sb.from('relatorios').select('numero').eq('obra_id', vista.id).order('numero', { ascending: false }).limit(1).single()
  const { data: novoRdo, error: eRdo } = await eng.sb.rpc('criar_relatorio', { p_obra: vista.id, p_data: new Date().toISOString().slice(0, 10) })
  conferir('engenheiro cria RDO via criar_relatorio', !eRdo && typeof novoRdo === 'string', eRdo)
  const { data: rdo } = await eng.sb.from('relatorios').select('numero, status, relatorio_mao_obra(id)').eq('id', novoRdo).single()
  conferir('RDO novo tem o próximo número e copiou a mão de obra', rdo?.numero === ultimo.numero + 1 && rdo.relatorio_mao_obra.length > 0, rdo)

  {
    const { error } = await eng.sb.rpc('mudar_status_relatorio', { p_relatorio: novoRdo, p_status: 'revisar' })
    conferir('engenheiro manda para revisão', !error, error)
    const { error: e2 } = await eng.sb.rpc('mudar_status_relatorio', { p_relatorio: novoRdo, p_status: 'aprovado' })
    conferir('engenheiro não aprova (erro legível)', e2?.message?.includes('administrador'), e2)
    const { error: e3 } = await beta.sb.rpc('criar_relatorio', { p_obra: vista.id, p_data: '2026-09-29' })
    conferir('admin Beta não cria RDO em obra da Aurora', !!e3, e3)
  }

  // ------------------------------------------------------------ storage --
  const pasta = `${vista.empresa_id}/${vista.id}/fotos`
  const idFoto = randomUUID()
  const caminho = `${pasta}/${idFoto}.webp`
  const miniatura = `${pasta}/${idFoto}_t.webp`
  const blob = new Blob([WEBP], { type: 'image/webp' })
  {
    const { data, error } = await eng.sb.storage.from('obtra').upload(caminho, blob, { contentType: 'image/webp' })
    conferir('engenheiro sobe WebP (Blob → multipart)', !error && data?.path === caminho, error)
    const { error: e2 } = await eng.sb.storage.from('obtra').upload(miniatura, WEBP, { contentType: 'image/webp' })
    conferir('engenheiro sobe a miniatura (Buffer → corpo cru)', !e2, e2)
    const { error: e3 } = await eng.sb.storage.from('obtra').upload(caminho, blob)
    conferir('reenviar o mesmo caminho sem upsert dá conflito', !!e3, e3)
    const { error: e4 } = await eng.sb.storage.from('obtra').upload(caminho, blob, { upsert: true })
    conferir('com upsert: substitui', !e4, e4)
    const { error: e5 } = await eng.sb.storage
      .from('obtra')
      .upload(`${pasta}/x.txt`, new Blob(['oi'], { type: 'text/plain' }))
    conferir('tipo fora da lista do bucket é recusado', !!e5, e5)
    const { error: e6 } = await beta.sb.storage.from('obtra').upload(`${pasta}/${randomUUID()}.webp`, blob)
    conferir('admin Beta não sobe arquivo na pasta da Aurora', !!e6, e6)
  }

  const { data: foto, error: eFoto } = await eng.sb
    .from('fotos')
    .insert({ obra_id: vista.id, empresa_id: vista.empresa_id, path: caminho, thumb_path: miniatura, legenda: 'Fachada leste', largura: 1, altura: 1, bytes: 1 })
    .select()
    .single()
  conferir('engenheiro registra a foto; bytes vêm do Storage', !eFoto && foto?.bytes === WEBP.length * 2, eFoto ?? foto)

  {
    const { data, error } = await eng.sb.storage.from('obtra').createSignedUrl(caminho, 3600)
    conferir('URL assinada no formato do supabase-js', !error && data?.signedUrl?.startsWith(`${URL_API}/storage/v1/object/sign/obtra/`) && data.signedUrl.includes('?token='), error ?? data)
    const r = await fetch(data.signedUrl)
    const corpo = Buffer.from(await r.arrayBuffer())
    conferir('baixar pela URL assinada devolve o arquivo com content-type', r.ok && r.headers.get('content-type') === 'image/webp' && corpo.equals(WEBP), { status: r.status, tipo: r.headers.get('content-type') })
    const adulterada = await fetch(data.signedUrl.replace(idFoto, randomUUID()))
    conferir('URL assinada não serve outro caminho', !adulterada.ok)
  }
  {
    const { data, error } = await cliente.sb.storage.from('obtra').createSignedUrls([caminho, miniatura], 3600)
    conferir('cliente assina em lote a foto sem RDO da obra dele', !error && data?.length === 2 && data.every((d) => d.signedUrl && !d.error), error ?? data)
    const { data: d2, error: e2 } = await beta.sb.storage.from('obtra').createSignedUrl(caminho, 60)
    conferir('admin Beta não assina URL de arquivo da Aurora', !!e2 && !d2, e2)
    const { data: d3 } = await beta.sb.storage.from('obtra').createSignedUrls([caminho], 60)
    conferir('... nem em lote (erro por item)', d3?.[0]?.signedUrl === null && !!d3?.[0]?.error, d3)
  }
  {
    const { data, error } = await eng.sb.storage.from('obtra').download(caminho)
    conferir('download autenticado', !error && Buffer.from(await data.arrayBuffer()).equals(WEBP), error)
    const { data: lista, error: eL } = await eng.sb.storage.from('obtra').list(pasta)
    conferir('list da pasta de fotos traz os 2 arquivos', !eL && lista?.filter((x) => x.name.startsWith(idFoto)).length === 2, eL ?? lista)
    const { data: raiz } = await eng.sb.storage.from('obtra').list(vista.empresa_id)
    conferir('list na empresa mostra a pasta da obra', raiz?.some((x) => x.name === vista.id && x.id === null), raiz)
  }

  // foto ligada a RDO não aprovado: cliente não vê a linha nem o arquivo
  {
    const id2 = randomUUID()
    const p2 = `${pasta}/${id2}.webp`
    const t2 = `${pasta}/${id2}_t.webp`
    await eng.sb.storage.from('obtra').upload(p2, blob)
    await eng.sb.storage.from('obtra').upload(t2, blob)
    const { error } = await eng.sb.from('fotos').insert({ obra_id: vista.id, empresa_id: vista.empresa_id, relatorio_id: novoRdo, path: p2, thumb_path: t2 })
    conferir('engenheiro anexa foto ao RDO em revisão', !error, error)
    const { data: linhas } = await cliente.sb.from('fotos').select('id').eq('relatorio_id', novoRdo)
    const { error: eS } = await cliente.sb.storage.from('obtra').createSignedUrl(p2, 60)
    conferir('cliente não vê a foto do RDO não aprovado (linha nem arquivo)', linhas?.length === 0 && !!eS, { linhas, eS })

    const { error: eA } = await admin.sb.rpc('mudar_status_relatorio', { p_relatorio: novoRdo, p_status: 'aprovado' })
    const { data: l2 } = await cliente.sb.from('fotos').select('id').eq('relatorio_id', novoRdo)
    const { error: eS2 } = await cliente.sb.storage.from('obtra').createSignedUrl(t2, 60)
    conferir('após o admin aprovar, o cliente vê a foto e assina a miniatura', !eA && l2?.length === 1 && !eS2, { eA, l2, eS2 })
    const { error: eC } = await cliente.sb.from('relatorio_comentarios').insert({ relatorio_id: novoRdo, texto: 'Obrigado pelo registro!' })
    conferir('cliente comenta no RDO aprovado', !eC, eC)
  }

  // exclusão
  {
    const { data: fotoApagada } = await eng.sb.from('fotos').delete().eq('id', foto.id).select()
    const { data, error } = await eng.sb.storage.from('obtra').remove([caminho, miniatura])
    conferir('remove apaga linha e arquivos (2 objetos)', fotoApagada?.length === 1 && !error && data?.length === 2, error ?? data)
    const { error: e2 } = await eng.sb.storage.from('obtra').download(caminho)
    conferir('arquivo removido não baixa mais', !!e2)
  }

  // ------------------------------------------------------------- painel --
  {
    const { data, error } = await admin.sb.rpc('painel_resumo')
    conferir('painel do admin: 5 obras, armazenamento com limite 2 GB', !error && data.obras_total === 5 && data.armazenamento_limite_bytes === 2048 * 1024 * 1024 && data.empresas_total === null, error ?? data)
    const { data: dm } = await master.sb.rpc('painel_resumo')
    conferir('painel do master: 2 empresas', dm?.empresas_total === 2, dm)
  }

  // ------------------------------------------------------ usuários (RPC) --
  {
    const email = `novo.${Date.now()}@construtoraaurora.com.br`
    const { data: novoId, error } = await admin.sb.rpc('admin_criar_usuario', {
      p_email: email,
      p_senha: 'senha-do-novo',
      p_nome: 'Colaborador Novo',
      p_papel: 'colaborador',
      p_empresa_id: aurora,
      p_cargo: 'Técnico de Edificações',
    })
    conferir('admin cria colaborador pela RPC', !error && typeof novoId === 'string', error)
    const { error: eDup } = await admin.sb.rpc('admin_criar_usuario', { p_email: email, p_senha: '123456', p_nome: 'X', p_papel: 'colaborador', p_empresa_id: aurora })
    conferir('e-mail duplicado: "E-mail já cadastrado"', eDup?.message === 'E-mail já cadastrado', eDup)
    const { error: eOutra } = await admin.sb.rpc('admin_criar_usuario', { p_email: `x.${Date.now()}@x.com`, p_senha: '123456', p_nome: 'X', p_papel: 'admin', p_empresa_id: (await beta.sb.from('empresas').select('id').single()).data.id })
    conferir('admin não cria usuário em outra empresa', !!eOutra, eOutra)

    const novo = await entrar(email, 'senha-do-novo')
    conferir('o usuário criado pela RPC faz login (bcrypt + colunas do GoTrue)', novo.usuario.id === novoId)
    conferir('... e vê as obras da Aurora', (await nomes(novo.sb)).length === 5)

    const { error: eSenha } = await novo.sb.auth.updateUser({ password: 'nova-senha-123' })
    conferir('troca da própria senha (PUT /auth/v1/user)', !eSenha, eSenha)
    await entrar(email, 'nova-senha-123')
    conferir('entra com a senha nova', true)

    const { error: eRed } = await admin.sb.rpc('admin_redefinir_senha', { p_usuario: novoId, p_senha: 'redefinida1' })
    await entrar(email, 'redefinida1')
    conferir('admin_redefinir_senha vale no login', !eRed, eRed)

    const { error: eProm } = await novo.sb.from('perfis').update({ papel: 'admin' }).eq('id', novoId)
    conferir('colaborador não se promove pela API', !!eProm, eProm)

    const { error: eExc } = await admin.sb.rpc('admin_excluir_usuario', { p_usuario: novoId })
    const { error: eLogin } = await novoCliente().auth.signInWithPassword({ email, password: 'redefinida1' })
    conferir('admin exclui o usuário e ele não entra mais', !eExc && !!eLogin, { eExc, eLogin })
  }

  // ----------------------------------------------- sessão: user/refresh ---
  {
    const { data, error } = await eng.sb.auth.getUser()
    conferir('getUser devolve o usuário', !error && data.user.email === 'engenheiro@construtoraaurora.com.br', error)
    const { data: r, error: eR } = await eng.sb.auth.refreshSession()
    conferir('refreshSession renova o token', !eR && !!r.session?.access_token, eR)
    const { count } = await eng.sb.from('obras').select('*', { count: 'exact', head: true })
    conferir('token renovado funciona no REST', count === 5, count)
    const { error: eOut } = await eng.sb.auth.signOut()
    conferir('signOut', !eOut, eOut)
    const { data: anon, error: eAnon } = await eng.sb.from('obras').select('id')
    conferir('depois do logout, a API trata como anônimo (nada visível)', (anon?.length ?? 0) === 0 || !!eAnon)
  }

  console.log(`\n${passos - falhas}/${passos} conferências passaram`)
  if (falhas > 0) process.exit(1)
  console.log('fumaça: tudo passou')
}

principal().catch((e) => {
  console.error('ERRO', e)
  process.exit(1)
})
