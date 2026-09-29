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
import pg from 'pg'

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

/*
 * A fumaça escreve no banco de demonstração (RDO, cadastro, foto, comentário,
 * usuário). Tudo o que ela cria é anotado aqui e apagado no fim — inclusive as
 * linhas de histórico —, para a demo continuar parecendo uma empresa real.
 */
const criados = { relatorios: [], funcoes: [], colaboradores: [], fotos: [], arquivos: [] }
let historicoAntes = null
const banco = () =>
  new pg.Client({ host: process.env.SOCK ?? '/home/pg/sock', user: 'postgres', database: process.env.BANCO ?? 'obtra_app' })

async function limpar(admin) {
  const c = banco()
  try {
    await c.connect()
    await c.query('delete from public.fotos where id = any($1::uuid[]) or path = any($2::text[])', [criados.fotos, criados.arquivos])
    if (admin && criados.arquivos.length) await admin.sb.storage.from('obtra').remove(criados.arquivos)
    await c.query('delete from public.relatorios where id = any($1::uuid[])', [criados.relatorios])
    await c.query('delete from public.colaboradores where id = any($1::uuid[])', [criados.colaboradores])
    await c.query('delete from public.funcoes where id = any($1::uuid[])', [criados.funcoes])
    await c.query("delete from storage.objects where bucket_id = 'obtra' and name = any($1::text[])", [criados.arquivos])
    if (historicoAntes !== null) await c.query('delete from public.historico where id > $1', [historicoAntes])
    console.log('  limpeza: o que a fumaça criou foi apagado (banco e histórico)')
  } catch (e) {
    console.log(`  limpeza pelo banco não foi possível (${e.message}); rode ferramentas/local/subir.sh para recriar a demo`)
  } finally {
    await c.end().catch(() => {})
  }
}

async function principal() {
  console.log(`fumaça em ${URL_API}`)
  {
    const c = banco()
    try {
      await c.connect()
      historicoAntes = Number((await c.query('select coalesce(max(id), 0) as n from public.historico')).rows[0].n)
    } catch {
      historicoAntes = null
    } finally {
      await c.end().catch(() => {})
    }
  }
  let admin = null
  try {
    admin = await entrar('admin@construtoraaurora.com.br')
    await roteiro(admin)
  } finally {
    await limpar(admin)
  }
}

async function roteiro(admin) {

  // ----------------------------------------------------------- logins ----
  const master = await entrar('master@obtra.app')
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
  const { data: ultimo } = await eng.sb.from('relatorios').select('numero, responsavel, horario_inicio, intervalo_inicio').eq('obra_id', vista.id).order('data', { ascending: false }).order('numero', { ascending: false }).limit(1).single()
  const { data: novoRdo, error: eRdo } = await eng.sb.rpc('criar_relatorio', { p_obra: vista.id, p_data: new Date().toISOString().slice(0, 10) })
  conferir('engenheiro cria RDO via criar_relatorio', !eRdo && typeof novoRdo === 'string', eRdo)
  if (novoRdo) criados.relatorios.push(novoRdo)
  const { data: rdo } = await eng.sb.from('relatorios').select('numero, status, relatorio_mao_obra(id)').eq('id', novoRdo).single()
  conferir('RDO novo tem o próximo número e copiou a mão de obra', rdo?.numero === ultimo.numero + 1 && rdo.relatorio_mao_obra.length > 0, rdo)
  {
    const { data: cab } = await eng.sb.from('relatorios').select('responsavel, horario_inicio, intervalo_inicio').eq('id', novoRdo).single()
    conferir('RDO novo copiou responsável e horários (com intervalo) do anterior', cab?.responsavel === ultimo.responsavel && cab?.horario_inicio === ultimo.horario_inicio && cab?.intervalo_inicio === ultimo.intervalo_inicio, { cab, ultimo })
  }

  // ---------------------------------------------- cadastros (Adendo 1) ---
  {
    const { data: funcoes } = await eng.sb.from('funcoes').select('id, nome').order('nome')
    conferir('engenheiro lê as funções da Aurora', funcoes?.length >= 10 && funcoes.some((f) => f.nome === 'Pedreiro'), funcoes?.length)
    const { data: fn, error: eF } = await eng.sb.from('funcoes').insert({ nome: `Fumaça ${Date.now()}` }).select().single()
    if (fn) criados.funcoes.push(fn.id)
    conferir('engenheiro cadastra função "na hora" (empresa preenchida sozinha)', !eF && fn?.empresa_id === aurora, eF ?? fn)
    const { data: col, error: eC } = await eng.sb.from('colaboradores').insert({ nome: 'Colaborador da fumaça', funcao_id: fn.id }).select().single()
    if (col) criados.colaboradores.push(col.id)
    conferir('engenheiro cadastra colaborador', !eC && !!col, eC)
    const { data: item, error: eI } = await eng.sb.from('relatorio_mao_obra').insert({ relatorio_id: novoRdo, colaborador_id: col.id, funcao: '', quantidade: 1 }).select().single()
    conferir('linha de mão de obra pelo cadastro: função e nome vêm do cadastro', !eI && item?.funcao === fn.nome && item?.colaborador_nome === 'Colaborador da fumaça', eI ?? item)
    const { data: mat } = await eng.sb.from('materiais').select('id, unidade').eq('nome', 'Cimento CP-II 50 kg').single()
    const { data: im, error: eM } = await eng.sb.from('relatorio_materiais').insert({ relatorio_id: novoRdo, material_id: mat.id, descricao: '', quantidade: 12.5, tipo: 'recebido' }).select().single()
    conferir('material pelo cadastro: unidade herdada, quantidade numérica', !eM && im?.unidade === 'sc' && Number(im?.quantidade) === 12.5, eM ?? im)
    const { error: eN } = await eng.sb.from('relatorio_notas_compras').insert({ relatorio_id: novoRdo, fornecedor: 'Depósito São Jorge', numero_nota: 'NF-e 55.001', valor: 512.5, descricao: 'Cimento' })
    conferir('engenheiro registra nota de compra', !eN, eN)
    const { error: eDel } = await eng.sb.from('colaboradores').delete().eq('id', col.id).select()
    const { data: aindaLa } = await eng.sb.from('colaboradores').select('id').eq('id', col.id)
    conferir('colaborador não exclui cadastro (só admin)', !eDel && aindaLa?.length === 1, eDel)
    const { data: fcli } = await cliente.sb.from('funcoes').select('id')
    const { data: fbeta } = await beta.sb.from('colaboradores').select('id').eq('empresa_id', aurora)
    conferir('cliente e outra empresa não veem os cadastros da Aurora', fcli?.length === 0 && fbeta?.length === 0, { fcli, fbeta })
  }

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
  criados.arquivos.push(caminho, miniatura)
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
    criados.arquivos.push(p2, t2)
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
    // notas de compras são internas (migração 0007): o cliente recebe lista vazia, sem erro
    const { data: notas, error: eNc } = await cliente.sb.from('relatorio_notas_compras').select('fornecedor, valor').eq('relatorio_id', novoRdo)
    const { data: notasEq } = await eng.sb.from('relatorio_notas_compras').select('fornecedor, valor').eq('relatorio_id', novoRdo)
    conferir('cliente NÃO vê a nota de compra (nem do RDO aprovado); a equipe vê', !eNc && notas?.length === 0 && notasEq?.length === 1, { eNc, notas, notasEq })

    const { data: hist } = await admin.sb.from('historico').select('acao, usuario_nome, descricao').eq('entidade_id', novoRdo).order('id')
    conferir('histórico do RDO: criou → enviou_aprovacao → aprovou, com nomes', JSON.stringify(hist?.map((h) => h.acao)) === JSON.stringify(['criou', 'enviou_aprovacao', 'aprovou']) && hist[2].usuario_nome === 'Carla Menezes', hist)
    const { data: hcli } = await cliente.sb.from('historico').select('id').limit(1)
    const { error: eH } = await admin.sb.from('historico').insert({ empresa_id: aurora, acao: 'x', entidade: 'y' })
    conferir('cliente não lê histórico; ninguém escreve nele pela API', hcli?.length === 0 && !!eH, { hcli, eH })
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
    conferir('painel traz relatorios_pendentes', data?.relatorios_pendentes >= 2, data)
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

  // ------------------------------------ criar_relatorio simultâneo -------
  // Oito RDOs na mesma obra ao mesmo tempo (admin e engenheiro alternados):
  // o gatilho trava a obra, então os números saem únicos e sem buraco.
  {
    const { data: obra } = await admin.sb.from('obras').select('id').order('nome').limit(1).single()
    const { data: ult } = await admin.sb
      .from('relatorios').select('numero').eq('obra_id', obra.id).order('numero', { ascending: false }).limit(1)
    const antes = ult?.[0]?.numero ?? 0
    const datas = Array.from({ length: 8 }, (_, i) => `2030-01-0${i + 1}`)
    const res = await Promise.all(
      datas.map((d, i) =>
        (i % 2 ? eng : admin).sb.rpc('criar_relatorio', { p_obra: obra.id, p_data: d, p_copiar_anterior: false }),
      ),
    )
    const erros = res.filter((r) => r.error).map((r) => r.error.message)
    const ids = res.map((r) => r.data).filter(Boolean)
    criados.relatorios.push(...ids)
    const { data: novos } = await admin.sb.from('relatorios').select('numero').in('id', ids).order('numero')
    const nums = (novos ?? []).map((r) => r.numero)
    conferir(
      '8 criar_relatorio simultâneos: números únicos e em sequência',
      erros.length === 0 && nums.join() === datas.map((_, i) => antes + i + 1).join(),
      { erros, nums, antes },
    )
    await admin.sb.from('relatorios').delete().in('id', ids)

    // Pela API, a linha só entra depois do arquivo (senão bytes = 0 furaria a cota).
    const { error: eDoc } = await eng.sb.from('documentos').insert({
      obra_id: obra.id, nome: 'fantasma.pdf', path: `${aurora}/${obra.id}/docs/${randomUUID()}.pdf`, bytes: 0,
    })
    conferir('documento sem arquivo no Storage é recusado', eDoc?.message?.startsWith('Arquivo não encontrado no Storage'), eDoc)
    const { error: eCapa } = await eng.sb.from('obras').update({ capa_path: `${aurora}/outra/capa/x.webp` }).eq('id', obra.id)
    conferir('capa fora da pasta da obra é recusada', eCapa?.message === 'A capa tem de estar na pasta da obra', eCapa)
  }

  // ------------------------------------------ funções internas / anônimo --
  {
    const { error: eHist } = await eng.sb.rpc('registrar_historico', {
      p_empresa: aurora, p_obra: null, p_acao: 'aprovou', p_entidade: 'relatorio', p_entidade_id: null, p_descricao: 'falso',
    })
    conferir('registrar_historico (interna) não é chamável pela API', !!eHist, eHist)
    const { error: eAnonRpc } = await novoCliente().rpc('painel_resumo')
    conferir('anônimo não chama RPC', !!eAnonRpc, eAnonRpc)
    const { error: eAnonTab } = await novoCliente().from('empresas').select('id')
    conferir('anônimo recebe "permission denied" nas tabelas', /permission denied/.test(eAnonTab?.message ?? ''), eAnonTab)
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
