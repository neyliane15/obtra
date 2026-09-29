# Obtra — Contrato entre banco (Supabase) e front

Este documento é a fonte da verdade. O back implementa exatamente isto; o front
consome exatamente isto. Mudou algo? Atualize aqui primeiro.

## Stack

- Front: Vite + React 18 + TypeScript + Tailwind 4 + React Router 7 + TanStack Query + `@supabase/supabase-js` + lucide-react + date-fns.
- PDF do relatório: gerado **no navegador** com `jspdf` + `jspdf-autotable`, sob demanda. Não é armazenado → custo de armazenamento zero.
- Back: somente Supabase (Postgres + RLS + Auth + Storage). **Sem Edge Functions** — tudo que precisa de privilégio é função SQL `security definer`, para que a instalação seja só "rodar o SQL".
- Idioma: nomes em português, sem acento, snake_case no banco.

## Papéis

| papel        | empresa_id | O que pode |
|--------------|-----------|------------|
| `master`     | null      | Tudo, em todas as empresas. Cria/edita/exclui empresas, usuários, obras, relatórios, fotos. Único dono da plataforma. |
| `admin`      | obrigatória | Tudo dentro da própria empresa: obras, relatórios, fotos, documentos, equipe (admin/colaborador) e clientes. Edita dados da empresa (exceto limite de armazenamento e `ativa`). |
| `colaborador`| obrigatória | Vê todas as obras da empresa; cria/edita relatórios, fotos, documentos. Não gerencia usuários, não exclui obras, não aprova relatórios. |
| `cliente`    | obrigatória | Somente leitura das obras vinculadas a ele em `obra_clientes`. Vê só relatórios com status `aprovado`, suas fotos e os documentos marcados `visivel_cliente`. Pode comentar em relatórios aprovados. |

Empresa com `ativa = false`: ninguém dela (nem clientes) enxerga nada; o master continua vendo.
Usuário com `perfis.ativo = false`: não enxerga nada.

## Tabelas (schema `public`)

Todas têm RLS ligada. `id uuid default gen_random_uuid()` e `criado_em timestamptz default now()` salvo indicação.

### empresas
`id, nome text not null, cnpj text, email text, telefone text, endereco text, cidade text, uf text(2), logo_path text, limite_armazenamento_mb int not null default 2048, armazenamento_usado_bytes bigint not null default 0, ativa bool not null default true, criado_em`

### perfis
`id uuid pk references auth.users on delete cascade, nome text not null, email text not null, papel text not null check in ('master','admin','colaborador','cliente'), empresa_id uuid references empresas on delete cascade (null só para master), telefone text, cargo text, ativo bool not null default true, criado_em`
- Criado automaticamente por trigger em `auth.users` (lendo `raw_user_meta_data`: nome, papel, empresa_id). Se não houver metadados válidos → papel `cliente` sem empresa = não vê nada. O primeiro usuário com e-mail listado em `configuracao.master_email` (ver abaixo) vira master.
- Usuário não pode alterar o próprio `papel`, `empresa_id` nem `ativo` (trigger bloqueia; só master/admin via RPC ou update permitido pela RLS).

### configuracao (linha única)
`id int pk default 1 check (id=1), master_email text` — o instalador define o e-mail do master. Ao se cadastrar (signup) com esse e-mail, vira master. Também existe o RPC `tornar_master(email)` só executável pelo `postgres`/SQL editor.

### obras
`id, empresa_id uuid not null references empresas on delete cascade, nome text not null, codigo text, endereco text, cidade text, uf text, contratante text, responsavel_tecnico text, data_inicio date, prazo_dias int, previsao_termino date, status text not null default 'em_andamento' check in ('nao_iniciada','em_andamento','paralisada','concluida'), capa_path text, capa_thumb_path text, observacoes text, criado_por uuid references perfis on delete set null, criado_em, atualizado_em timestamptz default now()`

### obra_clientes
`obra_id uuid references obras on delete cascade, cliente_id uuid references perfis on delete cascade, primary key (obra_id, cliente_id)`
- O cliente e a obra têm de ser da mesma empresa (trigger valida).

### relatorios (RDO — Relatório Diário de Obra)
`id, obra_id uuid not null references obras on delete cascade, empresa_id uuid not null (preenchido por trigger a partir da obra), numero int not null (sequencial por obra, preenchido por trigger), data date not null, status text not null default 'preenchendo' check in ('preenchendo','revisar','aprovado'), horario_inicio time, horario_fim time, clima_manha text, clima_tarde text, clima_noite text (check in ('claro','nublado','chuvoso') ou null), condicao_manha text, condicao_tarde text, condicao_noite text (check in ('praticavel','impraticavel') ou null), pluviometria_mm numeric(6,1), observacoes text, criado_por uuid, aprovado_por uuid, aprovado_em timestamptz, criado_em, atualizado_em`
- `unique (obra_id, numero)`.
- Relatório `aprovado` só volta a ser editado por admin/master (colaborador não edita aprovado — nem ele nem os filhos).

### Filhos do relatório (todos: `id, relatorio_id uuid not null references relatorios on delete cascade, ordem int not null default 0, criado_em`)
- **relatorio_mao_obra**: `funcao text not null, quantidade int not null default 1 check > 0, tipo text not null default 'propria' check in ('propria','terceirizada'), empresa_terceira text`
- **relatorio_equipamentos**: `nome text not null, quantidade int not null default 1 check > 0`
- **relatorio_atividades**: `descricao text not null, status text not null default 'em_andamento' check in ('iniciada','em_andamento','concluida','paralisada'), progresso int not null default 0 check between 0 and 100`
- **relatorio_ocorrencias**: `descricao text not null, tipo text not null default 'geral' check in ('geral','acidente','atraso','clima','material','seguranca')`
- **relatorio_materiais**: `descricao text not null, quantidade text, tipo text not null default 'recebido' check in ('recebido','utilizado')`
- **relatorio_comentarios**: `autor_id uuid references perfis on delete set null default auth.uid(), texto text not null` (sem `ordem`). Cliente pode inserir em relatório aprovado que ele vê. Autor ou admin/master excluem.

### fotos
`id, empresa_id uuid not null, obra_id uuid not null references obras on delete cascade, relatorio_id uuid references relatorios on delete set null, path text not null, thumb_path text not null, legenda text, largura int, altura int, bytes bigint not null default 0 (soma foto + miniatura), criado_por uuid default auth.uid(), criado_em`
- `empresa_id` preenchido por trigger a partir da obra.
- Cliente vê fotos da obra dele **sem** relatório ou cujo relatório está `aprovado`.

### documentos
`id, empresa_id uuid not null, obra_id uuid not null references obras on delete cascade, nome text not null, path text not null, bytes bigint not null default 0, mime text, visivel_cliente bool not null default false, criado_por uuid default auth.uid(), criado_em`

### Cota de armazenamento
- Trigger em `fotos`/`documentos` (insert/delete, e update de `bytes`) mantém `empresas.armazenamento_usado_bytes`.
- Insert que ultrapassaria `limite_armazenamento_mb` falha com mensagem `Limite de armazenamento da empresa atingido`.

## Funções auxiliares (security definer, `stable`, `set search_path = public`)
- `eh_master() returns bool`
- `minha_empresa() returns uuid`
- `meu_papel() returns text`
- `eh_equipe(empresa uuid) returns bool` — admin/colaborador ativo daquela empresa ativa (ou master).
- `pode_ver_obra(obra uuid) returns bool` — master; equipe da empresa; cliente vinculado.

## RPCs (chamar com `supabase.rpc(nome, args)`)

| função | quem | o que faz |
|---|---|---|
| `admin_criar_usuario(p_email text, p_senha text, p_nome text, p_papel text, p_empresa_id uuid, p_obras uuid[] default '{}', p_telefone text default null, p_cargo text default null) returns uuid` | master (qualquer empresa/papel exceto master); admin (só na própria empresa, papéis admin/colaborador/cliente) | Cria o usuário no `auth.users` + `auth.identities` com senha (bcrypt), e-mail já confirmado, cria/atualiza perfil, vincula obras se cliente. Senha mínima 6. E-mail duplicado → erro `E-mail já cadastrado`. |
| `admin_redefinir_senha(p_usuario uuid, p_senha text) returns void` | master; admin para usuários da empresa dele (não master) | Troca a senha. |
| `admin_excluir_usuario(p_usuario uuid) returns void` | master; admin para usuários da empresa dele (não pode excluir a si mesmo nem master) | Apaga de `auth.users` (cascade no perfil). |
| `definir_obras_cliente(p_cliente uuid, p_obras uuid[]) returns void` | master; admin da empresa | Substitui os vínculos do cliente. |
| `criar_relatorio(p_obra uuid, p_data date, p_copiar_anterior bool default true) returns uuid` | equipe da obra | Cria o RDO com próximo número; se `p_copiar_anterior`, copia mão de obra e equipamentos do último relatório da obra. |
| `mudar_status_relatorio(p_relatorio uuid, p_status text) returns void` | colaborador: preenchendo↔revisar; admin/master: qualquer, incluindo aprovar (grava aprovado_por/em) | |
| `painel_resumo() returns jsonb` | qualquer logado | `{ obras_total, obras_andamento, relatorios_total, relatorios_mes, fotos_total, armazenamento_usado_bytes, armazenamento_limite_bytes, empresas_total (só master) }` no escopo que o usuário enxerga. |
| `tornar_master(p_email text)` | só `postgres` (revogado de anon/authenticated) | Promove um usuário existente a master. |

## Storage

- Bucket **`obtra`**, privado, `file_size_limit` 15 MB, mimes: `image/webp`, `image/jpeg`, `image/png`, `application/pdf`.
- Caminhos (primeiro segmento sempre a empresa):
  - `{empresa_id}/logo/{uuid}.webp`
  - `{empresa_id}/{obra_id}/capa/{uuid}.webp` e `{uuid}_t.webp`
  - `{empresa_id}/{obra_id}/fotos/{uuid}.webp` e `{uuid}_t.webp` (miniatura)
  - `{empresa_id}/{obra_id}/docs/{uuid}.pdf`
- Políticas em `storage.objects` para o bucket `obtra`:
  - SELECT: master; equipe da empresa (segmento 1); cliente com acesso à obra (segmento 2) — ou segmento 2 = `logo`.
  - INSERT/UPDATE/DELETE: master; equipe da empresa (segmento 1). Logo: só admin/master.
- O front exibe imagens por **URL assinada** (`createSignedUrl(s)`, validade 1h), usando a miniatura nas grades e a foto média ao ampliar.

## Economia de armazenamento (regra do produto)

- **Fotos**: comprimidas no navegador antes do upload → WebP, lado maior 1600 px, qualidade 0,72 (≈120–250 KB) + miniatura 400 px qualidade 0,6 (≈15–30 KB). O canvas remove EXIF. Upload do arquivo original nunca acontece.
- **PDF do RDO**: gerado sob demanda no navegador, nunca salvo no Storage.
- **Documentos PDF anexados**: regravados com `pdf-lib` (`useObjectStreams: true`, sem metadados) antes do upload; limite de 15 MB.
- Cota por empresa, visível ao admin e ao master.

## Ambiente local (para testes)
`ferramentas/local/subir.sh` sobe Postgres 16 + PostgREST + um "portão" Node que imita Auth (senha conferida de verdade contra `auth.users.encrypted_password` com bcrypt/`crypt`) e Storage (arquivos em disco, políticas de `storage.objects` aplicadas executando como o usuário). URL `http://127.0.0.1:54321`, anon key impressa pelo script. Usuários de demonstração, senha `obtra123`:
- `master@obtra.app` (master)
- `admin@construtoraaurora.com.br` (admin, Construtora Aurora)
- `engenheiro@construtoraaurora.com.br` (colaborador, Construtora Aurora)
- `cliente@exemplo.com` (cliente, vê a obra "Residencial Vista Azul")
- `admin@betaengenharia.com.br` (admin, Beta Engenharia — outra empresa, para provar isolamento)
