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

---

## ADENDO 1 — Estrutura baseada nos prints de referência do cliente (prevalece sobre o texto acima)

O cliente enviou prints de um sistema de referência ("RDO PRO"). O Obtra deve seguir essa ESTRUTURA (com identidade própria: azul-escuro, fundo claro).

### Menu lateral (equipe da empresa)
Dashboard · Obras · Relatórios (RDO) · Histórico · Mão de Obra · Funções · Materiais · Equipamentos · Relatórios & Exportação · Usuários & Clientes · (rodapé) Configurações · Sair · cartão do usuário (iniciais, nome, papel).
Topo da sidebar: logo da empresa (ou do Obtra) + nome da empresa + subtítulo "OBTRA · RDO".
Master tem ainda: Empresas (área master) e seletor de empresa.

### Obras — lista em TABELA
Colunas: Obra · Contratante · Local (cidade - UF) · Responsável · Prazo (dias) · Decorrido (dias desde data_inicio) · A vencer (prazo − decorrido; vermelho se negativo) · Status (pílula) · Ações (editar, excluir). Filtros: busca (obra, contratante, responsável), status, responsável. Botão "+ Nova Obra". Subtítulo "N obras cadastradas". (Pode ter alternância tabela/cartões; tabela é o padrão; no celular vira cartões.)

### Relatórios (RDO) — lista GLOBAL da empresa
Colunas: Nº (formato `RD-{numero}`) · Obra · Data (dd/mm/aaaa) · Dia (da semana) · Responsável · Status (Rascunho / Pendente Aprovação / Aprovado) · Aprovado por · Ações. Filtros: busca por número ou obra, obra, status. Botão "+ Novo RDO". Subtítulo "X de Y relatórios".
Rótulos de status: `preenchendo` → "Rascunho"; `revisar` → "Pendente Aprovação"; `aprovado` → "Aprovado".

### Formulário do RDO (novo/editar) — seções colapsáveis com contador de itens
1. **Cabeçalho do Relatório**: Nº (RD-x, somente leitura), Obra (select), Data, Dia da semana (automático), Responsável (texto, default nome do usuário).
2. **Informações de Prazo** (automático da obra): Prazo contratual, Prazo decorrido (na data do RDO), Prazo a vencer.
3. **Horário de Trabalho**: Entrada, Saída, Intervalo início, Intervalo fim, Horas trabalhadas (calculado, ex.: 08h00).
4. **Condição Climática**: cartões Manhã / Tarde (/ Noite opcional) com Clima (claro, nublado, chuvoso) e Condição (praticável, impraticável), ícones.
5. **Mão de Obra**: linhas (colaborador do cadastro ou função + quantidade, própria/terceirizada); botões "Adicionar linha", "Novo colaborador", "Nova função" (cadastram na hora).
6. **Equipamentos** (do cadastro ou livre, com quantidade).
7. **Atividades Realizadas**.
8. **Ocorrências**.
9. **Comentários**.
10. **Materiais Recebidos** e 11. **Materiais Utilizados** (do cadastro de materiais ou livre; quantidade + unidade).
12. **Notas de Compras** (fornecedor, nº da nota, valor, descrição).
13. **Galeria de Fotos**.
Rodapé FIXO (sticky) com pílula de status à esquerda e botões: "Salvar Rascunho" · "Enviar para Aprovação" · "Salvar e Aprovar" (este só admin/master).
No fluxo "Novo RDO" o relatório só é criado (RPC `criar_relatorio`) ao escolher obra+data e salvar; depois segue editando.

### Mudanças no banco
- `relatorios`: + `responsavel text`, + `intervalo_inicio time`, + `intervalo_fim time`. (Noite continua opcional.)
- Cadastros por empresa (todos: `id, empresa_id uuid not null references empresas on delete cascade` — preenchido por default/trigger com `minha_empresa()` quando nulo e o usuário não é master —, `ativo bool default true, criado_em`, `unique(empresa_id, nome)` quando fizer sentido; RLS: equipe da empresa lê e escreve; admin/master excluem; colaborador pode inserir/editar; cliente não vê):
  - `funcoes`: `nome text not null`
  - `colaboradores` (Mão de Obra): `nome text not null, funcao_id uuid references funcoes on delete set null, tipo text not null default 'propria' check in ('propria','terceirizada'), empresa_terceira text, telefone text, documento text`
  - `materiais`: `nome text not null, unidade text` (ex.: m³, sc, un, kg)
  - `equipamentos`: `nome text not null, identificacao text`
- `relatorio_mao_obra`: + `colaborador_id uuid references colaboradores on delete set null`, `funcao` continua texto (preenchido com a função do colaborador ou digitado).
- `relatorio_equipamentos`: + `equipamento_id uuid references equipamentos on delete set null`.
- `relatorio_materiais`: + `material_id uuid references materiais on delete set null`, + `unidade text`. `quantidade` passa a `numeric(12,2)` (ou mantém text — o back decide e documenta; o front trata ambos).
- Nova `relatorio_notas_compras`: `id, relatorio_id, ordem, fornecedor text, numero_nota text, valor numeric(12,2), descricao text, criado_em` (mesmas regras dos outros filhos).
- `criar_relatorio(p_obra, p_data, p_copiar_anterior)` copia também horário (entrada/saída/intervalo) e `responsavel` do anterior; `responsavel` default = nome do perfil.
- Nova `historico`: `id bigserial/uuid, empresa_id uuid, obra_id uuid null, usuario_id uuid null, usuario_nome text, acao text ('criou','editou','excluiu','enviou_aprovacao','aprovou','reabriu','enviou_foto', ...), entidade text ('obra','relatorio','foto','documento','usuario','cadastro'), entidade_id uuid, descricao text, criado_em`. Alimentada por triggers (obras insert/update/delete, relatorios insert/delete e mudança de status, fotos insert/delete, documentos insert/delete). Leitura: master e equipe da empresa (cliente não). Ninguém escreve direto (só triggers security definer). Índice por (empresa_id, criado_em desc).
- `painel_resumo()` inclui também `relatorios_pendentes` (status revisar).

### Visual
Seguir o espírito dos prints (sidebar escura, conteúdo claro, tabelas em cartão com cabeçalho em versalete pequeno, pílulas de status, botões de ação primários chamativos, rodapé fixo no RDO), MAS com a identidade Obtra: sidebar azul-marinho profundo, acento âmbar/amarelo de canteiro para o item ativo e botão primário (como no print, porém harmonizado com o azul), fontes menores e mais refinadas que o print, detalhes de borda (cantoneiras/linhas de prancha técnica).

## Notas do back-end (implementação — como ficou de fato)

Detalhes que o texto acima não fixava, ou em que o back foi mais estrito por segurança. O front pode contar com isto.

### Contas e perfis
- **Metadados só valem vindos da RPC.** O gatilho em `auth.users` só usa `raw_user_meta_data.papel/empresa_id` quando o insert vem de `admin_criar_usuario` (bandeira interna da transação). Cadastro aberto (`supabase.auth.signUp`) nasce **`cliente` sem empresa** (não vê nada) — senão qualquer um se cadastraria como admin de qualquer empresa. Exceção: o e-mail de `configuracao.master_email` vira master **se ainda não existir master**.
- `admin_criar_usuario` aceita `p_papel = 'master'` **só sem JWT** (SQL Editor / service_role) — é o caminho do instalador. Pela API, ninguém cria master.
- Mensagens de erro (em `error.message` do supabase-js): `E-mail já cadastrado`, `A senha deve ter pelo menos 6 caracteres`, `E-mail inválido`, `Informe o nome`, `Informe a empresa do usuário`, `Sem permissão para criar usuários`, `Administrador só cria usuários na própria empresa`, `Você não pode excluir a si mesmo`, `Somente o administrador aprova ou reabre um relatório aprovado`, `Limite de armazenamento da empresa atingido`, `Você não pode alterar o próprio papel, empresa ou situação`.
- `perfis`: o **próprio perfil é sempre legível**, mesmo com `ativo = false` ou empresa inativa (para a tela explicar "conta desativada"); nada mais é visível nesse estado. O cliente lê os perfis `admin`/`colaborador` da empresa dele (nomes em comentários), nunca outros clientes. `perfis.email` não se altera pelo perfil (acompanha `auth.users`).
- `admin_excluir_usuario`: ninguém exclui master pela API. Excluir conta com histórico é seguro: `criado_por`, `aprovado_por`, `autor_id` viram `null`.
- O master excluir uma empresa apaga perfis/obras/tudo dela; as contas em `auth.users` desses usuários ficam órfãs (sem perfil → não veem nada).

### Permissões por tabela (além da tabela de papéis)
- `obras`: inserir/excluir = admin/master; **colaborador edita** (status, capa, observações). `empresa_id` da obra não muda. `capa_path`/`capa_thumb_path` têm de estar em `{empresa_id}/{obra_id}/capa/` (erro `A capa tem de estar na pasta da obra`) — o cliente lê a capa, então ela não pode apontar para outro arquivo.
- `relatorios`: excluir = admin/master. Colaborador não grava `status = 'aprovado'` (nem por UPDATE direto) e não edita aprovado (UPDATE volta 0 linhas, sem erro — use as RPCs para ter mensagem). `obra_id`, `empresa_id`, `numero` não mudam. `aprovado_por/aprovado_em` são preenchidos/limpos por gatilho em qualquer caminho.
- Filhos do RDO: não mudam de `relatorio_id`. `relatorio_comentarios`: o autor edita o próprio; `autor_id` é sempre `auth.uid()` (gatilho).
- `fotos`/`documentos`: `path` (e `thumb_path`) têm de começar com `{empresa_id}/{obra_id}/`; `bytes` é **sobrescrito pelo tamanho real do Storage** (`metadata.size`). Pela API, **o arquivo (e a miniatura) TEM de estar no Storage antes do insert** — senão erro `Arquivo não encontrado no Storage: envie o arquivo antes de registrá-lo` (evita registrar `bytes = 0` e subir depois para furar a cota). `path`/`bytes`/`obra_id` não mudam depois (para trocar: exclua e envie de novo). Ao excluir foto/documento, apague os arquivos no Storage (`remove`) — o banco não apaga objeto.
- Anônimo (sem login) **não tem privilégio em tabela nenhuma** (resposta "permission denied"); a tela de login não deve consultar o banco.

### Storage (mais estrito que o texto acima)
- Leitura pelo **cliente**: só os arquivos que ele já enxerga pelas tabelas — `capa_path/capa_thumb_path` das obras dele, `path/thumb_path` de fotos sem RDO ou de RDO aprovado, `path` de documentos `visivel_cliente`, e o logo da empresa. (Sem isso, um `list` na pasta da obra entregaria fotos de RDO não aprovado.) Consequência: para o cliente, `createSignedUrls` devolve erro por item nos arquivos que ele não pode ver.
- Escrita (equipe): o 2º segmento tem de ser `logo` (só admin/master) ou o id de uma **obra da própria empresa**. Com a cota estourada o Storage recusa novos envios **e sobrescritas (upsert)**; o "usado" aqui é o maior entre o contabilizado em fotos/documentos e o que de fato está no bucket sob `{empresa_id}/` (arquivos órfãos contam).
- Trocar/apagar o **arquivo** de uma foto de RDO aprovado: só admin/master (o colaborador recebe 0 linhas / erro por item no `remove`). Exclua a linha primeiro e depois o arquivo, como o front já faz.

### Embeds úteis no PostgREST (nomes das FKs)
- `relatorios`: `criado:perfis!relatorios_criado_por_fkey(nome)`, `aprovador:perfis!relatorios_aprovado_por_fkey(nome)`, `obras(nome)`.
- `fotos`/`documentos`/`obras`: `perfis!<tabela>_criado_por_fkey(nome)`. `relatorio_comentarios`: `perfis(nome)` (FK `autor_id`).
- Filhos do RDO direto no select: `relatorios?select=*,relatorio_mao_obra(*),relatorio_equipamentos(*),relatorio_atividades(*),relatorio_ocorrencias(*),relatorio_materiais(*),relatorio_notas_compras(*),relatorio_comentarios(*)`.

### Funções auxiliares extras (security definer, `stable`)
`eh_admin(empresa)`, `eh_cliente_da_obra(obra)`, `empresa_da_obra(obra)`, `pode_ver_relatorio(rel)`, `pode_editar_relatorio(rel)`, `empresa_do_relatorio(rel)`, `storage_pode_ler(nome)`, `storage_pode_escrever(nome)`, `storage_pode_alterar(nome)`, `storage_tem_espaco(nome)`, `uuid_seguro(texto)`.
Para as políticas (calculadas uma vez por consulta): `empresa_da_equipe()`, `empresa_do_admin()`, `empresa_do_cliente()` (uuid ou null) e `obras_do_cliente()` (setof uuid).
- Só estas funções e as RPCs da tabela são executáveis por `authenticated`; as internas (`registrar_historico`, `bytes_no_storage`, `pode_administrar_usuario`, gatilhos, `tornar_master`) respondem "permission denied" pela API. Toda função `security definer` tem `search_path = public, pg_temp` (o `pg_temp` por último).

### RPCs — detalhes
- `criar_relatorio`: "anterior" = o de maior `data` (desempate por `numero`). Com `p_copiar_anterior` copia `responsavel`, `horario_inicio/fim`, `intervalo_inicio/fim`, mão de obra (com `colaborador_id`) e equipamentos (com `equipamento_id`) — **não** copia atividades, ocorrências, materiais, notas. Sem anterior ou sem copiar: `responsavel` = nome do perfil de quem cria (vale também para insert direto com `responsavel` vazio).
- `painel_resumo()`: `armazenamento_*` vêm `null` para colaborador e cliente; para o master são a soma de todas as empresas. Inclui `relatorios_pendentes` (status `revisar`).

### Adendo 1 — como ficou
- `relatorio_materiais.quantidade` é **`numeric(12,2)`** (o texto livre de unidade foi para `unidade`).
- `relatorio_mao_obra` ganhou também **`colaborador_nome text`**: com `colaborador_id`, o gatilho preenche `colaborador_nome` e `funcao` (nome da função do cadastro) quando vierem vazios, e no insert herda `tipo = 'terceirizada'` + `empresa_terceira` do cadastro. Assim o RDO guarda o texto (o cliente não lê os cadastros; e o item sobrevive à exclusão do cadastro). Idem `relatorio_equipamentos.nome` (do equipamento) e `relatorio_materiais.descricao`/`unidade` (do material). Pode mandar `funcao: ''` / `nome: ''` / `descricao: ''` que o banco completa.
- Item do RDO só aponta para cadastro da **mesma empresa** do relatório (erro `Colaborador de outra empresa` etc.). `colaboradores.funcao_id` idem.
- Cadastros: `unique(empresa_id, nome)` em `funcoes`, `materiais`, `equipamentos` (não em `colaboradores` — homônimos existem). `empresa_id` não muda. Master precisa informar `empresa_id` (erro `Informe a empresa do cadastro`).
- `historico`: `id bigint` (identity). `obra_id`/`usuario_id` **sem FK** (o registro sobrevive à exclusão). `usuario_nome` = nome do perfil no momento, ou `Sistema` (SQL/carga). Ações: `criou`, `editou`, `excluiu`, `enviou_aprovacao`, `aprovou`, `reabriu`, `devolveu` (revisar → preenchendo), `enviou_foto`, `enviou_documento`. Entidades: `obra`, `relatorio`, `foto`, `documento`, `usuario`, `cadastro`. Eventos: obras (insert/update/delete — status descrito "a → b"), relatórios (insert/delete/mudança de status; edições de conteúdo não geram linha), fotos e documentos (insert/delete), perfis com empresa (insert/delete), cadastros (insert/delete). Exclusões em cascata (obra → seus RDOs/fotos; empresa inteira) não geram linhas extras. `descricao` já vem pronta para exibir (ex.: `RD-4 · Residencial Vista Azul enviado para aprovação`).

### Ambiente local
- Usuário demo extra: `mestre@construtoraaurora.com.br` (colaborador, "Antônio Lima").
- A carga demo (`supabase/seed/demo.sql`) não tem fotos; no ambiente local, `ferramentas/local/subir.sh` sobe em seguida as fotos e capas de `ferramentas/local/fotos-demo/` (ilustrações de obra em WebP, geradas por `gerar.mjs`) pelo mesmo caminho do app (`carregar.mjs`).
- `ferramentas/local/fumaca.mjs` apaga no fim tudo o que criou (inclusive as linhas de histórico), para a demo continuar limpa.
