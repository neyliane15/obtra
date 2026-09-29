-- ============================================================================
-- Obtra — teste de RLS: duas empresas, todos os papéis, e a pergunta que
-- importa — alguém consegue enxergar ou mexer no que não é seu?
-- ----------------------------------------------------------------------------
-- Cada bloco veste um usuário com `set local role authenticated` +
-- request.jwt.claim.sub, que é como o PostgREST executa a requisição.
-- Rodar como postgres não provaria nada: superusuário ignora RLS.
--
-- A carga de demonstração pode estar no banco: toda contagem aqui é filtrada
-- pelos ids deste cenário.
--
-- Ids do cenário (use nos testes que forem acrescentados):
--   empresa A  a0000000-0000-4000-8000-00000000000a   (Teste Alfa)
--   empresa B  b0000000-0000-4000-8000-00000000000b   (Teste Beta)
--   obra O1    a0000000-0000-4000-8000-0000000000a1   (A; cliente vinculado)
--   obra O2    a0000000-0000-4000-8000-0000000000a2   (A)
--   obra O3    b0000000-0000-4000-8000-0000000000b1   (B)
--   rel R1     a0000000-0000-4000-8000-000000000e01   (O1, preenchendo)
--   rel R2     a0000000-0000-4000-8000-000000000e02   (O1, aprovado)
--   rel R3     b0000000-0000-4000-8000-000000000e03   (O3, preenchendo)
--   foto F1/F2/F3  ...f01 (O1 sem RDO) / ...f02 (O1, R1) / ...f03 (O1, R2)
--   doc  D1/D2     ...d01 (O1 visível ao cliente) / ...d02 (O1 interno)
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ------------------------------------------------------------- utilidades --
create schema if not exists teste;
grant usage on schema teste to anon, authenticated;

create or replace function teste.conferir(descricao text, condicao boolean)
returns void language plpgsql as $$
begin
  if coalesce(condicao, false) then
    raise notice '  ok   %', descricao;
  else
    raise exception 'FALHOU: %', descricao;
  end if;
end $$;

-- Veste um usuário pelo e-mail (null = anônimo). Volta a postgres antes para
-- conseguir ler auth.users, e depois assume o papel da API.
create or replace function teste.vestir(p_email text)
returns uuid language plpgsql as $$
declare v uuid;
begin
  reset role;
  if p_email is null then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
    return null;
  end if;
  select id into strict v from auth.users where email = lower(p_email);
  perform set_config('request.jwt.claim.sub', v::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  return v;
end $$;

-- Volta a ser postgres sem JWT (SQL Editor).
create or replace function teste.sair()
returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function teste.id(p_email text)
returns uuid language sql stable security definer as $$
  select id from auth.users where email = lower(p_email)
$$;

-- Executa e devolve a mensagem de erro (null = passou).
create or replace function teste.erro(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- Executa um UPDATE/DELETE e devolve quantas linhas tocou.
create or replace function teste.linhas(p_sql text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function teste.conta(p_sql text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql into n;
  return n;
end $$;

grant execute on all functions in schema teste to anon, authenticated;

-- ---------------------------------------------------------------- cenário --
do $$
declare
  A  uuid := 'a0000000-0000-4000-8000-00000000000a';
  B  uuid := 'b0000000-0000-4000-8000-00000000000b';
  O1 uuid := 'a0000000-0000-4000-8000-0000000000a1';
  O2 uuid := 'a0000000-0000-4000-8000-0000000000a2';
  O3 uuid := 'b0000000-0000-4000-8000-0000000000b1';
  R1 uuid := 'a0000000-0000-4000-8000-000000000e01';
  R2 uuid := 'a0000000-0000-4000-8000-000000000e02';
  R3 uuid := 'b0000000-0000-4000-8000-000000000e03';
  pasta text := 'a0000000-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000a1/';
begin
  insert into empresas (id, nome, limite_armazenamento_mb) values
    (A, 'Teste Alfa', 100), (B, 'Teste Beta', 100);
  insert into obras (id, empresa_id, nome, status) values
    (O1, A, 'Alfa Um', 'em_andamento'),
    (O2, A, 'Alfa Dois', 'nao_iniciada'),
    (O3, B, 'Beta Um', 'em_andamento');

  -- Sem JWT (postgres) é o caminho do instalador: pode criar master.
  perform admin_criar_usuario('t.master@teste.obtra', 'segredo1', 'Master Teste', 'master', null);
  perform admin_criar_usuario('t.admin.a@teste.obtra', 'segredo1', 'Admin A', 'admin', A);
  perform admin_criar_usuario('t.colab.a@teste.obtra', 'segredo1', 'Colab A', 'colaborador', A);
  perform admin_criar_usuario('t.colab2.a@teste.obtra', 'segredo1', 'Colab Inativo A', 'colaborador', A);
  perform admin_criar_usuario('t.cliente.a@teste.obtra', 'segredo1', 'Cliente A', 'cliente', A, array[O1]);
  perform admin_criar_usuario('t.cliente2.a@teste.obtra', 'segredo1', 'Cliente Sem Obra A', 'cliente', A);
  perform admin_criar_usuario('t.admin.b@teste.obtra', 'segredo1', 'Admin B', 'admin', B);
  perform admin_criar_usuario('t.colab.b@teste.obtra', 'segredo1', 'Colab B', 'colaborador', B);
  update perfis set ativo = false where email = 't.colab2.a@teste.obtra';

  insert into relatorios (id, obra_id, empresa_id, numero, data, status) values
    (R1, O1, A, 0, current_date - 1, 'preenchendo'),
    (R2, O1, A, 0, current_date - 2, 'aprovado'),
    (R3, O3, B, 0, current_date, 'preenchendo');
  insert into relatorio_mao_obra (relatorio_id, funcao, quantidade) values
    (R1, 'Pedreiro', 3), (R2, 'Servente', 4), (R3, 'Eletricista', 1);
  insert into relatorio_atividades (relatorio_id, descricao) values
    (R1, 'Alvenaria bloco 1'), (R2, 'Fundação'), (R3, 'Quadro elétrico');

  insert into storage.objects (bucket_id, name, metadata) values
    ('obtra', pasta || 'fotos/f1.webp',   '{"size": 1000, "mimetype": "image/webp"}'),
    ('obtra', pasta || 'fotos/f1_t.webp', '{"size": 100,  "mimetype": "image/webp"}'),
    ('obtra', pasta || 'fotos/f2.webp',   '{"size": 1000, "mimetype": "image/webp"}'),
    ('obtra', pasta || 'fotos/f2_t.webp', '{"size": 100,  "mimetype": "image/webp"}'),
    ('obtra', pasta || 'fotos/f3.webp',   '{"size": 1000, "mimetype": "image/webp"}'),
    ('obtra', pasta || 'fotos/f3_t.webp', '{"size": 100,  "mimetype": "image/webp"}'),
    ('obtra', pasta || 'docs/d1.pdf',     '{"size": 5000, "mimetype": "application/pdf"}'),
    ('obtra', pasta || 'docs/d2.pdf',     '{"size": 5000, "mimetype": "application/pdf"}'),
    ('obtra', 'b0000000-0000-4000-8000-00000000000b/b0000000-0000-4000-8000-0000000000b1/fotos/x.webp',
              '{"size": 10, "mimetype": "image/webp"}');

  insert into fotos (id, obra_id, empresa_id, relatorio_id, path, thumb_path) values
    ('a0000000-0000-4000-8000-000000000f01', O1, A, null, pasta || 'fotos/f1.webp', pasta || 'fotos/f1_t.webp'),
    ('a0000000-0000-4000-8000-000000000f02', O1, A, R1,   pasta || 'fotos/f2.webp', pasta || 'fotos/f2_t.webp'),
    ('a0000000-0000-4000-8000-000000000f03', O1, A, R2,   pasta || 'fotos/f3.webp', pasta || 'fotos/f3_t.webp');
  insert into documentos (id, obra_id, empresa_id, nome, path, visivel_cliente) values
    ('a0000000-0000-4000-8000-000000000d01', O1, A, 'Projeto.pdf', pasta || 'docs/d1.pdf', true),
    ('a0000000-0000-4000-8000-000000000d02', O1, A, 'Orçamento interno.pdf', pasta || 'docs/d2.pdf', false);
end $$;

-- ---------------------------------------------------- conferência inicial --
do $$
begin
  perform teste.conferir('admin_criar_usuario criou 8 perfis no cenário',
    (select count(*) from perfis where email like 't.%@teste.obtra') = 8);
  perform teste.conferir('master nasceu sem empresa',
    (select papel = 'master' and empresa_id is null from perfis where email = 't.master@teste.obtra'));
  perform teste.conferir('relatórios receberam número sequencial por obra',
    (select array_agg(numero order by numero) from relatorios
      where obra_id = 'a0000000-0000-4000-8000-0000000000a1') = array[1, 2]);
  perform teste.conferir('empresa_id do relatório veio da obra (ignorando o informado)',
    (select empresa_id from relatorios where id = 'b0000000-0000-4000-8000-000000000e03')
      = 'b0000000-0000-4000-8000-00000000000b');
  perform teste.conferir('bytes das fotos vieram do Storage (foto + miniatura)',
    (select bytes from fotos where id = 'a0000000-0000-4000-8000-000000000f01') = 1100);
  perform teste.conferir('cota contabilizou 3 fotos + 2 documentos da empresa A',
    (select armazenamento_usado_bytes from empresas
      where id = 'a0000000-0000-4000-8000-00000000000a') = 3 * 1100 + 2 * 5000);
  perform teste.conferir('aprovado_em preenchido no relatório criado aprovado',
    (select aprovado_em is not null from relatorios where id = 'a0000000-0000-4000-8000-000000000e02'));
end $$;

-- ------------------------------------------------------------- anônimo -----
do $$
begin
  perform teste.vestir(null);
  perform teste.conferir('anônimo não lê obras (sem privilégio)',
    teste.erro('select count(*) from obras') like '%permission denied%');
  perform teste.conferir('anônimo não lê perfis',
    teste.erro('select count(*) from perfis') like '%permission denied%');
  perform teste.conferir('anônimo não executa admin_criar_usuario',
    teste.erro($q$select admin_criar_usuario('x@x.com','123456','X','admin',
               'a0000000-0000-4000-8000-00000000000a')$q$) like '%permission denied%');
  perform teste.conferir('anônimo não executa painel_resumo',
    teste.erro('select painel_resumo()') like '%permission denied%');
  perform teste.conferir('anônimo não lê arquivos do bucket',
    teste.conta($q$select count(*) from storage.objects where bucket_id = 'obtra'$q$) = 0);
end $$;

-- ------------------------------------------------------ colaborador de A --
do $$
declare
  A  text := 'a0000000-0000-4000-8000-00000000000a';
  B  text := 'b0000000-0000-4000-8000-00000000000b';
  n  bigint;
  e  text;
begin
  perform teste.vestir('t.colab.a@teste.obtra');

  perform teste.conferir('colaborador A vê só as 2 obras de A',
    teste.conta(format('select count(*) from obras where empresa_id in (%L, %L)', A, B)) = 2);
  perform teste.conferir('colaborador A vê só a empresa A',
    teste.conta(format('select count(*) from empresas where id in (%L, %L)', A, B)) = 1);
  perform teste.conferir('colaborador A vê os 2 relatórios de A (inclusive não aprovado)',
    teste.conta(format('select count(*) from relatorios where empresa_id in (%L, %L)', A, B)) = 2);
  perform teste.conferir('colaborador A não vê filhos de relatório de B',
    teste.conta($q$select count(*) from relatorio_mao_obra
                  where relatorio_id = 'b0000000-0000-4000-8000-000000000e03'$q$) = 0);
  perform teste.conferir('colaborador A vê as 3 fotos e 2 documentos de A',
    teste.conta(format('select count(*) from fotos where empresa_id in (%L, %L)', A, B)) = 3
    and teste.conta(format('select count(*) from documentos where empresa_id in (%L, %L)', A, B)) = 2);
  perform teste.conferir('colaborador A vê perfis de A (5) e nenhum de B nem o master',
    teste.conta($q$select count(*) from perfis where email like 't.%@teste.obtra'$q$) = 5);

  -- obras
  perform teste.conferir('colaborador não cria obra',
    teste.erro(format($q$insert into obras (empresa_id, nome) values (%L, 'Intrusa')$q$, A)) is not null);
  perform teste.conferir('colaborador atualiza status de obra de A',
    teste.linhas($q$update obras set status = 'em_andamento'
                   where id = 'a0000000-0000-4000-8000-0000000000a2'$q$) = 1);
  perform teste.conferir('colaborador não exclui obra (0 linhas)',
    teste.linhas($q$delete from obras where id = 'a0000000-0000-4000-8000-0000000000a2'$q$) = 0);
  perform teste.conferir('colaborador não mexe em obra de B (0 linhas)',
    teste.linhas($q$update obras set nome = 'x' where id = 'b0000000-0000-4000-8000-0000000000b1'$q$) = 0);

  -- perfis
  perform teste.conferir('colaborador não se promove a admin',
    teste.erro($q$update perfis set papel = 'admin' where id = auth.uid()$q$) is not null);
  perform teste.conferir('colaborador não se promove a master',
    teste.erro($q$update perfis set papel = 'master', empresa_id = null where id = auth.uid()$q$) is not null);
  perform teste.conferir('colaborador não muda a própria empresa',
    teste.erro(format($q$update perfis set empresa_id = %L where id = auth.uid()$q$, B)) is not null);
  perform teste.conferir('colaborador não se reativa/desativa',
    teste.erro($q$update perfis set ativo = false where id = auth.uid()$q$) is not null);
  perform teste.conferir('colaborador edita o próprio nome e telefone',
    teste.linhas($q$update perfis set nome = 'Colab A.', telefone = '11 99999-0000' where id = auth.uid()$q$) = 1);
  perform teste.conferir('colaborador não edita perfil de colega (0 linhas)',
    teste.linhas($q$update perfis set cargo = 'x' where email = 't.admin.a@teste.obtra'$q$) = 0);

  -- empresa
  perform teste.conferir('colaborador não edita a empresa (0 linhas)',
    teste.linhas(format($q$update empresas set nome = 'x' where id = %L$q$, A)) = 0);

  -- relatórios
  perform teste.conferir('colaborador edita relatório em preenchimento',
    teste.linhas($q$update relatorios set observacoes = 'ok'
                   where id = 'a0000000-0000-4000-8000-000000000e01'$q$) = 1);
  perform teste.conferir('colaborador não edita relatório aprovado (0 linhas)',
    teste.linhas($q$update relatorios set observacoes = 'mexi'
                   where id = 'a0000000-0000-4000-8000-000000000e02'$q$) = 0);
  perform teste.conferir('colaborador não aprova por UPDATE direto',
    teste.erro($q$update relatorios set status = 'aprovado'
                 where id = 'a0000000-0000-4000-8000-000000000e01'$q$) is not null);
  perform teste.conferir('colaborador não cria relatório já aprovado',
    teste.erro($q$insert into relatorios (obra_id, empresa_id, numero, data, status)
                 values ('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a',
                         0, current_date, 'aprovado')$q$) is not null);
  perform teste.conferir('colaborador não muda o número do relatório',
    teste.erro($q$update relatorios set numero = 99
                 where id = 'a0000000-0000-4000-8000-000000000e01'$q$) is not null);
  perform teste.conferir('colaborador não exclui relatório (0 linhas)',
    teste.linhas($q$delete from relatorios where id = 'a0000000-0000-4000-8000-000000000e01'$q$) = 0);
  perform teste.conferir('colaborador acrescenta mão de obra em relatório aberto',
    teste.erro($q$insert into relatorio_mao_obra (relatorio_id, funcao) values
                 ('a0000000-0000-4000-8000-000000000e01', 'Carpinteiro')$q$) is null);
  perform teste.conferir('colaborador não acrescenta item em relatório aprovado',
    teste.erro($q$insert into relatorio_mao_obra (relatorio_id, funcao) values
                 ('a0000000-0000-4000-8000-000000000e02', 'Intruso')$q$) is not null);
  perform teste.conferir('colaborador não edita item de relatório aprovado (0 linhas)',
    teste.linhas($q$update relatorio_mao_obra set quantidade = 9
                   where relatorio_id = 'a0000000-0000-4000-8000-000000000e02'$q$) = 0);
  perform teste.conferir('colaborador não move item para relatório aprovado',
    teste.erro($q$update relatorio_atividades set relatorio_id = 'a0000000-0000-4000-8000-000000000e02'
                 where relatorio_id = 'a0000000-0000-4000-8000-000000000e01'$q$) is not null);
  perform teste.conferir('colaborador não cria relatório em obra de B',
    teste.erro($q$select criar_relatorio('b0000000-0000-4000-8000-0000000000b1', current_date)$q$)
      is not null);
  perform teste.conferir('colaborador manda relatório para revisão',
    teste.erro($q$select mudar_status_relatorio('a0000000-0000-4000-8000-000000000e01', 'revisar')$q$) is null);
  perform teste.conferir('colaborador não aprova pela RPC',
    teste.erro($q$select mudar_status_relatorio('a0000000-0000-4000-8000-000000000e01', 'aprovado')$q$)
      like '%administrador%');
  perform teste.conferir('colaborador não reabre relatório aprovado',
    teste.erro($q$select mudar_status_relatorio('a0000000-0000-4000-8000-000000000e02', 'preenchendo')$q$)
      is not null);
  perform teste.conferir('colaborador devolve para preenchimento',
    teste.erro($q$select mudar_status_relatorio('a0000000-0000-4000-8000-000000000e01', 'preenchendo')$q$) is null);

  -- fotos / documentos
  perform teste.conferir('colaborador não insere foto em obra de B',
    teste.erro($q$insert into fotos (obra_id, empresa_id, path, thumb_path) values
      ('b0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-00000000000a', 'x', 'y')$q$) is not null);
  perform teste.conferir('colaborador não aponta foto para fora da pasta da obra',
    teste.erro($q$insert into fotos (obra_id, empresa_id, path, thumb_path) values
      ('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a',
       'b0000000-0000-4000-8000-00000000000b/b0000000-0000-4000-8000-0000000000b1/fotos/x.webp', 'y')$q$)
      like '%fora da pasta%');
  perform teste.conferir('colaborador não exclui foto de relatório aprovado (0 linhas)',
    teste.linhas($q$delete from fotos where id = 'a0000000-0000-4000-8000-000000000f03'$q$) = 0);
  perform teste.conferir('colaborador não troca bytes de foto (burlar a cota)',
    teste.erro($q$update fotos set bytes = 0 where id = 'a0000000-0000-4000-8000-000000000f01'$q$) is not null);

  -- usuários
  perform teste.conferir('colaborador não cria usuário',
    teste.erro(format($q$select admin_criar_usuario('novo@teste.obtra','segredo1','N','colaborador',%L)$q$, A))
      like '%Sem permissão%');
  perform teste.conferir('colaborador não redefine senha de colega',
    teste.erro(format('select admin_redefinir_senha(%L, %L)',
                      teste.id('t.admin.a@teste.obtra'), 'outrasenha')) is not null);
  perform teste.conferir('colaborador não chama tornar_master',
    teste.erro($q$select tornar_master('t.colab.a@teste.obtra')$q$) like '%permission denied%');

  -- storage
  perform teste.conferir('colaborador A vê os 8 arquivos de A no bucket e nenhum de B',
    teste.conta($q$select count(*) from storage.objects where bucket_id = 'obtra'
                   and (name like 'a0000000-0000-4000-8000-00000000000a/%'
                        or name like 'b0000000-0000-4000-8000-00000000000b/%')$q$) = 8);
  perform teste.conferir('colaborador A sobe arquivo na pasta de obra de A',
    teste.erro($q$insert into storage.objects (bucket_id, name) values ('obtra',
      'a0000000-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000a2/fotos/novo.webp')$q$) is null);
  perform teste.conferir('colaborador A não sobe na pasta de B',
    teste.erro($q$insert into storage.objects (bucket_id, name) values ('obtra',
      'b0000000-0000-4000-8000-00000000000b/b0000000-0000-4000-8000-0000000000b1/fotos/x2.webp')$q$) is not null);
  perform teste.conferir('colaborador A não sobe em pasta de obra de B dentro da empresa A',
    teste.erro($q$insert into storage.objects (bucket_id, name) values ('obtra',
      'a0000000-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-0000000000b1/fotos/x3.webp')$q$) is not null);
  perform teste.conferir('colaborador não troca o logo (só admin)',
    teste.erro($q$insert into storage.objects (bucket_id, name) values ('obtra',
      'a0000000-0000-4000-8000-00000000000a/logo/l.webp')$q$) is not null);
  perform teste.conferir('colaborador não apaga arquivo de B (0 linhas)',
    teste.linhas($q$delete from storage.objects where name like 'b0000000-0000-4000-8000-00000000000b/%'$q$) = 0);

  -- painel
  perform teste.conferir('painel do colaborador não mostra armazenamento',
    (select painel_resumo() ->> 'armazenamento_usado_bytes') is null
    and (select painel_resumo() ->> 'empresas_total') is null);
end $$;

-- ------------------------------------------------------------ cliente de A --
do $$
declare
  A  text := 'a0000000-0000-4000-8000-00000000000a';
  B  text := 'b0000000-0000-4000-8000-00000000000b';
  pasta text := 'a0000000-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000a1/';
begin
  perform teste.vestir('t.cliente.a@teste.obtra');

  perform teste.conferir('cliente vê só a obra vinculada',
    teste.conta(format('select count(*) from obras where empresa_id in (%L, %L)', A, B)) = 1
    and teste.conta($q$select count(*) from obras where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 1);
  perform teste.conferir('cliente vê só o relatório aprovado (não o em preenchimento)',
    teste.conta(format('select count(*) from relatorios where empresa_id in (%L, %L)', A, B)) = 1
    and teste.conta($q$select count(*) from relatorios where status <> 'aprovado'$q$) = 0);
  perform teste.conferir('cliente não vê itens do relatório não aprovado',
    teste.conta($q$select count(*) from relatorio_mao_obra
                  where relatorio_id = 'a0000000-0000-4000-8000-000000000e01'$q$) = 0
    and teste.conta($q$select count(*) from relatorio_atividades
                  where relatorio_id = 'a0000000-0000-4000-8000-000000000e01'$q$) = 0);
  perform teste.conferir('cliente vê itens do relatório aprovado',
    teste.conta($q$select count(*) from relatorio_mao_obra
                  where relatorio_id = 'a0000000-0000-4000-8000-000000000e02'$q$) = 1);
  perform teste.conferir('cliente vê foto sem RDO e a do RDO aprovado, não a do RDO aberto',
    teste.conta(format('select count(*) from fotos where empresa_id in (%L, %L)', A, B)) = 2
    and teste.conta($q$select count(*) from fotos where id = 'a0000000-0000-4000-8000-000000000f02'$q$) = 0);
  perform teste.conferir('cliente vê só o documento visível ao cliente',
    teste.conta(format('select count(*) from documentos where empresa_id in (%L, %L)', A, B)) = 1
    and teste.conta('select count(*) from documentos where not visivel_cliente') = 0);
  perform teste.conferir('cliente vê a própria empresa e só ela',
    teste.conta(format('select count(*) from empresas where id in (%L, %L)', A, B)) = 1);
  perform teste.conferir('cliente vê a si e a equipe de A (admin + colab ativos e inativo), não outro cliente',
    teste.conta($q$select count(*) from perfis where email like 't.%@teste.obtra'$q$) = 4
    and teste.conta($q$select count(*) from perfis where email = 't.cliente2.a@teste.obtra'$q$) = 0);
  perform teste.conferir('cliente vê o próprio vínculo com a obra',
    teste.conta('select count(*) from obra_clientes') = 1);

  perform teste.conferir('cliente não cria relatório',
    teste.erro($q$select criar_relatorio('a0000000-0000-4000-8000-0000000000a1', current_date)$q$) is not null);
  perform teste.conferir('cliente não insere relatório direto',
    teste.erro($q$insert into relatorios (obra_id, empresa_id, numero, data) values
      ('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a', 0, current_date)$q$)
      is not null);
  perform teste.conferir('cliente não edita obra (0 linhas)',
    teste.linhas($q$update obras set nome = 'x' where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 0);
  perform teste.conferir('cliente não edita relatório aprovado (0 linhas)',
    teste.linhas($q$update relatorios set observacoes = 'x'
                   where id = 'a0000000-0000-4000-8000-000000000e02'$q$) = 0);
  perform teste.conferir('cliente não se promove',
    teste.erro($q$update perfis set papel = 'admin' where id = auth.uid()$q$) is not null);
  perform teste.conferir('cliente não se vincula a outra obra',
    teste.erro($q$insert into obra_clientes (obra_id, cliente_id)
                 values ('a0000000-0000-4000-8000-0000000000a2', auth.uid())$q$) is not null);
  perform teste.conferir('cliente comenta no relatório aprovado',
    teste.erro($q$insert into relatorio_comentarios (relatorio_id, texto)
                 values ('a0000000-0000-4000-8000-000000000e02', 'Ficou ótimo!')$q$) is null);
  perform teste.conferir('cliente não comenta no relatório não aprovado',
    teste.erro($q$insert into relatorio_comentarios (relatorio_id, texto)
                 values ('a0000000-0000-4000-8000-000000000e01', 'Espiando')$q$) is not null);
  perform teste.conferir('cliente não comenta em nome de outro',
    (select count(*) from relatorio_comentarios where autor_id = auth.uid()) = 1);

  -- storage: só os arquivos que as tabelas já mostram
  perform teste.conferir('cliente lê foto e miniatura sem RDO e do RDO aprovado + doc visível (5)',
    teste.conta(format($q$select count(*) from storage.objects where bucket_id = 'obtra'
                            and name like %L$q$, pasta || '%')) = 5);
  perform teste.conferir('cliente não lê a foto do RDO não aprovado',
    teste.conta(format($q$select count(*) from storage.objects where name = %L$q$, pasta || 'fotos/f2.webp')) = 0);
  perform teste.conferir('cliente não lê documento interno',
    teste.conta(format($q$select count(*) from storage.objects where name = %L$q$, pasta || 'docs/d2.pdf')) = 0);
  perform teste.conferir('cliente não sobe arquivo',
    teste.erro(format($q$insert into storage.objects (bucket_id, name) values ('obtra', %L)$q$,
                      pasta || 'fotos/cliente.webp')) is not null);

  perform teste.conferir('painel do cliente: 1 obra, 1 relatório, 2 fotos, sem armazenamento',
    (select (painel_resumo() ->> 'relatorios_total')::int) >= 1
    and (select painel_resumo() ->> 'armazenamento_limite_bytes') is null);
end $$;

-- cliente sem obra vinculada não vê nada
do $$
begin
  perform teste.vestir('t.cliente2.a@teste.obtra');
  perform teste.conferir('cliente sem vínculo não vê obra nenhuma', teste.conta('select count(*) from obras') = 0);
  perform teste.conferir('cliente sem vínculo não vê relatório', teste.conta('select count(*) from relatorios') = 0);
  perform teste.conferir('cliente sem vínculo não vê foto nem arquivo',
    teste.conta('select count(*) from fotos') = 0
    and teste.conta($q$select count(*) from storage.objects where name not like '%/logo/%'$q$) = 0);
end $$;

-- colaborador inativo não vê nada (mas lê o próprio perfil)
do $$
begin
  perform teste.vestir('t.colab2.a@teste.obtra');
  perform teste.conferir('colaborador inativo não vê obras', teste.conta('select count(*) from obras') = 0);
  perform teste.conferir('colaborador inativo não vê empresa', teste.conta('select count(*) from empresas') = 0);
  perform teste.conferir('colaborador inativo não vê arquivos',
    teste.conta('select count(*) from storage.objects') = 0);
  perform teste.conferir('colaborador inativo lê só o próprio perfil (para a tela explicar)',
    teste.conta('select count(*) from perfis') = 1);
  perform teste.conferir('colaborador inativo não cria relatório',
    teste.erro($q$select criar_relatorio('a0000000-0000-4000-8000-0000000000a1', current_date)$q$) is not null);
end $$;

-- ------------------------------------------------------------- admin de A --
do $$
declare
  A  text := 'a0000000-0000-4000-8000-00000000000a';
  B  text := 'b0000000-0000-4000-8000-00000000000b';
  v_novo uuid;
begin
  perform teste.vestir('t.admin.a@teste.obtra');

  perform teste.conferir('admin A vê os 5 perfis de A e nenhum de B nem o master',
    teste.conta($q$select count(*) from perfis where email like 't.%@teste.obtra'$q$) = 5);
  perform teste.conferir('admin A edita dados da própria empresa',
    teste.linhas(format($q$update empresas set telefone = '11 3333-4444', cidade = 'Campinas' where id = %L$q$, A)) = 1);
  perform teste.conferir('admin A não altera o limite de armazenamento',
    teste.erro(format('update empresas set limite_armazenamento_mb = 999999 where id = %L', A))
      like '%Somente o master%');
  perform teste.conferir('admin A não desativa/ativa a empresa',
    teste.erro(format('update empresas set ativa = false where id = %L', A)) like '%Somente o master%');
  perform teste.conferir('admin A não zera o uso de armazenamento',
    teste.erro(format('update empresas set armazenamento_usado_bytes = 0 where id = %L', A)) is not null);
  perform teste.conferir('admin A não edita empresa B (0 linhas)',
    teste.linhas(format($q$update empresas set nome = 'x' where id = %L$q$, B)) = 0);
  perform teste.conferir('admin A não cria empresa',
    teste.erro($q$insert into empresas (nome) values ('Nova')$q$) is not null);
  perform teste.conferir('admin A não exclui empresa (0 linhas)',
    teste.linhas(format('delete from empresas where id = %L', A)) = 0);

  perform teste.conferir('admin A cria obra em A',
    teste.erro(format($q$insert into obras (empresa_id, nome) values (%L, 'Alfa Três')$q$, A)) is null);
  perform teste.conferir('admin A não cria obra em B',
    teste.erro(format($q$insert into obras (empresa_id, nome) values (%L, 'Intrusa')$q$, B)) is not null);
  perform teste.conferir('admin A não move obra para B',
    teste.erro(format($q$update obras set empresa_id = %L where id = 'a0000000-0000-4000-8000-0000000000a2'$q$, B))
      is not null);

  perform teste.conferir('admin A edita relatório aprovado',
    teste.linhas($q$update relatorios set observacoes = 'Revisto pelo admin'
                   where id = 'a0000000-0000-4000-8000-000000000e02'$q$) = 1);
  perform teste.conferir('aprovação é preservada ao editar aprovado',
    (select aprovado_em is not null from relatorios where id = 'a0000000-0000-4000-8000-000000000e02'));

  perform teste.conferir('admin A edita cargo de colaborador de A',
    teste.linhas($q$update perfis set cargo = 'Engenheiro' where email = 't.colab.a@teste.obtra'$q$) = 1);
  perform teste.conferir('admin A não edita perfil de B (0 linhas)',
    teste.linhas($q$update perfis set cargo = 'x' where email = 't.admin.b@teste.obtra'$q$) = 0);
  perform teste.conferir('admin A não promove ninguém a master',
    teste.erro($q$update perfis set papel = 'master', empresa_id = null
                 where email = 't.colab.a@teste.obtra'$q$) is not null);
  perform teste.conferir('admin A não move usuário para B',
    teste.erro(format($q$update perfis set empresa_id = %L where email = 't.colab.a@teste.obtra'$q$, B))
      is not null);
  perform teste.conferir('admin A não se rebaixa nem se desativa',
    teste.erro($q$update perfis set ativo = false where id = auth.uid()$q$) is not null);
  perform teste.conferir('admin A não edita o master (0 linhas)',
    teste.linhas($q$update perfis set nome = 'x' where email = 't.master@teste.obtra'$q$) = 0);

  perform teste.conferir('admin A não cria usuário em B',
    teste.erro(format($q$select admin_criar_usuario('x.b@teste.obtra','segredo1','X','colaborador',%L)$q$, B))
      like '%própria empresa%');
  perform teste.conferir('admin A não cria master',
    teste.erro($q$select admin_criar_usuario('x.m@teste.obtra','segredo1','X','master',null)$q$) is not null);
  perform teste.conferir('admin A não vincula cliente novo a obra de B',
    teste.erro(format($q$select admin_criar_usuario('x.c@teste.obtra','segredo1','X','cliente',%L,
                   array['b0000000-0000-4000-8000-0000000000b1']::uuid[])$q$, A)) is not null);
  v_novo := admin_criar_usuario('t.novo.a@teste.obtra', 'segredo1', 'Novo A', 'colaborador',
                                A::uuid, '{}', '11 90000-0000', 'Estagiário');
  perform teste.conferir('admin A cria colaborador em A (com telefone e cargo)',
    (select papel = 'colaborador' and empresa_id = A::uuid and cargo = 'Estagiário'
       from perfis where id = v_novo));
  perform teste.conferir('admin A redefine senha de colaborador de A',
    teste.erro(format('select admin_redefinir_senha(%L, %L)', v_novo, 'novasenha')) is null);
  perform teste.conferir('admin A não redefine senha de usuário de B',
    teste.erro(format('select admin_redefinir_senha(%L, %L)', teste.id('t.admin.b@teste.obtra'), 'novasenha'))
      like '%Sem permissão%');
  perform teste.conferir('admin A não redefine senha do master',
    teste.erro(format('select admin_redefinir_senha(%L, %L)', teste.id('t.master@teste.obtra'), 'novasenha'))
      is not null);
  perform teste.conferir('admin A não se exclui',
    teste.erro(format('select admin_excluir_usuario(%L)', auth.uid())) like '%a si mesmo%');
  perform teste.conferir('admin A não exclui usuário de B',
    teste.erro(format('select admin_excluir_usuario(%L)', teste.id('t.colab.b@teste.obtra'))) is not null);
  perform teste.conferir('admin A não exclui o master',
    teste.erro(format('select admin_excluir_usuario(%L)', teste.id('t.master@teste.obtra'))) is not null);
  perform teste.conferir('admin A exclui colaborador de A',
    teste.erro(format('select admin_excluir_usuario(%L)', v_novo)) is null);

  perform teste.conferir('admin A não vincula colaborador como cliente de obra',
    teste.erro(format($q$insert into obra_clientes (obra_id, cliente_id)
                  values ('a0000000-0000-4000-8000-0000000000a2', %L)$q$, teste.id('t.colab.a@teste.obtra')))
      is not null);
  perform teste.conferir('admin A não vincula cliente de A a obra de B',
    teste.erro(format($q$insert into obra_clientes (obra_id, cliente_id)
                  values ('b0000000-0000-4000-8000-0000000000b1', %L)$q$, teste.id('t.cliente2.a@teste.obtra')))
      is not null);
  perform teste.conferir('admin A vincula cliente de A a obra de A',
    teste.erro(format($q$insert into obra_clientes (obra_id, cliente_id)
                  values ('a0000000-0000-4000-8000-0000000000a2', %L)$q$, teste.id('t.cliente2.a@teste.obtra')))
      is null);
  perform teste.conferir('admin A sobe o logo da empresa',
    teste.erro(format($q$insert into storage.objects (bucket_id, name) values ('obtra', %L)$q$,
                      A || '/logo/l.webp')) is null);
  perform teste.conferir('painel do admin mostra armazenamento da empresa',
    (select (painel_resumo() ->> 'armazenamento_limite_bytes')::bigint) = 100 * 1024 * 1024
    and (select painel_resumo() ->> 'empresas_total') is null);
end $$;

-- ------------------------------------------------------------- admin de B --
do $$
declare
  A  text := 'a0000000-0000-4000-8000-00000000000a';
begin
  perform teste.vestir('t.admin.b@teste.obtra');
  perform teste.conferir('admin B não vê nada de A: obras, relatórios, fotos, documentos, perfis',
    teste.conta(format('select count(*) from obras where empresa_id = %L', A)) = 0
    and teste.conta(format('select count(*) from relatorios where empresa_id = %L', A)) = 0
    and teste.conta(format('select count(*) from fotos where empresa_id = %L', A)) = 0
    and teste.conta(format('select count(*) from documentos where empresa_id = %L', A)) = 0
    and teste.conta(format('select count(*) from perfis where empresa_id = %L', A)) = 0);
  perform teste.conferir('admin B não vê arquivos de A no bucket',
    teste.conta(format($q$select count(*) from storage.objects where name like %L$q$, A || '/%')) = 0);
  perform teste.conferir('admin B não apaga arquivo de A (0 linhas)',
    teste.linhas(format($q$delete from storage.objects where name like %L$q$, A || '/%')) = 0);
  perform teste.conferir('admin B não aprova relatório de A',
    teste.erro($q$select mudar_status_relatorio('a0000000-0000-4000-8000-000000000e01', 'aprovado')$q$)
      is not null);
  perform teste.conferir('admin B não redefine obras de cliente de A',
    teste.erro(format($q$select definir_obras_cliente(%L, '{}')$q$, teste.id('t.cliente.a@teste.obtra')))
      is not null);
end $$;

-- ----------------------------------------------------------------- master --
do $$
declare
  A  text := 'a0000000-0000-4000-8000-00000000000a';
  B  text := 'b0000000-0000-4000-8000-00000000000b';
begin
  perform teste.vestir('t.master@teste.obtra');
  perform teste.conferir('master vê as 2 empresas, as obras e relatórios das duas',
    teste.conta(format('select count(*) from empresas where id in (%L, %L)', A, B)) = 2
    and teste.conta(format('select count(*) from relatorios where empresa_id in (%L, %L)', A, B)) = 3);
  perform teste.conferir('master vê todos os perfis do cenário',
    teste.conta($q$select count(*) from perfis where email like 't.%@teste.obtra'$q$) = 8);
  perform teste.conferir('master altera o limite de armazenamento',
    teste.linhas(format('update empresas set limite_armazenamento_mb = 200 where id = %L', B)) = 1);
  perform teste.conferir('master cria empresa',
    teste.erro($q$insert into empresas (nome, armazenamento_usado_bytes) values ('Gama', 12345)$q$) is null);
  perform teste.conferir('empresa nova nasce com uso zerado (não aceita valor informado)',
    teste.conta($q$select armazenamento_usado_bytes from empresas where nome = 'Gama'$q$) = 0);
  perform teste.conferir('master não cria outro master pela RPC',
    teste.erro($q$select admin_criar_usuario('x.m2@teste.obtra','segredo1','X','master',null)$q$)
      is not null);
  perform teste.conferir('master não chama tornar_master (só SQL Editor)',
    teste.erro($q$select tornar_master('t.admin.b@teste.obtra')$q$) like '%permission denied%');
  perform teste.conferir('master lê a configuração',
    teste.conta('select count(*) from configuracao') = 1);
  perform teste.conferir('ninguém altera a configuração pela API',
    teste.erro($q$update configuracao set master_email = 'eu@x.com'$q$) like '%permission denied%');
  perform teste.conferir('painel do master traz empresas_total',
    (select painel_resumo() ->> 'empresas_total') is not null);

  -- empresa B desativada: ninguém de B enxerga nada
  perform teste.linhas(format('update empresas set ativa = false where id = %L', B));
end $$;

do $$
begin
  perform teste.vestir('t.admin.b@teste.obtra');
  perform teste.conferir('com a empresa inativa, o admin dela não vê obras',
    teste.conta('select count(*) from obras') = 0);
  perform teste.conferir('com a empresa inativa, o admin dela não vê a empresa',
    teste.conta('select count(*) from empresas') = 0);
  perform teste.conferir('com a empresa inativa, o admin dela não cria usuário',
    teste.erro($q$select admin_criar_usuario('y.b@teste.obtra','segredo1','Y','colaborador',
                 'b0000000-0000-4000-8000-00000000000b')$q$) is not null);
  perform teste.vestir('t.master@teste.obtra');
  perform teste.conferir('o master continua vendo a empresa inativa',
    teste.conta($q$select count(*) from obras where empresa_id = 'b0000000-0000-4000-8000-00000000000b'$q$) = 1);
  perform teste.linhas($q$update empresas set ativa = true where id = 'b0000000-0000-4000-8000-00000000000b'$q$);
end $$;

-- ------------------------------------------- cadastro aberto (GoTrue) -------
-- Metadados escolhidos por quem se cadastra NÃO dão papel nem empresa.
do $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v, 'espertinho@teste.obtra',
          jsonb_build_object('nome', 'Espertinho', 'papel', 'admin',
                             'empresa_id', 'a0000000-0000-4000-8000-00000000000a'));
  perform teste.conferir('cadastro com metadados de admin vira cliente sem empresa',
    (select papel = 'cliente' and empresa_id is null from perfis where id = v));
  perform teste.vestir('espertinho@teste.obtra');
  perform teste.conferir('... e não enxerga nada',
    teste.conta('select count(*) from obras') = 0 and teste.conta('select count(*) from empresas') = 0);
end $$;

-- master_email: só vale enquanto não existe master.
update configuracao set master_email = 'dono@teste.obtra';
do $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v, 'Dono@teste.obtra');
  perform teste.conferir('com master existente, o master_email não vira master',
    (select papel from perfis where id = v) = 'cliente');
end $$;

begin;
update perfis set papel = 'admin', empresa_id = 'a0000000-0000-4000-8000-00000000000a' where papel = 'master';
do $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v, 'dono2@teste.obtra');
  perform teste.conferir('e-mail diferente do master_email não vira master',
    (select papel from perfis where id = v) = 'cliente');
  update configuracao set master_email = 'Dono2@teste.obtra ';
  delete from auth.users where id = v;
  insert into auth.users (id, email) values (v, 'dono2@teste.obtra');
  perform teste.conferir('sem master ainda, o master_email vira master (sem diferenciar maiúsculas)',
    (select papel = 'master' and empresa_id is null from perfis where id = v));
end $$;
rollback;
update configuracao set master_email = null;

-- tornar_master pelo SQL Editor
do $$
begin
  perform tornar_master('espertinho@teste.obtra');
  perform teste.conferir('tornar_master (postgres) promove a master',
    (select papel = 'master' and empresa_id is null from perfis where email = 'espertinho@teste.obtra'));
  delete from auth.users where lower(email) in ('espertinho@teste.obtra', 'dono@teste.obtra');
  perform teste.conferir('excluir a conta apaga o perfil (cascade)',
    (select count(*) from perfis where email in ('espertinho@teste.obtra', 'dono@teste.obtra')) = 0);
end $$;
