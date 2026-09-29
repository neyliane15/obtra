# Banco do Obtra (Supabase)

Tudo é Postgres: tabelas, RLS, gatilhos e RPCs `security definer`. **Não há Edge
Functions** — instalar é rodar SQL. A especificação é `docs/CONTRATO.md`.

```
migrations/   schema, funções, RLS, RPCs, bucket `obtra`, privilégios (idempotentes)
seed/demo.sql carga de demonstração (opcional; cria contas com senha conhecida)
testes/       suíte de banco num Postgres local (npm run test:banco)
```

## Instalar num projeto Supabase

1. **Migrações, em ordem** (`20260929000001_…` até a última). Qualquer um dos três:
   - SQL Editor: colar e rodar `instalar.sql` (todas as migrações num arquivo só,
     gerado por `npm run sql:instalar` — regere sempre que mudar `migrations/`), ou
   - `supabase link --project-ref SEU_REF && supabase db push`, ou
   - SQL Editor: colar e rodar cada arquivo de `migrations/`, na ordem do nome.

   Todas são idempotentes: rodar de novo não quebra nada.
2. **Criar o master** (SQL Editor, que roda como `postgres`):
   ```sql
   select admin_criar_usuario('voce@seudominio.com', 'uma-senha-forte', 'Seu Nome', 'master', null);
   ```
   O usuário já nasce com e-mail confirmado e entra direto. Alternativas:
   - deixar o cadastro aberto e definir o e-mail antes — quem se cadastrar com
     ele vira master (só enquanto não existir nenhum master):
     ```sql
     update configuracao set master_email = 'voce@seudominio.com';
     ```
   - promover uma conta que já existe: `select tornar_master('voce@seudominio.com');`
3. **Auth → Providers → Email**: o sistema cria as contas pela RPC
   `admin_criar_usuario`; se não quiser cadastro aberto, desligue
   "Allow new users to sign up" (quem se cadastrar sozinho nasce `cliente` sem
   empresa e não vê nada, mas não há por que deixar a porta aberta).
4. **Demonstração (opcional)**: rodar `seed/demo.sql` no SQL Editor. Cria as
   contas da Construtora Aurora e da Beta Engenharia com senha `obtra123` —
   troque as senhas ou exclua essas contas se o projeto for de verdade.
5. No front: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Settings → API).

O bucket `obtra` (privado, 15 MB, webp/jpeg/png/pdf) e as políticas de
`storage.objects` são criados pela migração `…05_storage.sql`.
A `…07_notas_internas_e_arquivos_orfaos.sql` fecha as notas de compras ao
cliente (só a equipe lê `relatorio_notas_compras`) e deixa o admin limpar no
Storage a pasta de uma obra já excluída (sem ela os arquivos ficavam órfãos,
ocupando a cota).

## Testar localmente

```bash
npm run test:banco     # cria um Postgres descartável, aplica tudo 2x, roda testes/*.sql
```

Precisa de Postgres 16 em `/usr/lib/postgresql/16/bin` (o script cria o
cluster sozinho, como usuário `pg`, socket em `/home/pg/sock`).
`testes/00_ambiente_supabase.sql` imita o que o Supabase traz pronto
(`auth.users`/`auth.identities` com as colunas do GoTrue, `auth.uid()`,
`storage.*`, papéis `anon`/`authenticated`/`service_role`/`authenticator`,
`extensions.pgcrypto`) — inclusive os **privilégios padrão** do Supabase em
`public` (ALL para anon/authenticated em toda tabela/função nova), que a 0006
tem de desfazer. Os testes vestem cada usuário com
`set local role authenticated` + `request.jwt.claim.sub`, como o PostgREST.

`testes/40_auditoria.sql` é a auditoria adversarial: catálogo (quem executa
o quê, `search_path`, RLS ligada, índice em toda FK, `(select auth.uid())` nas
políticas), isolamento entre empresas em todas as tabelas e no bucket,
escalonamento de privilégio, cliente, cota, numeração, histórico e o formato
das contas em `auth.users`/`auth.identities`. `testes/50_entrega.sql` cobre a
migração 0007 (notas internas; limpeza da pasta de obra excluída).

Para o sistema inteiro rodando (API + login + Storage): `ferramentas/local/`.
