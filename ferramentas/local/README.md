# Obtra na máquina (sem Docker, sem nuvem)

```bash
ferramentas/local/subir.sh          # Postgres + PostgREST + portão; grava .env.local
node ferramentas/local/fumaca.mjs   # prova de fumaça com o supabase-js de verdade
npm run dev
```

API em `http://127.0.0.1:54321`; a anon key é impressa pelo script e gravada em
`.env.local`. Senha de todos: `obtra123`.

| E-mail | Papel |
|---|---|
| `master@obtra.app` | master |
| `admin@construtoraaurora.com.br` | admin — Construtora Aurora |
| `engenheiro@construtoraaurora.com.br` | colaborador — Construtora Aurora |
| `mestre@construtoraaurora.com.br` | colaborador — Construtora Aurora |
| `cliente@exemplo.com` | cliente — Residencial Vista Azul |
| `admin@betaengenharia.com.br` | admin — Beta Engenharia |

## O que é real

Postgres com as migrações, a RLS e os gatilhos; PostgREST (entra como
`authenticator`, como no Supabase); JWT HS256 assinado com o mesmo segredo.
O `portao.mjs` faz o papel do Kong + GoTrue + Storage:

- **Auth**: `POST /auth/v1/token` (`password` confere bcrypt em
  `auth.users.encrypted_password` via `crypt()`; `refresh_token`), `GET/PUT
  /auth/v1/user` (troca da própria senha), `POST /auth/v1/logout`,
  `POST /auth/v1/signup` (cadastro aberto, como o GoTrue). Se um usuário tiver
  colunas de token NULL em `auth.users`, o login falha como no GoTrue real.
- **Storage**: upload (`POST|PUT /object/{bucket}/{path}`, multipart ou corpo
  cru, `x-upsert`), URL assinada unitária e em lote, download pela URL
  assinada e autenticado, `list`, `remove`, `info`. A linha em
  `storage.objects` é lida/gravada **como o usuário** (role `authenticated` +
  `request.jwt.claims`), então as políticas do bucket valem. Arquivos em
  `.local-storage/`. Tamanho e tipos do bucket são conferidos.
- **REST**: repassa para o PostgREST (Authorization, Prefer, Range, respostas).

Simplificado: sessões em memória (reiniciar o portão não derruba o token, mas
um logout só vale até reiniciar), sem e-mail, sem transformação de imagem,
sem URL assinada de upload.

## Parar

```bash
kill "$(cat "${TMPDIR:-/tmp}/obtra-local/postgrest.pid")" "$(cat "${TMPDIR:-/tmp}/obtra-local/portao.pid")"
```

Logs em `${TMPDIR:-/tmp}/obtra-local/`.
