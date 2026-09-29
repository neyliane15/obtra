/**
 * Portão do ambiente local do Obtra: faz o papel do Kong + GoTrue + Storage.
 *
 * O que é real: o Postgres, as migrações, a RLS, o PostgREST e o caminho HTTP
 * que o `@supabase/supabase-js` percorre. A senha é conferida de verdade contra
 * `auth.users.encrypted_password` (bcrypt, via `crypt()` do pgcrypto), então um
 * usuário criado pela RPC `admin_criar_usuario` entra aqui exatamente como
 * entraria no GoTrue. O Storage grava o arquivo em disco, mas a linha em
 * `storage.objects` é inserida/lida/apagada COMO O USUÁRIO (role authenticated
 * + request.jwt.claims), então as políticas do bucket decidem de verdade.
 *
 * O que é simplificado: sessões/refresh ficam em memória e são JWT assinados;
 * não há e-mail (confirmação/recuperação); não há transformação de imagem.
 *
 * Variáveis: PORTA, POSTGREST, JWT_SEGREDO, BANCO, SOCK, PASTA_ARQUIVOS.
 */
import { createServer, request as pedir } from 'node:http'
import { createHmac, timingSafeEqual, randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, rm, rename, stat } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PORTA = Number(process.env.PORTA ?? 54321)
const POSTGREST = process.env.POSTGREST ?? 'http://127.0.0.1:54330'
const SEGREDO = process.env.JWT_SEGREDO ?? 'segredo-local-do-obtra-com-pelo-menos-32-caracteres'
const PASTA = resolve(process.env.PASTA_ARQUIVOS ?? join(RAIZ, '.local-storage'))
const URL_PUBLICA = `http://127.0.0.1:${PORTA}`
const DURACAO_SESSAO = 3600

const banco = new pg.Pool({
  host: process.env.SOCK ?? '/home/pg/sock',
  user: 'postgres',
  database: process.env.BANCO ?? 'obtra_app',
  max: 10,
})

// ─────────────────────────────────────────────────────────────── JWT ──────
const b64url = (buf) => Buffer.from(buf).toString('base64url')

function assinar(carga) {
  const cabecalho = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const corpo = b64url(JSON.stringify(carga))
  const assinatura = b64url(createHmac('sha256', SEGREDO).update(`${cabecalho}.${corpo}`).digest())
  return `${cabecalho}.${corpo}.${assinatura}`
}

/** Devolve a carga se a assinatura confere e não expirou; senão, null. */
function conferir(token) {
  const partes = String(token ?? '').split('.')
  if (partes.length !== 3) return null
  const esperada = Buffer.from(
    b64url(createHmac('sha256', SEGREDO).update(`${partes[0]}.${partes[1]}`).digest()),
  )
  const recebida = Buffer.from(partes[2])
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null
  try {
    const carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString())
    if (typeof carga.exp === 'number' && carga.exp * 1000 <= Date.now()) return null
    return carga
  } catch {
    return null
  }
}

const tokenDoCabecalho = (req) =>
  String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()

// ─────────────────────────────────────────────────────────── HTTP ─────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, prefer, range, accept, accept-profile, ' +
    'content-profile, x-supabase-api-version, x-retry-count, x-region, x-upsert, cache-control, x-metadata',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Expose-Headers':
    'content-range, content-location, content-length, content-type, etag, x-supabase-api-version',
  'Access-Control-Max-Age': '86400',
}

function responder(res, status, corpo, extras = {}) {
  res.writeHead(status, {
    ...CORS,
    'content-type': 'application/json',
    'x-supabase-api-version': '2024-01-01',
    ...extras,
  })
  res.end(corpo === undefined ? '' : JSON.stringify(corpo))
}

async function lerCorpo(req, limite = 60 * 1024 * 1024) {
  const pedacos = []
  let total = 0
  for await (const p of req) {
    total += p.length
    if (total > limite) throw Object.assign(new Error('corpo grande demais'), { status: 413 })
    pedacos.push(p)
  }
  return Buffer.concat(pedacos)
}

async function lerJson(req) {
  const bruto = (await lerCorpo(req, 2 * 1024 * 1024)).toString()
  if (!bruto) return {}
  try {
    return JSON.parse(bruto)
  } catch {
    return {}
  }
}

// ─────────────────────────────────────────────────────────── Auth ─────────
/** Sessões revogadas por logout (session_id). Em memória: é ambiente local. */
const sessoesEncerradas = new Set()

const erroAuth = (res, status, codigo, mensagem, extra = {}) =>
  responder(res, status, { code: status, error_code: codigo, msg: mensagem, ...extra })

async function carregarUsuario(id) {
  const { rows } = await banco.query('select * from auth.users where id = $1', [id])
  const u = rows[0]
  if (!u) return null
  const { rows: ids } = await banco.query(
    'select * from auth.identities where user_id = $1 order by created_at',
    [id],
  )
  return {
    id: u.id,
    aud: u.aud ?? 'authenticated',
    role: u.role ?? 'authenticated',
    email: u.email,
    email_confirmed_at: u.email_confirmed_at,
    phone: u.phone ?? '',
    confirmed_at: u.confirmed_at,
    last_sign_in_at: u.last_sign_in_at,
    app_metadata: u.raw_app_meta_data ?? { provider: 'email', providers: ['email'] },
    user_metadata: u.raw_user_meta_data ?? {},
    identities: ids.map((i) => ({
      identity_id: i.id,
      id: i.provider_id,
      user_id: i.user_id,
      identity_data: i.identity_data,
      provider: i.provider,
      last_sign_in_at: i.last_sign_in_at,
      created_at: i.created_at,
      updated_at: i.updated_at,
      email: i.email,
    })),
    created_at: u.created_at,
    updated_at: u.updated_at,
    is_anonymous: false,
  }
}

async function novaSessao(usuario, sessionId = randomUUID()) {
  const agora = Math.floor(Date.now() / 1000)
  const exp = agora + DURACAO_SESSAO
  const access = assinar({
    aud: 'authenticated',
    exp,
    iat: agora,
    iss: `${URL_PUBLICA}/auth/v1`,
    sub: usuario.id,
    email: usuario.email,
    phone: '',
    app_metadata: usuario.app_metadata,
    user_metadata: usuario.user_metadata,
    role: 'authenticated',
    aal: 'aal1',
    amr: [{ method: 'password', timestamp: agora }],
    session_id: sessionId,
    is_anonymous: false,
  })
  const refresh = assinar({
    typ: 'refresh',
    sub: usuario.id,
    session_id: sessionId,
    jti: randomUUID(),
    iat: agora,
    exp: agora + 60 * 60 * 24 * 30,
  })
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: DURACAO_SESSAO,
    expires_at: exp,
    refresh_token: refresh,
    user: usuario,
  }
}

/** Colunas que o GoTrue lê como string: NULL nelas derruba o login lá. */
const COLUNAS_TEXTO_GOTRUE = [
  'confirmation_token',
  'recovery_token',
  'email_change_token_new',
  'email_change',
  'email_change_token_current',
  'reauthentication_token',
  'phone_change',
  'phone_change_token',
]

async function entrarComSenha(res, corpo) {
  const email = String(corpo.email ?? '').trim().toLowerCase()
  const senha = String(corpo.password ?? '')
  if (!email || !senha) {
    return erroAuth(res, 400, 'validation_failed', 'missing email or phone')
  }
  const { rows } = await banco.query(
    `select id, email_confirmed_at, banned_until, deleted_at,
            (encrypted_password is not null
             and encrypted_password = extensions.crypt($2, encrypted_password)) as confere,
            ${COLUNAS_TEXTO_GOTRUE.join(', ')}
       from auth.users
      where lower(email) = $1 and not is_sso_user`,
    [email, senha],
  )
  const u = rows[0]
  if (u) {
    const nulas = COLUNAS_TEXTO_GOTRUE.filter((c) => u[c] === null)
    if (nulas.length > 0) {
      console.error(
        `[auth] ${email}: colunas NULL em auth.users (${nulas.join(', ')}) — o GoTrue real ` +
          'falha com "converting NULL to string is unsupported". Corrija quem inseriu esse usuário.',
      )
      return erroAuth(res, 500, 'unexpected_failure', 'Database error querying schema')
    }
  }
  if (!u || !u.confere || u.deleted_at) {
    return erroAuth(res, 400, 'invalid_credentials', 'Invalid login credentials')
  }
  if (!u.email_confirmed_at) {
    return erroAuth(res, 400, 'email_not_confirmed', 'Email not confirmed')
  }
  if (u.banned_until && new Date(u.banned_until) > new Date()) {
    return erroAuth(res, 400, 'user_banned', 'User is banned')
  }
  await banco.query('update auth.users set last_sign_in_at = now() where id = $1', [u.id])
  return responder(res, 200, await novaSessao(await carregarUsuario(u.id)))
}

async function renovar(res, corpo) {
  const carga = conferir(corpo.refresh_token)
  if (!carga || carga.typ !== 'refresh' || sessoesEncerradas.has(carga.session_id)) {
    return erroAuth(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found')
  }
  const usuario = await carregarUsuario(carga.sub)
  if (!usuario) return erroAuth(res, 400, 'user_not_found', 'User not found')
  return responder(res, 200, await novaSessao(usuario, carga.session_id))
}

/** Usuário do token de acesso, ou responde o erro e devolve null. */
async function usuarioDoToken(req, res) {
  const carga = conferir(tokenDoCabecalho(req))
  if (!carga || carga.role !== 'authenticated' || !carga.sub) {
    erroAuth(res, 403, 'bad_jwt', 'invalid JWT: unable to parse or verify signature, token is expired')
    return null
  }
  if (carga.session_id && sessoesEncerradas.has(carga.session_id)) {
    erroAuth(res, 403, 'session_not_found', 'Session from session_id claim in JWT does not exist')
    return null
  }
  const usuario = await carregarUsuario(carga.sub)
  if (!usuario) {
    erroAuth(res, 403, 'user_not_found', 'User from sub claim in JWT does not exist')
    return null
  }
  return { usuario, carga }
}

async function rotaAuth(req, res, caminho, url) {
  if (caminho === '/token' && req.method === 'POST') {
    const corpo = await lerJson(req)
    const tipo = url.searchParams.get('grant_type')
    if (tipo === 'password') return entrarComSenha(res, corpo)
    if (tipo === 'refresh_token') return renovar(res, corpo)
    return erroAuth(res, 400, 'unsupported_grant_type', `grant_type ${tipo} não existe no portão local`)
  }

  if (caminho === '/user' && req.method === 'GET') {
    const quem = await usuarioDoToken(req, res)
    if (quem) responder(res, 200, quem.usuario)
    return
  }

  if (caminho === '/user' && req.method === 'PUT') {
    const quem = await usuarioDoToken(req, res)
    if (!quem) return
    const corpo = await lerJson(req)
    const id = quem.usuario.id
    if (corpo.password !== undefined) {
      const senha = String(corpo.password)
      if (senha.length < 6) {
        return erroAuth(res, 422, 'weak_password', 'Password should be at least 6 characters.', {
          weak_password: { reasons: ['length'] },
        })
      }
      const { rows } = await banco.query(
        'select encrypted_password = extensions.crypt($2, encrypted_password) as igual from auth.users where id = $1',
        [id, senha],
      )
      if (rows[0]?.igual) {
        return erroAuth(res, 422, 'same_password', 'New password should be different from the old password.')
      }
      await banco.query(
        `update auth.users
            set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 10)), updated_at = now()
          where id = $1`,
        [id, senha],
      )
    }
    if (corpo.data && typeof corpo.data === 'object') {
      await banco.query(
        `update auth.users
            set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || $2::jsonb, updated_at = now()
          where id = $1`,
        [id, JSON.stringify(corpo.data)],
      )
    }
    if (corpo.email !== undefined) {
      const email = String(corpo.email).trim().toLowerCase()
      const { rowCount } = await banco.query(
        'select 1 from auth.users where lower(email) = $1 and id <> $2',
        [email, id],
      )
      if (rowCount > 0) return erroAuth(res, 422, 'email_exists', 'A user with this email address has already been registered')
      await banco.query('update auth.users set email = $2, updated_at = now() where id = $1', [id, email])
    }
    return responder(res, 200, await carregarUsuario(id))
  }

  if (caminho === '/logout' && req.method === 'POST') {
    const carga = conferir(tokenDoCabecalho(req))
    if (carga?.session_id) sessoesEncerradas.add(carga.session_id)
    res.writeHead(204, CORS)
    return res.end()
  }

  // Cadastro aberto, como o GoTrue: insere em auth.users SEM a bandeira das
  // RPCs — o gatilho cria perfil 'cliente' sem empresa (ou master, se o e-mail
  // for o configuracao.master_email e ainda não houver master).
  if (caminho === '/signup' && req.method === 'POST') {
    const corpo = await lerJson(req)
    const email = String(corpo.email ?? '').trim().toLowerCase()
    const senha = String(corpo.password ?? '')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return erroAuth(res, 400, 'validation_failed', 'Unable to validate email address: invalid format')
    }
    if (senha.length < 6) {
      return erroAuth(res, 422, 'weak_password', 'Password should be at least 6 characters.', {
        weak_password: { reasons: ['length'] },
      })
    }
    const { rowCount } = await banco.query('select 1 from auth.users where lower(email) = $1', [email])
    if (rowCount > 0) return erroAuth(res, 422, 'user_already_exists', 'User already registered')
    const id = randomUUID()
    await banco.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         ${COLUNAS_TEXTO_GOTRUE.join(', ')})
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
         extensions.crypt($3, extensions.gen_salt('bf', 10)), now(),
         '{"provider":"email","providers":["email"]}', $4, now(), now(), '', '', '', '', '', '', '', '')`,
      [id, email, senha, JSON.stringify(corpo.data ?? {})],
    )
    await banco.query(
      `insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
       values ($1, $1::text, 'email', $2, now(), now(), now())`,
      [id, JSON.stringify({ sub: id, email, email_verified: true, phone_verified: false })],
    )
    return responder(res, 200, await novaSessao(await carregarUsuario(id)))
  }

  if (caminho === '/recover' && req.method === 'POST') {
    const corpo = await lerJson(req)
    console.log(`[auth] recuperação de senha pedida para ${corpo.email} — no ambiente local não há e-mail`)
    return responder(res, 200, {})
  }

  if (caminho === '/settings') {
    return responder(res, 200, {
      external: { email: true, phone: false },
      disable_signup: false,
      mailer_autoconfirm: true,
      phone_autoconfirm: false,
    })
  }
  if (caminho === '/health') return responder(res, 200, { name: 'portao-obtra', version: 'local' })

  return erroAuth(res, 404, 'not_found', `Rota de auth não existe no portão local: ${caminho}`)
}

// ──────────────────────────────────────────────────────── Storage ─────────
const erroStorage = (res, status, erro, mensagem) =>
  responder(res, status, { statusCode: String(status), error: erro, message: mensagem })

/** Papel e claims do pedido: token válido de usuário, ou anon. */
function identidade(req) {
  const carga = conferir(tokenDoCabecalho(req))
  if (carga?.role === 'authenticated' && carga.sub && !sessoesEncerradas.has(carga.session_id)) {
    return { papel: 'authenticated', claims: carga }
  }
  if (carga?.role === 'service_role') return { papel: 'service_role', claims: carga }
  return { papel: 'anon', claims: { role: 'anon' } }
}

/** Roda `fn(cliente)` numa transação vestida como o usuário do pedido. */
async function comoUsuario(req, fn) {
  const { papel, claims } = identidade(req)
  const cliente = await banco.connect()
  try {
    await cliente.query('begin')
    await cliente.query(
      "select set_config('request.jwt.claims', $1, true), set_config('role', $2, true)",
      [JSON.stringify(claims), papel],
    )
    const resultado = await fn(cliente)
    await cliente.query('commit')
    return resultado
  } catch (e) {
    await cliente.query('rollback').catch(() => {})
    throw e
  } finally {
    cliente.release()
  }
}

function traduzirErroBanco(res, e) {
  if (e.code === '42501' || /row-level security/i.test(e.message)) {
    return erroStorage(res, 403, 'Unauthorized', 'new row violates row-level security policy')
  }
  if (e.code === '23505') return erroStorage(res, 409, 'Duplicate', 'The resource already exists')
  if (e.status) return erroStorage(res, e.status, 'Error', e.message)
  console.error('[storage]', e)
  return erroStorage(res, 500, 'internal', e.message)
}

function arquivoEmDisco(balde, nome) {
  const alvo = resolve(PASTA, balde, nome)
  if (!alvo.startsWith(PASTA + sep)) throw Object.assign(new Error('Caminho inválido'), { status: 400 })
  return alvo
}

function nomeValido(nome) {
  return (
    typeof nome === 'string' &&
    nome.length > 0 &&
    nome.length <= 1024 &&
    !nome.startsWith('/') &&
    !nome.split('/').some((s) => s === '' || s === '.' || s === '..')
  )
}

async function buscarBalde(id) {
  const { rows } = await banco.query('select * from storage.buckets where id = $1', [id])
  return rows[0] ?? null
}

function mimePermitido(balde, mime) {
  const lista = balde.allowed_mime_types
  if (!lista || lista.length === 0) return true
  return lista.some((m) => m === mime || (m.endsWith('/*') && mime.startsWith(m.slice(0, -1))))
}

/** Extrai arquivo, tipo e cacheControl de um upload do storage-js. */
async function lerUpload(req) {
  const corpo = await lerCorpo(req)
  const tipo = String(req.headers['content-type'] ?? '')
  if (tipo.startsWith('multipart/form-data')) {
    const form = await new Request('http://local/', {
      method: 'POST',
      headers: { 'content-type': tipo },
      body: corpo,
    }).formData()
    let arquivo = null
    for (const [, valor] of form.entries()) {
      if (typeof valor === 'object' && valor !== null && 'arrayBuffer' in valor) {
        arquivo = valor
        break
      }
    }
    if (!arquivo) throw Object.assign(new Error('Nenhum arquivo no formulário'), { status: 400 })
    return {
      dados: Buffer.from(await arquivo.arrayBuffer()),
      mime: arquivo.type || 'application/octet-stream',
      cache: String(form.get('cacheControl') ?? '3600'),
    }
  }
  const cache = String(req.headers['cache-control'] ?? 'max-age=3600').replace(/^max-age=/, '')
  return { dados: corpo, mime: tipo.split(';')[0].trim() || 'application/octet-stream', cache }
}

async function enviar(req, res, balde, nome, metodo) {
  const b = await buscarBalde(balde)
  if (!b) return erroStorage(res, 404, 'Bucket not found', 'Bucket not found')
  const { dados, mime, cache } = await lerUpload(req)
  if (b.file_size_limit && dados.length > Number(b.file_size_limit)) {
    return erroStorage(res, 413, 'Payload too large', 'The object exceeded the maximum allowed size')
  }
  if (!mimePermitido(b, mime)) {
    return erroStorage(res, 415, 'invalid_mime_type', `mime type ${mime} is not supported`)
  }
  const upsert = metodo === 'POST' && String(req.headers['x-upsert'] ?? '') === 'true'
  const etag = `"${createHash('md5').update(dados).digest('hex')}"`
  const metadata = {
    eTag: etag,
    size: dados.length,
    mimetype: mime,
    cacheControl: `max-age=${cache}`,
    lastModified: new Date().toISOString(),
    contentLength: dados.length,
    httpStatusCode: 200,
  }
  const { claims } = identidade(req)
  const dono = claims.sub ?? null
  const destino = arquivoEmDisco(balde, nome)
  const temporario = `${destino}.${randomUUID()}.tmp`

  const id = await comoUsuario(req, async (c) => {
    let r
    if (metodo === 'PUT') {
      r = await c.query(
        `update storage.objects set metadata = $3, updated_at = now(), version = $4
          where bucket_id = $1 and name = $2 returning id`,
        [balde, nome, metadata, randomUUID()],
      )
      if (r.rowCount === 0) throw Object.assign(new Error('Object not found'), { status: 404 })
    } else {
      r = await c.query(
        `insert into storage.objects (bucket_id, name, owner, owner_id, metadata, version)
         values ($1, $2, $3, $4, $5, $6)
         ${upsert ? `on conflict (bucket_id, name) do update
                      set metadata = excluded.metadata, updated_at = now(),
                          owner = excluded.owner, owner_id = excluded.owner_id, version = excluded.version` : ''}
         returning id`,
        [balde, nome, dono, dono, metadata, randomUUID()],
      )
    }
    // Arquivo gravado antes do COMMIT: se o disco falhar, a linha não fica.
    await mkdir(dirname(destino), { recursive: true })
    await writeFile(temporario, dados)
    await rename(temporario, destino)
    return r.rows[0].id
  }).catch(async (e) => {
    await rm(temporario, { force: true })
    throw e
  })
  return responder(res, 200, { Id: id, Key: `${balde}/${nome}` })
}

/** Linha de storage.objects que o usuário enxerga (RLS), ou null. */
async function objetoVisivel(req, balde, nome) {
  return comoUsuario(req, async (c) => {
    const { rows } = await c.query(
      'select * from storage.objects where bucket_id = $1 and name = $2',
      [balde, nome],
    )
    return rows[0] ?? null
  })
}

async function servirArquivo(req, res, balde, nome, metadata, baixar) {
  let dados
  try {
    dados = await readFile(arquivoEmDisco(balde, nome))
  } catch {
    return erroStorage(res, 404, 'not_found', 'Object not found')
  }
  const cabecalhos = {
    ...CORS,
    'content-type': metadata?.mimetype ?? 'application/octet-stream',
    'content-length': String(dados.length),
    'cache-control': metadata?.cacheControl ?? 'max-age=3600',
    etag: metadata?.eTag ?? '',
    'last-modified': new Date(metadata?.lastModified ?? Date.now()).toUTCString(),
  }
  if (baixar !== null && baixar !== undefined) {
    const arquivo = baixar || nome.split('/').pop()
    cabecalhos['content-disposition'] = `attachment; filename="${encodeURIComponent(arquivo)}"`
  }
  res.writeHead(200, cabecalhos)
  res.end(req.method === 'HEAD' ? undefined : dados)
}

function assinarUrl(balde, nome, expiraEm) {
  const agora = Math.floor(Date.now() / 1000)
  const token = assinar({ url: `${balde}/${nome}`, iat: agora, exp: agora + Math.floor(expiraEm) })
  return `/object/sign/${balde}/${nome}?token=${token}`
}

async function listar(req, res, balde, corpo) {
  let prefixo = String(corpo.prefix ?? '')
  if (prefixo && !prefixo.endsWith('/')) prefixo += '/'
  const limite = Math.max(1, Math.min(Number(corpo.limit ?? 100), 1000))
  const deslocamento = Math.max(0, Number(corpo.offset ?? 0))
  const busca = String(corpo.search ?? '').toLowerCase()
  const coluna = ['name', 'created_at', 'updated_at', 'last_accessed_at'].includes(corpo.sortBy?.column)
    ? corpo.sortBy.column
    : 'name'
  const ordem = corpo.sortBy?.order === 'desc' ? -1 : 1

  const linhas = await comoUsuario(req, async (c) => {
    const escapado = prefixo.replace(/[\\%_]/g, (m) => `\\${m}`)
    const { rows } = await c.query(
      `select id, name, updated_at, created_at, last_accessed_at, metadata
         from storage.objects where bucket_id = $1 and name like $2 || '%'`,
      [balde, escapado],
    )
    return rows
  })

  const pastas = new Map()
  const arquivos = []
  for (const l of linhas) {
    const resto = l.name.slice(prefixo.length)
    if (resto.includes('/')) {
      const pasta = resto.split('/')[0]
      if (!pastas.has(pasta)) {
        pastas.set(pasta, { name: pasta, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null })
      }
    } else {
      arquivos.push({ ...l, name: resto })
    }
  }
  const todos = [...pastas.values(), ...arquivos]
    .filter((e) => !busca || e.name.toLowerCase().startsWith(busca))
    .sort((a, b) => {
      const x = a[coluna] ?? ''
      const y = b[coluna] ?? ''
      return (x < y ? -1 : x > y ? 1 : 0) * ordem
    })
  return responder(res, 200, todos.slice(deslocamento, deslocamento + limite))
}

async function excluir(req, res, balde, nomes) {
  if (!Array.isArray(nomes) || nomes.some((n) => typeof n !== 'string')) {
    return erroStorage(res, 400, 'Error', 'prefixes deve ser uma lista de caminhos')
  }
  const apagados = await comoUsuario(req, async (c) => {
    const { rows } = await c.query(
      `delete from storage.objects where bucket_id = $1 and name = any($2::text[])
       returning bucket_id, name, id, owner, created_at, updated_at, last_accessed_at, metadata`,
      [balde, nomes],
    )
    return rows
  })
  for (const a of apagados) await rm(arquivoEmDisco(balde, a.name), { force: true })
  return responder(res, 200, apagados)
}

/** "balde/caminho/do/arquivo" → [balde, caminho]. */
function separar(resto) {
  const decodificado = decodeURIComponent(resto)
  const i = decodificado.indexOf('/')
  if (i < 0) return [decodificado, '']
  return [decodificado.slice(0, i), decodificado.slice(i + 1)]
}

async function rotaStorage(req, res, caminho, url) {
  // URL assinada: não exige apikey nem sessão, só o token.
  if (caminho.startsWith('/object/sign/') && (req.method === 'GET' || req.method === 'HEAD')) {
    const [balde, nome] = separar(caminho.slice('/object/sign/'.length))
    const carga = conferir(url.searchParams.get('token'))
    if (!carga) return erroStorage(res, 400, 'InvalidJWT', 'jwt expired or invalid signature')
    if (carga.url !== `${balde}/${nome}`) {
      return erroStorage(res, 400, 'InvalidSignature', 'The url do not match the signature')
    }
    const { rows } = await banco.query(
      'select metadata from storage.objects where bucket_id = $1 and name = $2',
      [balde, nome],
    )
    if (!rows[0]) return erroStorage(res, 404, 'not_found', 'Object not found')
    return servirArquivo(req, res, balde, nome, rows[0].metadata, url.searchParams.get('download'))
  }

  if (caminho.startsWith('/object/sign/') && req.method === 'POST') {
    const [balde, nome] = separar(caminho.slice('/object/sign/'.length))
    const corpo = await lerJson(req)
    const expira = Number(corpo.expiresIn)
    if (!Number.isFinite(expira) || expira < 1) {
      return erroStorage(res, 400, 'Error', 'expiresIn deve ser um número positivo')
    }
    if (!nome) {
      // Lote: { expiresIn, paths }
      const caminhos = Array.isArray(corpo.paths) ? corpo.paths.map(String) : []
      const visiveis = await comoUsuario(req, async (c) => {
        const { rows } = await c.query(
          'select name from storage.objects where bucket_id = $1 and name = any($2::text[])',
          [balde, caminhos],
        )
        return new Set(rows.map((r) => r.name))
      })
      return responder(
        res,
        200,
        caminhos.map((p) =>
          visiveis.has(p)
            ? { error: null, path: p, signedURL: assinarUrl(balde, p, expira) }
            : {
                error: 'Either the object does not exist or you do not have access to it',
                path: p,
                signedURL: null,
              },
        ),
      )
    }
    const obj = await objetoVisivel(req, balde, nome)
    if (!obj) return erroStorage(res, 404, 'not_found', 'Object not found')
    return responder(res, 200, { signedURL: assinarUrl(balde, nome, expira) })
  }

  if (caminho.startsWith('/object/list/') && req.method === 'POST') {
    const [balde] = separar(caminho.slice('/object/list/'.length))
    return listar(req, res, balde, await lerJson(req))
  }

  if (caminho.startsWith('/object/info/')) {
    let resto = caminho.slice('/object/info/'.length)
    if (resto.startsWith('authenticated/')) resto = resto.slice('authenticated/'.length)
    const [balde, nome] = separar(resto)
    const obj = await objetoVisivel(req, balde, nome)
    if (!obj) return erroStorage(res, 404, 'not_found', 'Object not found')
    return responder(res, 200, {
      id: obj.id,
      name: obj.name,
      version: obj.version,
      bucket_id: obj.bucket_id,
      size: obj.metadata?.size ?? null,
      content_type: obj.metadata?.mimetype ?? null,
      cache_control: obj.metadata?.cacheControl ?? null,
      etag: obj.metadata?.eTag ?? null,
      metadata: obj.user_metadata ?? {},
      last_modified: obj.updated_at,
      created_at: obj.created_at,
    })
  }

  if (caminho.startsWith('/object/public/')) {
    const [balde, nome] = separar(caminho.slice('/object/public/'.length))
    const b = await buscarBalde(balde)
    if (!b?.public) return erroStorage(res, 400, 'not_found', 'Object not found')
    const { rows } = await banco.query(
      'select metadata from storage.objects where bucket_id = $1 and name = $2',
      [balde, nome],
    )
    if (!rows[0]) return erroStorage(res, 404, 'not_found', 'Object not found')
    return servirArquivo(req, res, balde, nome, rows[0].metadata, url.searchParams.get('download'))
  }

  if (
    caminho.startsWith('/object/upload/sign/') ||
    caminho === '/object/move' ||
    caminho === '/object/copy' ||
    caminho.startsWith('/render/')
  ) {
    return erroStorage(res, 501, 'not_implemented', `${caminho} não existe no portão local`)
  }

  if (caminho.startsWith('/object/')) {
    let resto = caminho.slice('/object/'.length)
    const autenticado = resto.startsWith('authenticated/')
    if (autenticado) resto = resto.slice('authenticated/'.length)
    const [balde, nome] = separar(resto)

    if (req.method === 'DELETE') {
      if (!nome) return excluir(req, res, balde, (await lerJson(req)).prefixes)
      return excluir(req, res, balde, [nome])
    }
    if (!nomeValido(nome)) return erroStorage(res, 400, 'InvalidKey', `Invalid key: ${nome}`)
    if (req.method === 'GET' || req.method === 'HEAD') {
      const obj = await objetoVisivel(req, balde, nome)
      if (!obj) return erroStorage(res, 404, 'not_found', 'Object not found')
      return servirArquivo(req, res, balde, nome, obj.metadata, url.searchParams.get('download'))
    }
    if (!autenticado && (req.method === 'POST' || req.method === 'PUT')) {
      return enviar(req, res, balde, nome, req.method)
    }
  }

  if (caminho === '/bucket' && req.method === 'GET') {
    const baldes = await comoUsuario(req, async (c) => (await c.query('select * from storage.buckets')).rows)
    return responder(res, 200, baldes)
  }
  if (caminho.startsWith('/bucket/') && req.method === 'GET') {
    const b = await buscarBalde(decodeURIComponent(caminho.slice('/bucket/'.length)))
    return b ? responder(res, 200, b) : erroStorage(res, 404, 'Bucket not found', 'Bucket not found')
  }

  return erroStorage(res, 404, 'not_found', `Rota de storage não existe no portão local: ${caminho}`)
}

// ─────────────────────────────────────────────────── REST → PostgREST ─────
async function rotaRest(req, res, url) {
  const corpo = await lerCorpo(req)
  const destino = new URL(POSTGREST)
  const cabecalhos = { ...req.headers, host: destino.host }
  if (!cabecalhos.authorization && cabecalhos.apikey) cabecalhos.authorization = `Bearer ${cabecalhos.apikey}`
  delete cabecalhos.apikey
  delete cabecalhos['content-length']
  delete cabecalhos.origin

  const adiante = pedir(
    {
      hostname: destino.hostname,
      port: destino.port,
      path: url.pathname.replace(/^\/rest\/v1/, '') + url.search,
      method: req.method,
      headers: { ...cabecalhos, 'content-length': String(corpo.length) },
    },
    (resposta) => {
      // O PostgREST manda os próprios cabeçalhos de CORS; os dele saem.
      const deles = Object.fromEntries(
        Object.entries(resposta.headers).filter(([k]) => !k.toLowerCase().startsWith('access-control-')),
      )
      res.writeHead(resposta.statusCode ?? 502, { ...deles, ...CORS })
      resposta.pipe(res)
    },
  )
  adiante.on('error', (e) => responder(res, 502, { message: `PostgREST não respondeu: ${e.message}` }))
  adiante.end(corpo)
}

// ────────────────────────────────────────────────────────── servidor ──────
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', URL_PUBLICA)
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      return res.end()
    }

    const assinada = url.pathname.startsWith('/storage/v1/object/sign/') && req.method !== 'POST'
    const publica = url.pathname.startsWith('/storage/v1/object/public/')
    if (!assinada && !publica && url.pathname !== '/') {
      // Como o Kong: toda chamada precisa de uma apikey válida.
      const chave = req.headers.apikey ?? url.searchParams.get('apikey')
      if (!chave) return responder(res, 401, { message: 'No API key found in request' })
      if (!conferir(chave)) return responder(res, 401, { message: 'Invalid API key' })
    }

    if (url.pathname.startsWith('/auth/v1/')) {
      return await rotaAuth(req, res, url.pathname.slice('/auth/v1'.length), url)
    }
    if (url.pathname.startsWith('/storage/v1/')) {
      return await rotaStorage(req, res, url.pathname.slice('/storage/v1'.length), url).catch((e) =>
        traduzirErroBanco(res, e),
      )
    }
    if (url.pathname.startsWith('/rest/v1')) return await rotaRest(req, res, url)
    if (url.pathname.startsWith('/functions/v1/')) {
      return responder(res, 501, { message: 'O Obtra não usa Edge Functions (tudo é RPC SQL).' })
    }
    if (url.pathname === '/') return responder(res, 200, { portao: 'obtra', rest: POSTGREST })
    return responder(res, 404, { message: `Rota desconhecida: ${url.pathname}` })
  } catch (e) {
    console.error('[portão]', e)
    if (!res.headersSent) responder(res, e.status ?? 500, { message: e.message })
  }
}).listen(PORTA, '127.0.0.1', async () => {
  await mkdir(PASTA, { recursive: true })
  await stat(PASTA)
  console.log(`portão do Obtra em ${URL_PUBLICA}`)
  console.log(`  REST     → ${POSTGREST}`)
  console.log(`  arquivos → ${PASTA}`)
})
