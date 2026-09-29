# Obtra — Diário de Obra

Sistema multiempresa de **Relatório Diário de Obra (RDO)**: construtoras cadastram suas obras,
preenchem relatórios diários com clima, mão de obra, equipamentos, atividades, ocorrências,
materiais, notas de compras e fotos, geram **PDF** na hora e dão ao cliente final um
**acesso único** para acompanhar a obra. Você, como **master**, administra todas as empresas.

- **Front:** Vite + React + TypeScript + Tailwind (pasta `web/`) — hospedado na **Vercel**.
- **Back:** 100% **Supabase** (Postgres + RLS + Auth + Storage), sem Edge Functions (pasta `supabase/`).
- **Economia de armazenamento:** fotos comprimidas no aparelho (WebP, 1600 px, ~150 KB + miniatura ~20 KB);
  PDF do RDO gerado no navegador (não ocupa nada); PDFs anexados são recompactados antes do envio;
  cota de armazenamento por empresa controlada pelo banco.

Especificação completa: [`docs/CONTRATO.md`](docs/CONTRATO.md).

---

## Passo a passo: instalar e colocar no ar

Você vai precisar de três contas gratuitas: **GitHub** (já tem — o código está aqui),
**Supabase** (banco) e **Vercel** (site).

### 1. Criar o projeto no Supabase

1. Entre em <https://supabase.com> → **New project**.
2. Dê o nome `obtra`, escolha uma senha forte para o banco (guarde-a) e a região **South America (São Paulo)**.
3. Aguarde o projeto ficar pronto (1–2 minutos).

### 2. Criar o banco (colar o SQL)

1. No painel do Supabase, abra **SQL Editor** → **New query**.
2. Abra o arquivo [`supabase/instalar.sql`](supabase/instalar.sql) deste repositório
   (ele junta todas as migrações na ordem certa), copie **todo** o conteúdo, cole no editor e clique **Run**.
   - Deve terminar com "Success. No rows returned".
   - Alternativa: rodar um por um os arquivos de `supabase/migrations/`, na ordem do nome.
   - Pode rodar de novo sem medo: o SQL é idempotente.
3. Confira: em **Table Editor** devem aparecer as tabelas `empresas`, `obras`, `relatorios`, `fotos`…
   e em **Storage** o bucket `obtra` (privado).

### 3. Criar o seu acesso master

Ainda no **SQL Editor**, rode (troque e-mail, senha e nome):

```sql
select admin_criar_usuario('seu-email@dominio.com', 'SuaSenhaForte123', 'Seu Nome', 'master', null);
```

Esse usuário já nasce confirmado e é o único com poder sobre todas as empresas.

### 4. Ajustar a autenticação

Em **Authentication → Sign In / Providers → Email**:

- **Desligue** "Allow new users to sign up" (os usuários são criados por você e pelos
  administradores de cada empresa dentro do sistema — não existe cadastro aberto).

Em **Authentication → URL Configuration** (preencha depois do passo 6, quando tiver o endereço da Vercel):

- **Site URL:** `https://seu-projeto.vercel.app`
- **Redirect URLs:** `https://seu-projeto.vercel.app/**`

(Isso faz o link de "Esqueci minha senha" voltar para o sistema.)

### 5. Pegar as chaves do Supabase

Em **Project Settings → API** (ou **Data API**), copie:

- **Project URL** → vai virar `VITE_SUPABASE_URL`
- **anon public key** (ou "Publishable key") → vai virar `VITE_SUPABASE_ANON_KEY`

> Nunca use a `service_role` / "secret key" no front.

### 6. Publicar na Vercel

1. Entre em <https://vercel.com> com sua conta do GitHub → **Add New… → Project**.
2. Importe o repositório **`neyliane15/obtra`**.
   (Se o código ainda estiver numa branch, faça o merge para a `main` antes, ou escolha a branch em
   *Settings → Git → Production Branch*.)
3. A Vercel detecta **Vite** sozinha (o `vercel.json` já define build `npm run build` e saída `dist`).
4. Em **Environment Variables**, adicione:
   | Nome | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | a Project URL do passo 5 |
   | `VITE_SUPABASE_ANON_KEY` | a anon key do passo 5 |
5. Clique **Deploy**. Em ~1 minuto você recebe o endereço `https://….vercel.app`.
6. Volte ao passo 4 e preencha **Site URL** / **Redirect URLs** com esse endereço.
7. (Opcional) Domínio próprio: Vercel → **Settings → Domains** → adicione `obtra.seudominio.com.br`
   e siga as instruções de DNS. Depois atualize também as URLs no Supabase.

### 7. Primeiro uso

1. Acesse o endereço da Vercel e entre com o e-mail/senha master.
2. **Empresas → Nova empresa**: cadastre a construtora, defina o limite de armazenamento e crie o
   **administrador** dela.
3. O administrador entra, cadastra **Obras**, **Mão de obra**, **Funções**, **Materiais**, **Equipamentos**
   e a equipe em **Usuários & Clientes**.
4. Em **Usuários & Clientes → Novo cliente**, escolha as obras dele: o sistema mostra o **acesso único**
   (e-mail + senha) para copiar ou enviar por WhatsApp. O cliente só vê relatórios **aprovados**.

### (Opcional) Dados de demonstração

Para testar com empresas e obras fictícias, rode `supabase/seed/demo.sql` no SQL Editor.
Ele cria contas com senha `obtra123` (ex.: `admin@construtoraaurora.com.br`, `cliente@exemplo.com`).
**Não use em produção** — ou exclua essas contas depois.

---

## Planos do Supabase e armazenamento

- Plano gratuito: 500 MB de banco e **1 GB de Storage**. Com a compressão do Obtra, 1 GB comporta
  aproximadamente **5.000–6.000 fotos**. O plano Pro (US$ 25/mês) traz 100 GB (≈ 500 mil fotos).
- O limite por empresa (padrão 2 GB) é ajustado pelo master em **Empresas**. O uso aparece para o
  master e para o administrador de cada empresa.
- Projetos gratuitos do Supabase **pausam após 7 dias sem uso** — para produção, prefira o plano Pro.

## Rodar no computador (desenvolvedores)

```bash
npm install
cp .env.example .env        # preencha com as chaves do Supabase
npm run dev                 # http://localhost:5173
```

Verificações:

```bash
npm run typecheck && npm test && npm run build
npm run test:banco          # suíte de segurança do banco (precisa de Postgres 16 local)
ferramentas/local/subir.sh  # sistema inteiro local, sem nuvem (Postgres + PostgREST + portão)
```

Veja `supabase/README.md` e `ferramentas/local/README.md` para detalhes.

## Papéis

| Papel | O que faz |
|---|---|
| **Master** | Você. Vê e edita tudo, cria/exclui empresas, define limites de armazenamento. |
| **Administrador** | Tudo dentro da própria empresa: obras, RDOs, aprovação, equipe e clientes. |
| **Colaborador** | Preenche RDOs, envia fotos e documentos, manda para aprovação. |
| **Cliente** | Acesso único, só leitura das suas obras: RDOs aprovados, fotos, documentos, PDF e comentários. |
