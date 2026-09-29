-- ============================================================================
-- Obtra — auditoria: o banco visto por um adversário.
-- ----------------------------------------------------------------------------
-- Roda depois dos outros (reaproveita `teste.*` do 10_rls.sql), mas monta um
-- cenário PRÓPRIO — empresas X e Y — para não depender do estado que os
-- arquivos anteriores deixaram. Cobre:
--   1. catálogo: privilégios, search_path, RLS ligada, índices, políticas
--   2. isolamento X × Y em TODAS as tabelas (ler/inserir/alterar/excluir)
--   3. escalonamento de privilégio (perfis, empresas, RPCs, anônimo)
--   4. cliente: só RDO aprovado, só o que é visível, escreve só comentário
--   5. colaborador × relatório aprovado; transições de status
--   6. cota de armazenamento (soma, exclusão, cascata, órfãos no bucket)
--   7. criar_relatorio (numeração, anterior por data, responsável)
--   8. histórico (gerado pelos gatilhos, ninguém grava direto)
--   9. contas (auth.users/identities como o GoTrue exige; bordas das RPCs)
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Ids do cenário por nome curto.
create or replace function teste.a(k text)
returns uuid language sql immutable as $$
  select (jsonb_build_object(
    'X',   'c0000000-0000-4000-8000-00000000000c',
    'Y',   'd0000000-0000-4000-8000-00000000000d',
    'Q',   'e0000000-0000-4000-8000-00000000000e',
    'OX1', 'c0000000-0000-4000-8000-0000000000c1',
    'OX2', 'c0000000-0000-4000-8000-0000000000c2',
    'OY1', 'd0000000-0000-4000-8000-0000000000d1',
    'OQ1', 'e0000000-0000-4000-8000-0000000000e1',
    'RX1', 'c0000000-0000-4000-8000-000000000e11',   -- OX1 preenchendo
    'RX2', 'c0000000-0000-4000-8000-000000000e12',   -- OX1 aprovado
    'RX3', 'c0000000-0000-4000-8000-000000000e13',   -- OX1 revisar
    'RY1', 'd0000000-0000-4000-8000-000000000e21'    -- OY1 aprovado
  ) ->> k)::uuid
$$;
grant execute on function teste.a(text) to anon, authenticated;

-- Pasta de uma obra no bucket: {empresa}/{obra}/
create or replace function teste.pasta(e text, o text)
returns text language sql immutable as $$
  select teste.a(e)::text || '/' || teste.a(o)::text || '/'
$$;
grant execute on function teste.pasta(text, text) to anon, authenticated;

-- Tabelas-filhas do relatório e a coluna de texto obrigatória de cada uma.
create or replace function teste.filhos()
returns table (tabela text, coluna text) language sql immutable as $$
  values ('relatorio_mao_obra', 'funcao'), ('relatorio_equipamentos', 'nome'),
         ('relatorio_atividades', 'descricao'), ('relatorio_ocorrencias', 'descricao'),
         ('relatorio_materiais', 'descricao'), ('relatorio_notas_compras', 'fornecedor'),
         ('relatorio_comentarios', 'texto')
$$;
grant execute on function teste.filhos() to anon, authenticated;

-- =============================================================== cenário ====
do $$
declare
  X uuid := teste.a('X');  Y uuid := teste.a('Y');
  r uuid;
  f record;
  s text;
begin
  perform teste.sair();
  insert into empresas (id, nome, limite_armazenamento_mb) values (X, 'Auditoria X', 100), (Y, 'Auditoria Y', 100);
  insert into obras (id, empresa_id, nome) values
    (teste.a('OX1'), X, 'X Um'), (teste.a('OX2'), X, 'X Dois'), (teste.a('OY1'), Y, 'Y Um');

  perform admin_criar_usuario('x.admin@aud.obtra',    'segredo1', 'X Admin',    'admin',       X);
  perform admin_criar_usuario('x.admin2@aud.obtra',   'segredo1', 'X Admin 2',  'admin',       X);
  perform admin_criar_usuario('x.colab@aud.obtra',    'segredo1', 'X Colab',    'colaborador', X);
  perform admin_criar_usuario('x.cliente@aud.obtra',  'segredo1', 'X Cliente',  'cliente',     X, array[teste.a('OX1')]);
  perform admin_criar_usuario('x.cliente2@aud.obtra', 'segredo1', 'X Cliente 2','cliente',     X);
  perform admin_criar_usuario('y.admin@aud.obtra',    'segredo1', 'Y Admin',    'admin',       Y);
  perform admin_criar_usuario('y.colab@aud.obtra',    'segredo1', 'Y Colab',    'colaborador', Y);
  perform admin_criar_usuario('y.cliente@aud.obtra',  'segredo1', 'Y Cliente',  'cliente',     Y, array[teste.a('OY1')]);

  insert into relatorios (id, obra_id, empresa_id, numero, data, status) values
    (teste.a('RX1'), teste.a('OX1'), X, 0, current_date - 3, 'preenchendo'),
    (teste.a('RX2'), teste.a('OX1'), X, 0, current_date - 2, 'aprovado'),
    (teste.a('RX3'), teste.a('OX1'), X, 0, current_date - 1, 'revisar'),
    (teste.a('RY1'), teste.a('OY1'), Y, 0, current_date - 1, 'aprovado');

  -- Um item em cada filho de cada relatório.
  foreach r in array array[teste.a('RX1'), teste.a('RX2'), teste.a('RX3'), teste.a('RY1')] loop
    for f in select * from teste.filhos() loop
      execute format('insert into %I (relatorio_id, %I) values (%L, %L)', f.tabela, f.coluna, r, 'item');
    end loop;
  end loop;

  -- Arquivos: foto sem RDO + uma por RDO, documento visível e interno.
  foreach s in array array['sem', 'rx1', 'rx2', 'rx3'] loop
    insert into storage.objects (bucket_id, name, metadata) values
      ('obtra', teste.pasta('X', 'OX1') || 'fotos/' || s || '.webp',   '{"size": 1000}'),
      ('obtra', teste.pasta('X', 'OX1') || 'fotos/' || s || '_t.webp', '{"size": 100}');
    insert into fotos (obra_id, relatorio_id, path, thumb_path) values
      (teste.a('OX1'),
       case s when 'rx1' then teste.a('RX1') when 'rx2' then teste.a('RX2') when 'rx3' then teste.a('RX3') end,
       teste.pasta('X', 'OX1') || 'fotos/' || s || '.webp', teste.pasta('X', 'OX1') || 'fotos/' || s || '_t.webp');
  end loop;
  insert into storage.objects (bucket_id, name, metadata) values
    ('obtra', teste.pasta('X', 'OX1') || 'docs/vis.pdf', '{"size": 5000}'),
    ('obtra', teste.pasta('X', 'OX1') || 'docs/int.pdf', '{"size": 5000}'),
    ('obtra', teste.pasta('Y', 'OY1') || 'fotos/y.webp',   '{"size": 10}'),
    ('obtra', teste.pasta('Y', 'OY1') || 'fotos/y_t.webp', '{"size": 1}'),
    ('obtra', X::text || '/logo/logo.webp', '{"size": 10}');
  insert into documentos (obra_id, nome, path, visivel_cliente) values
    (teste.a('OX1'), 'Visível.pdf', teste.pasta('X', 'OX1') || 'docs/vis.pdf', true),
    (teste.a('OX1'), 'Interno.pdf', teste.pasta('X', 'OX1') || 'docs/int.pdf', false);
  insert into fotos (obra_id, relatorio_id, path, thumb_path) values
    (teste.a('OY1'), teste.a('RY1'), teste.pasta('Y', 'OY1') || 'fotos/y.webp', teste.pasta('Y', 'OY1') || 'fotos/y_t.webp');

  insert into funcoes (empresa_id, nome) values (X, 'Pedreiro'), (Y, 'Pedreiro');
  insert into colaboradores (empresa_id, nome) values (X, 'João X'), (Y, 'João Y');
  insert into materiais (empresa_id, nome) values (X, 'Cimento'), (Y, 'Cimento');
  insert into equipamentos (empresa_id, nome) values (X, 'Betoneira'), (Y, 'Betoneira');
end $$;

-- ======================================================= 1. catálogo ========
do $$
declare
  v_lista text;
  v_esperado text[] := array[
    -- auxiliares das políticas
    'uuid_seguro(text)', 'obtra_interno()', 'eh_master()', 'meu_papel()', 'minha_empresa()',
    'eh_equipe(uuid)', 'eh_admin(uuid)', 'eh_cliente_da_obra(uuid)', 'empresa_da_obra(uuid)',
    'pode_ver_obra(uuid)', 'pode_ver_relatorio(uuid)', 'pode_editar_relatorio(uuid)',
    'empresa_do_relatorio(uuid)', 'empresa_da_equipe()', 'empresa_do_admin()',
    'empresa_do_cliente()', 'obras_do_cliente()',
    'storage_pode_ler(text)', 'storage_pode_escrever(text)', 'storage_pode_alterar(text)', 'storage_tem_espaco(text)',
    -- RPCs
    'admin_criar_usuario(text,text,text,text,uuid,uuid[],text,text)', 'admin_redefinir_senha(uuid,text)',
    'admin_excluir_usuario(uuid)', 'definir_obras_cliente(uuid,uuid[])',
    'criar_relatorio(uuid,date,boolean)', 'mudar_status_relatorio(uuid,text)', 'painel_resumo()'];
begin
  perform teste.sair();

  select string_agg(p.oid::regprocedure::text, ', ') into v_lista
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'execute');
  perform teste.conferir('anon não executa função nenhuma de public [' || coalesce(v_lista, '') || ']',
    v_lista is null);

  -- O Supabase dá EXECUTE ao authenticated por padrão (00_ambiente imita):
  -- só a lista da API pode sobrar. Em especial registrar_historico, que grava
  -- histórico em qualquer empresa, e as funções internas de gatilho.
  select string_agg(x, ', ') into v_lista from (
    select replace(p.oid::regprocedure::text, 'public.', '') as x
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and has_function_privilege('authenticated', p.oid, 'execute')
    except select unnest(v_esperado)) s;
  perform teste.conferir('authenticated executa só as funções da API [sobrando: ' || coalesce(v_lista, '') || ']',
    v_lista is null);
  select string_agg(x, ', ') into v_lista from (
    select unnest(v_esperado) as x
    except select replace(p.oid::regprocedure::text, 'public.', '')
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and has_function_privilege('authenticated', p.oid, 'execute')) s;
  perform teste.conferir('authenticated executa todas as funções da API [faltando: ' || coalesce(v_lista, '') || ']',
    v_lista is null);
  perform teste.conferir('tornar_master: ninguém da API executa (nem service_role)',
    not has_function_privilege('authenticated', 'public.tornar_master(text)', 'execute')
    and not has_function_privilege('anon', 'public.tornar_master(text)', 'execute')
    and not has_function_privilege('service_role', 'public.tornar_master(text)', 'execute'));

  select string_agg(c.relname, ', ') into v_lista
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
     and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
          or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete')
          or has_table_privilege('anon', c.oid, 'truncate'));
  perform teste.conferir('anon sem privilégio em tabela nenhuma [' || coalesce(v_lista, '') || ']', v_lista is null);

  select string_agg(c.relname, ', ') into v_lista
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and (has_table_privilege('authenticated', c.oid, 'truncate')
          or has_table_privilege('authenticated', c.oid, 'references')
          or has_table_privilege('authenticated', c.oid, 'trigger'));
  perform teste.conferir('authenticated sem TRUNCATE/REFERENCES/TRIGGER (TRUNCATE ignora RLS) [' || coalesce(v_lista, '') || ']',
    v_lista is null);

  select string_agg(c.relname, ', ') into v_lista
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
     and (has_sequence_privilege('authenticated', c.oid, 'usage') or has_sequence_privilege('anon', c.oid, 'usage'));
  perform teste.conferir('sequências fora do alcance da API [' || coalesce(v_lista, '') || ']', v_lista is null);

  perform teste.conferir('histórico e configuração: authenticated só lê',
    not has_table_privilege('authenticated', 'public.historico', 'insert')
    and not has_table_privilege('authenticated', 'public.historico', 'update')
    and not has_table_privilege('authenticated', 'public.historico', 'delete')
    and not has_table_privilege('authenticated', 'public.configuracao', 'update')
    and has_table_privilege('authenticated', 'public.historico', 'select'));

  select string_agg(c.relname, ', ') into v_lista
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity;
  perform teste.conferir('RLS ligada em todas as tabelas de public [' || coalesce(v_lista, '') || ']', v_lista is null);

  select string_agg(p.proname, ', ') into v_lista
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                      where c ~ '^search_path=.*pg_temp$');
  perform teste.conferir('toda SECURITY DEFINER tem search_path fixo com pg_temp por último [' || coalesce(v_lista, '') || ']',
    v_lista is null);

  select string_agg(format('%s.%s', c.conrelid::regclass, c.conname), ', ') into v_lista
    from pg_constraint c
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (select array_agg(k order by o) from unnest(i.indkey::int2[]) with ordinality u(k, o)
                where o <= cardinality(c.conkey)) = c.conkey);
  perform teste.conferir('toda FK tem índice (exclusões em cascata/set null sem varrer a tabela) [' || coalesce(v_lista, '') || ']',
    v_lista is null);

  -- Chamadas que não dependem da linha têm de estar em (select ...): initPlan.
  select string_agg(format('%s.%s', tablename, policyname), ', ') into v_lista
    from pg_policies p,
         lateral (select coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') as t) x
   where (p.schemaname = 'public' or (p.schemaname = 'storage' and p.policyname like 'obtra_%'))
     and exists (select 1 from unnest(array['auth.uid()', 'eh_master()', 'minha_empresa()', 'meu_papel()',
                                            'empresa_da_equipe()', 'empresa_do_admin()', 'empresa_do_cliente()',
                                            'obras_do_cliente()']) f
                  where (length(x.t) - length(replace(x.t, f, ''))) / length(f)
                     <> (length(x.t) - length(replace(x.t, 'SELECT ' || f, ''))) / length('SELECT ' || f)
                        + (length(x.t) - length(replace(x.t, 'SELECT public.' || f, ''))) / length('SELECT public.' || f));
  perform teste.conferir('políticas: auth.uid()/eh_master()/... sempre dentro de (select ...) [' || coalesce(v_lista, '') || ']',
    v_lista is null);

  perform teste.conferir('políticas de storage.objects só valem para o bucket obtra',
    not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname like 'obtra_%'
                  and coalesce(qual, with_check) not like '%bucket_id = ''obtra''%'));
end $$;

-- search_path: tabela temporária homônima não engana as funções definer.
do $$
begin
  perform teste.vestir('x.colab@aud.obtra');
  create temp table perfis (id uuid, papel text, ativo boolean, empresa_id uuid, nome text, email text);
  insert into pg_temp.perfis values (auth.uid(), 'master', true, null, 'eu', 'eu');
  perform teste.conferir('tabela temporária "perfis" não faz ninguém virar master (pg_temp por último)',
    not public.eh_master() and public.meu_papel() = 'colaborador'
    and public.empresa_da_equipe() = teste.a('X'));
  drop table pg_temp.perfis;
  perform teste.sair();
end $$;

-- ================================================= 2. isolamento X × Y ======
-- Quem é de Y (admin, colaborador, cliente) não lê, altera nem apaga nada de X.
do $$
declare
  X uuid := teste.a('X');
  quem text;
  t text;
  filtro text;
  f record;
  rel_x text := format('(%L, %L, %L)', teste.a('RX1'), teste.a('RX2'), teste.a('RX3'));
  obras_x text := format('(%L, %L)', teste.a('OX1'), teste.a('OX2'));
begin
  foreach quem in array array['y.admin@aud.obtra', 'y.colab@aud.obtra', 'y.cliente@aud.obtra'] loop
    perform teste.vestir(quem);
    foreach t in array array['empresas', 'perfis', 'obras', 'relatorios', 'fotos', 'documentos', 'funcoes',
                             'colaboradores', 'materiais', 'equipamentos', 'historico', 'obra_clientes',
                             'relatorio_mao_obra', 'relatorio_equipamentos', 'relatorio_atividades',
                             'relatorio_ocorrencias', 'relatorio_materiais', 'relatorio_notas_compras',
                             'relatorio_comentarios'] loop
      filtro := case
                  when t = 'empresas' then format('id = %L', X)
                  when t = 'obra_clientes' then 'obra_id in ' || obras_x
                  when t like 'relatorio\_%' then 'relatorio_id in ' || rel_x
                  else format('empresa_id = %L', X)
                end;
      perform teste.conferir(format('%s: não lê %s de X', split_part(quem, '@', 1), t),
        teste.conta(format('select count(*) from %I where %s', t, filtro)) = 0);
      if t <> 'historico' then
        perform teste.conferir(format('%s: não altera %s de X (0 linhas)', split_part(quem, '@', 1), t),
          teste.linhas(format('update %I set %s where %s', t,
            case t when 'obra_clientes' then 'cliente_id = cliente_id'
                   when 'empresas' then 'nome = nome'
                   when 'perfis' then 'nome = nome'
                   when 'relatorio_comentarios' then 'texto = texto'
                   else 'criado_em = criado_em' end, filtro)) = 0);
        perform teste.conferir(format('%s: não exclui %s de X (0 linhas)', split_part(quem, '@', 1), t),
          teste.linhas(format('delete from %I where %s', t, filtro)) = 0);
      end if;
    end loop;
    perform teste.conferir(format('%s: não lê arquivos de X no bucket', split_part(quem, '@', 1)),
      teste.conta(format('select count(*) from storage.objects where name like %L', X::text || '/%')) = 0);
    perform teste.conferir(format('%s: não altera nem apaga arquivos de X', split_part(quem, '@', 1)),
      teste.linhas(format('update storage.objects set metadata = metadata where name like %L', X::text || '/%')) = 0
      and teste.linhas(format('delete from storage.objects where name like %L', X::text || '/%')) = 0);

    -- inserções apontando para X
    perform teste.conferir(format('%s: não cria obra em X', split_part(quem, '@', 1)),
      teste.erro(format($q$insert into obras (empresa_id, nome) values (%L, 'invasão')$q$, X)) is not null);
    perform teste.conferir(format('%s: não cria relatório em obra de X', split_part(quem, '@', 1)),
      teste.erro(format($q$insert into relatorios (obra_id, empresa_id, numero, data) values (%L, %L, 0, current_date)$q$,
                        teste.a('OX2'), X)) is not null
      and teste.erro(format('select criar_relatorio(%L, current_date)', teste.a('OX2'))) is not null);
    for f in select * from teste.filhos() loop
      perform teste.conferir(format('%s: não insere em %s de relatório de X', split_part(quem, '@', 1), f.tabela),
        teste.erro(format('insert into %I (relatorio_id, %I) values (%L, %L)', f.tabela, f.coluna,
                          teste.a('RX2'), 'invasão')) is not null);
    end loop;
    perform teste.conferir(format('%s: não registra foto nem documento em X', split_part(quem, '@', 1)),
      teste.erro(format($q$insert into fotos (obra_id, path, thumb_path) values (%L, %L, %L)$q$, teste.a('OX1'),
                        teste.pasta('X', 'OX1') || 'fotos/sem.webp', teste.pasta('X', 'OX1') || 'fotos/sem_t.webp')) is not null
      and teste.erro(format($q$insert into documentos (obra_id, nome, path) values (%L, 'x', %L)$q$, teste.a('OX1'),
                            teste.pasta('X', 'OX1') || 'docs/vis.pdf')) is not null);
    perform teste.conferir(format('%s: não cadastra em X', split_part(quem, '@', 1)),
      teste.erro(format($q$insert into funcoes (empresa_id, nome) values (%L, 'invasão')$q$, X)) is not null
      and teste.erro(format($q$insert into materiais (empresa_id, nome) values (%L, 'invasão')$q$, X)) is not null);
    perform teste.conferir(format('%s: não vincula cliente a obra de X', split_part(quem, '@', 1)),
      teste.erro(format('insert into obra_clientes (obra_id, cliente_id) values (%L, %L)',
                        teste.a('OX1'), teste.id('y.cliente@aud.obtra'))) is not null);
    perform teste.conferir(format('%s: não sobe arquivo na pasta de X', split_part(quem, '@', 1)),
      teste.erro(format($q$insert into storage.objects (bucket_id, name) values ('obtra', %L)$q$,
                        teste.pasta('X', 'OX1') || 'fotos/invasao.webp')) is not null);
    perform teste.conferir(format('%s: não muda status de relatório de X', split_part(quem, '@', 1)),
      teste.erro(format($q$select mudar_status_relatorio(%L, 'preenchendo')$q$, teste.a('RX3'))) is not null);
  end loop;

  -- Y não "puxa" linha de X para si trocando empresa/obra/relatório.
  perform teste.vestir('y.admin@aud.obtra');
  perform teste.conferir('admin Y não move relatório de Y para obra de X',
    teste.erro(format('update relatorios set obra_id = %L where id = %L', teste.a('OX1'), teste.a('RY1'))) is not null);
  perform teste.conferir('admin Y não move item de Y para relatório de X',
    teste.erro(format('update relatorio_mao_obra set relatorio_id = %L where relatorio_id = %L',
                      teste.a('RX1'), teste.a('RY1'))) is not null);
  perform teste.conferir('admin Y não move comentário para relatório de X (fica onde está)',
    teste.erro(format($q$insert into relatorio_comentarios (relatorio_id, texto) values (%L, 'meu')$q$, teste.a('RY1'))) is null
    and teste.linhas(format('update relatorio_comentarios set relatorio_id = %L where relatorio_id = %L and autor_id = auth.uid()',
                            teste.a('RX2'), teste.a('RY1'))) = 1
    and teste.conta(format('select count(*) from relatorio_comentarios where relatorio_id = %L', teste.a('RY1'))) = 2);
  perform teste.conferir('admin Y não liga foto de Y a relatório de X',
    teste.erro(format('update fotos set relatorio_id = %L where obra_id = %L', teste.a('RX1'), teste.a('OY1'))) is not null);
  perform teste.conferir('admin Y não move cadastro para X',
    teste.erro(format('update funcoes set empresa_id = %L where empresa_id = %L', X, teste.a('Y'))) is not null);
  perform teste.sair();
end $$;

-- ======================================== 3. escalonamento de privilégio ====
do $$
declare
  X uuid := teste.a('X');  Y uuid := teste.a('Y');
  eu uuid;
  e text;
begin
  -- colaborador
  eu := teste.vestir('x.colab@aud.obtra');
  perform teste.conferir('colaborador não muda o próprio papel/empresa/ativo',
    teste.erro(format($q$update perfis set papel = 'admin' where id = %L$q$, eu)) is not null
    and teste.erro(format('update perfis set empresa_id = %L where id = %L', Y, eu)) is not null
    and teste.erro(format('update perfis set ativo = false where id = %L', eu)) is not null);
  perform teste.conferir('colaborador não troca o próprio e-mail pelo perfil',
    teste.erro(format($q$update perfis set email = 'outro@x.com' where id = %L$q$, eu)) is not null);
  perform teste.conferir('colaborador não edita perfil de ninguém (0 linhas)',
    teste.linhas(format($q$update perfis set nome = 'hack' where empresa_id = %L and id <> %L$q$, X, eu)) = 0);
  perform teste.conferir('colaborador não chama RPCs de admin',
    teste.erro($q$select admin_criar_usuario('n1@aud.obtra','segredo1','N','cliente','c0000000-0000-4000-8000-00000000000c')$q$) is not null
    and teste.erro(format($q$select admin_redefinir_senha(%L, 'novasenha')$q$, teste.id('x.cliente@aud.obtra'))) is not null
    and teste.erro(format('select admin_excluir_usuario(%L)', teste.id('x.cliente@aud.obtra'))) is not null
    and teste.erro(format('select definir_obras_cliente(%L, array[%L]::uuid[])', teste.id('x.cliente2@aud.obtra'), teste.a('OX1'))) is not null);
  perform teste.conferir('colaborador não chama funções internas (histórico, gatilhos, tornar_master)',
    teste.erro(format($q$select registrar_historico(%L, null, 'aprovou', 'relatorio', null, 'falso')$q$, X)) like '%permission denied%'
    and teste.erro($q$select bytes_no_storage(array['x'])$q$) like '%permission denied%'
    and teste.erro(format('select pode_administrar_usuario(%L)', eu)) like '%permission denied%'
    and teste.erro($q$select tornar_master('x.colab@aud.obtra')$q$) like '%permission denied%');
  perform teste.conferir('colaborador não altera a empresa',
    teste.linhas(format($q$update empresas set nome = 'hack' where id = %L$q$, X)) = 0);
  perform teste.conferir('colaborador não vincula cliente a obra',
    teste.erro(format('insert into obra_clientes values (%L, %L)', teste.a('OX2'), teste.id('x.cliente2@aud.obtra'))) is not null);

  -- cliente
  eu := teste.vestir('x.cliente@aud.obtra');
  perform teste.conferir('cliente não muda o próprio papel/empresa/ativo',
    teste.erro(format($q$update perfis set papel = 'admin' where id = %L$q$, eu)) is not null
    and teste.erro(format('update perfis set empresa_id = null where id = %L', eu)) is not null);
  perform teste.conferir('cliente edita o próprio nome',
    teste.linhas(format($q$update perfis set nome = 'X Cliente' where id = %L$q$, eu)) = 1);
  perform teste.conferir('cliente não edita perfis da equipe (0 linhas)',
    teste.linhas(format($q$update perfis set nome = 'hack' where empresa_id = %L and id <> %L$q$, X, eu)) = 0);
  perform teste.conferir('cliente não chama RPCs de equipe/admin',
    teste.erro(format('select criar_relatorio(%L, current_date)', teste.a('OX1'))) is not null
    and teste.erro(format($q$select mudar_status_relatorio(%L, 'preenchendo')$q$, teste.a('RX2'))) is not null
    and teste.erro($q$select admin_criar_usuario('n2@aud.obtra','segredo1','N','cliente','c0000000-0000-4000-8000-00000000000c')$q$) is not null);

  -- admin
  eu := teste.vestir('x.admin@aud.obtra');
  perform teste.conferir('admin não altera limite, situação nem uso da empresa',
    teste.erro(format('update empresas set limite_armazenamento_mb = 999999 where id = %L', X)) is not null
    and teste.erro(format('update empresas set ativa = false where id = %L', X)) is not null
    and teste.erro(format('update empresas set armazenamento_usado_bytes = 0 where id = %L', X)) is not null);
  perform teste.conferir('admin não muda o id da empresa',
    teste.erro(format('update empresas set id = gen_random_uuid() where id = %L', X)) is not null);
  perform teste.conferir('admin não muda usuário de empresa nem promove a master',
    teste.erro(format('update perfis set empresa_id = %L where id = %L', Y, teste.id('x.colab@aud.obtra'))) is not null
    and teste.erro(format($q$update perfis set papel = 'master', empresa_id = null where id = %L$q$, teste.id('x.colab@aud.obtra'))) is not null);
  perform teste.conferir('admin não muda o próprio papel nem se desativa',
    teste.erro(format($q$update perfis set papel = 'colaborador' where id = %L$q$, eu)) is not null
    and teste.erro(format('update perfis set ativo = false where id = %L', eu)) is not null);
  perform teste.conferir('admin desativa e reativa colega da empresa',
    teste.linhas(format('update perfis set ativo = false where id = %L', teste.id('x.admin2@aud.obtra'))) = 1
    and teste.linhas(format('update perfis set ativo = true where id = %L', teste.id('x.admin2@aud.obtra'))) = 1);
  perform teste.conferir('admin não cria master nem usuário em outra empresa',
    teste.erro($q$select admin_criar_usuario('n3@aud.obtra','segredo1','N','master',null)$q$) is not null
    and teste.erro(format($q$select admin_criar_usuario('n3@aud.obtra','segredo1','N','admin',%L)$q$, Y)) is not null);
  perform teste.conferir('admin não cria cliente com obra de outra empresa',
    teste.erro(format($q$select admin_criar_usuario('n3@aud.obtra','segredo1','N','cliente',%L, array[%L]::uuid[])$q$,
                      X, teste.a('OY1'))) like '%Obra não encontrada nesta empresa%');
  perform teste.conferir('admin não vincula cliente de outra empresa (nem direto na tabela)',
    teste.erro(format('insert into obra_clientes values (%L, %L)', teste.a('OX2'), teste.id('y.cliente@aud.obtra'))) is not null
    and teste.erro(format('select definir_obras_cliente(%L, array[%L]::uuid[])', teste.id('y.cliente@aud.obtra'), teste.a('OX1'))) is not null);
  perform teste.conferir('admin não vincula colaborador como cliente',
    teste.erro(format('insert into obra_clientes values (%L, %L)', teste.a('OX2'), teste.id('x.colab@aud.obtra'))) is not null);
  perform teste.conferir('admin não exclui a si, nem master, nem gente de outra empresa',
    teste.erro(format('select admin_excluir_usuario(%L)', eu)) like '%a si mesmo%'
    and teste.erro(format('select admin_excluir_usuario(%L)', teste.id('t.master@teste.obtra'))) is not null
    and teste.erro(format('select admin_excluir_usuario(%L)', teste.id('y.colab@aud.obtra'))) is not null);
  perform teste.conferir('admin não redefine senha de master nem de outra empresa',
    teste.erro(format($q$select admin_redefinir_senha(%L, 'novasenha')$q$, teste.id('t.master@teste.obtra'))) is not null
    and teste.erro(format($q$select admin_redefinir_senha(%L, 'novasenha')$q$, teste.id('y.colab@aud.obtra'))) is not null);
  perform teste.conferir('admin não lê a configuração nem o master',
    teste.conta('select count(*) from configuracao') = 0
    and teste.conta($q$select count(*) from perfis where papel = 'master'$q$) = 0);

  -- master
  eu := teste.vestir('t.master@teste.obtra');
  perform teste.conferir('master não se exclui pela API',
    teste.erro(format('select admin_excluir_usuario(%L)', eu)) like '%a si mesmo%');
  perform teste.conferir('master não cria cliente em X com obra de Y',
    teste.erro(format($q$select admin_criar_usuario('n4@aud.obtra','segredo1','N','cliente',%L, array[%L]::uuid[])$q$,
                      X, teste.a('OY1'))) like '%Obra não encontrada nesta empresa%');
  perform teste.conferir('master não cria master pela API',
    teste.erro($q$select admin_criar_usuario('n4@aud.obtra','segredo1','N','master',null)$q$) is not null);
  perform teste.conferir('master não escreve na configuração nem no histórico pela API',
    teste.erro($q$update configuracao set master_email = 'eu@x.com'$q$) like '%permission denied%'
    and teste.erro(format($q$insert into historico (empresa_id, acao, entidade) values (%L, 'aprovou', 'relatorio')$q$, X)) like '%permission denied%');

  -- perfil inativo não usa RPC nenhuma de admin
  perform teste.sair();
  update perfis set ativo = false where email = 'x.admin2@aud.obtra';
  perform teste.vestir('x.admin2@aud.obtra');
  perform teste.conferir('admin inativo não cria, não exclui, não redefine senha',
    teste.erro(format($q$select admin_criar_usuario('n5@aud.obtra','segredo1','N','colaborador',%L)$q$, X)) is not null
    and teste.erro(format('select admin_excluir_usuario(%L)', teste.id('x.cliente2@aud.obtra'))) is not null
    and teste.erro(format($q$select admin_redefinir_senha(%L, 'novasenha')$q$, teste.id('x.colab@aud.obtra'))) is not null);
  perform teste.conferir('admin inativo não vê nem mexe em nada',
    teste.conta('select count(*) from obras') = 0
    and teste.linhas(format($q$update perfis set nome = 'x' where id = %L$q$, teste.id('x.colab@aud.obtra'))) = 0);
  perform teste.sair();
  update perfis set ativo = true where email = 'x.admin2@aud.obtra';
end $$;

-- anônimo: nada em tabela nenhuma, RPC nenhuma
do $$
declare
  t text;
  r text;
begin
  perform teste.vestir(null);
  for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    perform teste.conferir(format('anon: permission denied em %s', t),
      teste.erro(format('select 1 from %I limit 1', t)) like '%permission denied%'
      and teste.erro(format('delete from %I', t)) like '%permission denied%');
  end loop;
  foreach r in array array[
    $q$select criar_relatorio('c0000000-0000-4000-8000-0000000000c1', current_date)$q$,
    $q$select mudar_status_relatorio('c0000000-0000-4000-8000-000000000e11', 'revisar')$q$,
    $q$select admin_excluir_usuario('c0000000-0000-4000-8000-00000000000c')$q$,
    $q$select admin_redefinir_senha('c0000000-0000-4000-8000-00000000000c', 'abcdef')$q$,
    $q$select definir_obras_cliente('c0000000-0000-4000-8000-00000000000c', '{}')$q$,
    $q$select eh_master()$q$,
    $q$select storage_pode_ler('x')$q$] loop
    perform teste.conferir('anon: permission denied em ' || split_part(split_part(r, 'select ', 2), '(', 1),
      teste.erro(r) like '%permission denied%');
  end loop;
  perform teste.conferir('anon: não sobe nem lê arquivo no bucket',
    teste.conta($q$select count(*) from storage.objects where bucket_id = 'obtra'$q$) = 0
    and teste.erro($q$insert into storage.objects (bucket_id, name) values ('obtra', 'c0000000-0000-4000-8000-00000000000c/logo/x.webp')$q$) is not null);
  perform teste.sair();
end $$;

-- ================================================================ 4. cliente
do $$
declare
  X uuid := teste.a('X');
  f record;
  p text := teste.pasta('X', 'OX1');
  eu uuid;
begin
  eu := teste.vestir('x.cliente@aud.obtra');
  perform teste.conferir('cliente X vê só a obra vinculada (OX1)',
    teste.conta(format('select count(*) from obras where empresa_id = %L', X)) = 1
    and teste.conta(format('select count(*) from obras where id = %L', teste.a('OX1'))) = 1);
  perform teste.conferir('cliente X vê só o RDO aprovado (nem preenchendo nem revisar)',
    teste.conta(format('select count(*) from relatorios where empresa_id = %L', X)) = 1
    and teste.conta(format('select count(*) from relatorios where id = %L', teste.a('RX2'))) = 1);
  for f in select * from teste.filhos() loop
    if f.tabela = 'relatorio_notas_compras' then
      -- notas são internas da construtora (0007): nem as do aprovado
      perform teste.conferir('cliente: relatorio_notas_compras nunca (nem do RDO aprovado)',
        teste.conta(format('select count(*) from %I where relatorio_id in (%L, %L, %L)', f.tabela, teste.a('RX1'), teste.a('RX2'), teste.a('RX3'))) = 0);
    else
      perform teste.conferir(format('cliente: %s só do RDO aprovado', f.tabela),
        teste.conta(format('select count(*) from %I where relatorio_id in (%L, %L)', f.tabela, teste.a('RX1'), teste.a('RX3'))) = 0
        and teste.conta(format('select count(*) from %I where relatorio_id = %L', f.tabela, teste.a('RX2'))) >= 1);
    end if;
    if f.tabela <> 'relatorio_comentarios' then
      perform teste.conferir(format('cliente: não escreve em %s (nem no aprovado)', f.tabela),
        teste.erro(format('insert into %I (relatorio_id, %I) values (%L, %L)', f.tabela, f.coluna, teste.a('RX2'), 'x')) is not null
        and teste.linhas(format('update %I set ordem = ordem + 1 where relatorio_id = %L', f.tabela, teste.a('RX2'))) = 0
        and teste.linhas(format('delete from %I where relatorio_id = %L', f.tabela, teste.a('RX2'))) = 0);
    end if;
  end loop;
  perform teste.conferir('cliente: fotos sem RDO e do aprovado, nunca dos outros',
    teste.conta(format('select count(*) from fotos where empresa_id = %L', X)) = 2
    and teste.conta(format('select count(*) from fotos where relatorio_id in (%L, %L)', teste.a('RX1'), teste.a('RX3'))) = 0);
  perform teste.conferir('cliente: arquivos das fotos não aprovadas não saem do bucket',
    teste.conta(format('select count(*) from storage.objects where name in (%L, %L, %L, %L)',
      p || 'fotos/rx1.webp', p || 'fotos/rx1_t.webp', p || 'fotos/rx3.webp', p || 'fotos/rx3_t.webp')) = 0
    and teste.conta(format('select count(*) from storage.objects where name in (%L, %L, %L, %L)',
      p || 'fotos/rx2.webp', p || 'fotos/rx2_t.webp', p || 'fotos/sem.webp', p || 'fotos/sem_t.webp')) = 4);
  perform teste.conferir('cliente: list da pasta da obra traz só o permitido (4 fotos + doc visível)',
    teste.conta(format('select count(*) from storage.objects where name like %L', p || '%')) = 5);
  perform teste.conferir('cliente: só o documento visível (linha e arquivo)',
    teste.conta(format('select count(*) from documentos where empresa_id = %L', X)) = 1
    and teste.conta(format('select count(*) from storage.objects where name = %L', p || 'docs/int.pdf')) = 0);
  perform teste.conferir('cliente: lê o logo da própria empresa',
    teste.conta(format('select count(*) from storage.objects where name = %L', X::text || '/logo/logo.webp')) = 1);
  perform teste.conferir('cliente: não escreve em obra, foto, documento, cadastro, vínculo',
    teste.linhas(format($q$update obras set nome = 'hack' where id = %L$q$, teste.a('OX1'))) = 0
    and teste.linhas(format('update fotos set legenda = %L where empresa_id = %L', 'hack', X)) = 0
    and teste.linhas(format('delete from fotos where empresa_id = %L', X)) = 0
    and teste.linhas(format('update documentos set visivel_cliente = true where empresa_id = %L', X)) = 0
    and teste.erro(format($q$insert into fotos (obra_id, path, thumb_path) values (%L, %L, %L)$q$,
                          teste.a('OX1'), p || 'fotos/sem.webp', p || 'fotos/sem_t.webp')) is not null
    and teste.erro(format($q$insert into equipamentos (empresa_id, nome) values (%L, 'c')$q$, X)) is not null
    and teste.linhas(format('delete from obra_clientes where cliente_id = %L', eu)) = 0
    and teste.linhas(format('update relatorios set observacoes = %L where id = %L', 'hack', teste.a('RX2'))) = 0);
  perform teste.conferir('cliente: não sobe, não troca, não apaga arquivo',
    teste.erro(format($q$insert into storage.objects (bucket_id, name) values ('obtra', %L)$q$, p || 'fotos/cli.webp')) is not null
    and teste.linhas(format('delete from storage.objects where name like %L', p || '%')) = 0
    and teste.linhas(format('update storage.objects set name = name where name like %L', p || '%')) = 0);
  perform teste.conferir('cliente: comenta no aprovado, não no preenchendo nem no revisar',
    teste.erro(format($q$insert into relatorio_comentarios (relatorio_id, texto) values (%L, 'ok')$q$, teste.a('RX2'))) is null
    and teste.erro(format($q$insert into relatorio_comentarios (relatorio_id, texto) values (%L, 'x')$q$, teste.a('RX1'))) is not null
    and teste.erro(format($q$insert into relatorio_comentarios (relatorio_id, texto) values (%L, 'x')$q$, teste.a('RX3'))) is not null);
  -- (leituras depois de escrever: sempre em comando separado ou via teste.conta —
  --  uma subconsulta no mesmo comando enxerga o retrato de ANTES da escrita)
  perform teste.conferir('cliente: comentário com autor_id alheio é aceito...',
    teste.erro(format($q$insert into relatorio_comentarios (relatorio_id, texto, autor_id) values (%L, 'x', %L)$q$,
                      teste.a('RX2'), teste.id('x.admin@aud.obtra'))) is null);
  perform teste.conferir('... mas gravado em nome próprio (autor_id forçado)',
    not exists (select 1 from relatorio_comentarios where relatorio_id = teste.a('RX2')
                  and autor_id = teste.id('x.admin@aud.obtra')));
  perform teste.conferir('cliente: não edita nem apaga comentário alheio',
    teste.linhas(format($q$update relatorio_comentarios set texto = 'hack' where relatorio_id = %L and autor_id is distinct from %L$q$,
                        teste.a('RX2'), eu)) = 0
    and teste.linhas(format('delete from relatorio_comentarios where relatorio_id = %L and autor_id is distinct from %L',
                            teste.a('RX2'), eu)) = 0);
  perform teste.linhas(format('update relatorio_comentarios set autor_id = %L where autor_id = %L',
                              teste.id('x.admin@aud.obtra'), eu));
  perform teste.conferir('cliente: não troca o autor do próprio comentário',
    not exists (select 1 from relatorio_comentarios where relatorio_id = teste.a('RX2')
                  and autor_id = teste.id('x.admin@aud.obtra'))
    and exists (select 1 from relatorio_comentarios where autor_id = eu));
  perform teste.conferir('cliente: não lê cadastros, histórico, configuração, outros clientes',
    teste.conta('select count(*) from funcoes') = 0 and teste.conta('select count(*) from historico') = 0
    and teste.conta('select count(*) from configuracao') = 0
    and teste.conta($q$select count(*) from perfis where papel = 'cliente'$q$) = 1);

  perform teste.vestir('x.cliente2@aud.obtra');
  perform teste.conferir('cliente sem obra: nada de obra, RDO, foto, documento, arquivo de obra',
    teste.conta('select count(*) from obras') = 0 and teste.conta('select count(*) from relatorios') = 0
    and teste.conta('select count(*) from fotos') = 0 and teste.conta('select count(*) from documentos') = 0
    and teste.conta(format('select count(*) from storage.objects where name like %L', p || '%')) = 0);
  perform teste.conferir('cliente sem obra: não comenta em RDO aprovado de obra alheia',
    teste.erro(format($q$insert into relatorio_comentarios (relatorio_id, texto) values (%L, 'x')$q$, teste.a('RX2'))) is not null);

  -- vínculo com obra de outra empresa não pode existir (gatilho)
  perform teste.sair();
  perform teste.conferir('vínculo cliente × obra de outra empresa é recusado até pelo SQL',
    teste.erro(format('insert into obra_clientes values (%L, %L)', teste.a('OY1'), teste.id('x.cliente@aud.obtra'))) is not null);

  -- empresa inativa: o cliente não vê nada, nem comenta
  update empresas set ativa = false where id = X;
  perform teste.vestir('x.cliente@aud.obtra');
  perform teste.conferir('empresa inativa: cliente não vê obra, RDO, foto, doc, arquivo, empresa',
    teste.conta('select count(*) from obras') = 0 and teste.conta('select count(*) from relatorios') = 0
    and teste.conta('select count(*) from fotos') = 0 and teste.conta('select count(*) from documentos') = 0
    and teste.conta('select count(*) from empresas') = 0
    and teste.conta(format('select count(*) from storage.objects where name like %L', X::text || '/%')) = 0);
  perform teste.conferir('empresa inativa: cliente não comenta; o próprio perfil continua legível',
    teste.erro(format($q$insert into relatorio_comentarios (relatorio_id, texto) values (%L, 'x')$q$, teste.a('RX2'))) is not null
    and teste.conta('select count(*) from perfis') = 1);
  perform teste.vestir('x.colab@aud.obtra');
  perform teste.conferir('empresa inativa: equipe também não vê nem escreve',
    teste.conta('select count(*) from obras') = 0
    and teste.erro(format('select criar_relatorio(%L, current_date)', teste.a('OX1'))) is not null
    and teste.erro(format($q$insert into storage.objects (bucket_id, name) values ('obtra', %L)$q$, p || 'fotos/z.webp')) is not null);
  perform teste.sair();
  update empresas set ativa = true where id = X;

  -- perfil inativo
  update perfis set ativo = false where email = 'x.cliente@aud.obtra';
  perform teste.vestir('x.cliente@aud.obtra');
  perform teste.conferir('cliente inativo não vê nada (só o próprio perfil)',
    teste.conta('select count(*) from obras') = 0 and teste.conta('select count(*) from relatorios') = 0
    and teste.conta(format('select count(*) from storage.objects where name like %L', X::text || '/%')) = 0
    and teste.conta('select count(*) from perfis') = 1);
  perform teste.sair();
  update perfis set ativo = true where email = 'x.cliente@aud.obtra';

  -- cliente rebaixado/promovido: o vínculo antigo não dá acesso de cliente a colaborador
  perform teste.vestir('x.cliente@aud.obtra');
  perform teste.conferir('cliente volta a ver após reativação', teste.conta('select count(*) from obras') = 1);
  perform teste.sair();
end $$;

-- ======================================= 5. colaborador × aprovado; status =
do $$
declare
  p text := teste.pasta('X', 'OX1');
  f record;
  r uuid;
  e text;
begin
  perform teste.vestir('x.colab@aud.obtra');
  perform teste.conferir('colaborador não edita RDO aprovado nem nenhum filho dele',
    teste.linhas(format('update relatorios set observacoes = %L where id = %L', 'x', teste.a('RX2'))) = 0);
  for f in select * from teste.filhos() where tabela <> 'relatorio_comentarios' loop
    perform teste.conferir(format('colaborador × aprovado: %s travado (inserir/alterar/excluir)', f.tabela),
      teste.erro(format('insert into %I (relatorio_id, %I) values (%L, %L)', f.tabela, f.coluna, teste.a('RX2'), 'x')) is not null
      and teste.linhas(format('update %I set ordem = 9 where relatorio_id = %L', f.tabela, teste.a('RX2'))) = 0
      and teste.linhas(format('delete from %I where relatorio_id = %L', f.tabela, teste.a('RX2'))) = 0);
    perform teste.conferir(format('colaborador edita %s de RDO aberto', f.tabela),
      teste.linhas(format('update %I set ordem = 1 where relatorio_id = %L', f.tabela, teste.a('RX1'))) >= 1);
  end loop;
  perform teste.conferir('colaborador não mexe na foto do RDO aprovado nem põe foto nele',
    teste.linhas(format('delete from fotos where relatorio_id = %L', teste.a('RX2'))) = 0
    and teste.linhas(format('update fotos set relatorio_id = null where relatorio_id = %L', teste.a('RX2'))) = 0
    and teste.erro(format('update fotos set relatorio_id = %L where relatorio_id = %L', teste.a('RX2'), teste.a('RX1'))) is not null);
  perform teste.conferir('colaborador não apaga nem sobrescreve o ARQUIVO da foto do RDO aprovado',
    teste.linhas(format('delete from storage.objects where name in (%L, %L)', p || 'fotos/rx2.webp', p || 'fotos/rx2_t.webp')) = 0
    and teste.linhas(format($q$update storage.objects set metadata = '{"size": 1}' where name = %L$q$, p || 'fotos/rx2.webp')) = 0);
  perform teste.conferir('colaborador apaga/sobrescreve arquivo de foto de RDO aberto',
    teste.linhas(format($q$update storage.objects set metadata = metadata where name = %L$q$, p || 'fotos/rx1.webp')) = 1);
  perform teste.conferir('colaborador comenta no aprovado', teste.erro(format(
    $q$insert into relatorio_comentarios (relatorio_id, texto) values (%L, 'visto')$q$, teste.a('RX2'))) is null);
  perform teste.conferir('colaborador não passa aprovado para rascunho por UPDATE',
    teste.linhas(format($q$update relatorios set status = 'preenchendo' where id = %L$q$, teste.a('RX2'))) = 0);
  perform teste.conferir('colaborador não grava aprovado por UPDATE (RLS)',
    teste.erro(format($q$update relatorios set status = 'aprovado' where id = %L$q$, teste.a('RX3'))) like '%row-level security%');
  perform teste.conferir('colaborador edita RDO aberto (tentando forjar aprovado_por/criado_por)',
    teste.linhas(format('update relatorios set aprovado_por = %L, aprovado_em = now(), criado_por = %L where id = %L',
      teste.id('x.admin@aud.obtra'), teste.id('x.admin@aud.obtra'), teste.a('RX1'))) = 1);
  perform teste.conferir('... e o gatilho não deixa forjar',
    (select aprovado_por is null and aprovado_em is null and criado_por is distinct from teste.id('x.admin@aud.obtra')
           from relatorios where id = teste.a('RX1')));
  perform teste.conferir('status inválido é recusado',
    teste.erro(format($q$select mudar_status_relatorio(%L, 'publicado')$q$, teste.a('RX1'))) like '%Status inválido%');
  perform mudar_status_relatorio(teste.a('RX1'), 'revisar');
  perform teste.conferir('colaborador: preenchendo → revisar',
    (select status from relatorios where id = teste.a('RX1')) = 'revisar');
  perform mudar_status_relatorio(teste.a('RX1'), 'preenchendo');
  perform teste.conferir('colaborador: revisar → preenchendo',
    (select status from relatorios where id = teste.a('RX1')) = 'preenchendo');
  perform teste.conferir('colaborador: → aprovado recusado com a mensagem do contrato',
    teste.erro(format($q$select mudar_status_relatorio(%L, 'aprovado')$q$, teste.a('RX3')))
      = 'Somente o administrador aprova ou reabre um relatório aprovado');

  perform teste.vestir('x.admin@aud.obtra');
  perform mudar_status_relatorio(teste.a('RX3'), 'aprovado');
  perform teste.conferir('admin aprova: aprovado_por = admin, aprovado_em preenchido',
    (select aprovado_por = teste.id('x.admin@aud.obtra') and aprovado_em is not null
       from relatorios where id = teste.a('RX3')));
  perform teste.linhas(format('update relatorios set aprovado_por = %L where id = %L',
                              teste.id('x.admin2@aud.obtra'), teste.a('RX3')));
  perform teste.conferir('admin não forja aprovado_por de um aprovado',
    (select aprovado_por from relatorios where id = teste.a('RX3')) = teste.id('x.admin@aud.obtra'));
  perform mudar_status_relatorio(teste.a('RX3'), 'revisar');
  perform teste.conferir('admin reabre: aprovado → revisar limpa aprovado_por/em',
    (select status = 'revisar' and aprovado_por is null and aprovado_em is null from relatorios where id = teste.a('RX3')));
  perform teste.linhas(format($q$update relatorios set status = 'aprovado', aprovado_por = %L where id = %L$q$,
                              teste.id('x.admin2@aud.obtra'), teste.a('RX3')));
  perform teste.conferir('admin aprova por UPDATE direto e o gatilho grava quem aprovou (não o informado)',
    (select aprovado_por from relatorios where id = teste.a('RX3')) = teste.id('x.admin@aud.obtra'));
  perform mudar_status_relatorio(teste.a('RX3'), 'revisar');
  perform teste.conferir('admin sobrescreve arquivo da foto do RDO aprovado',
    teste.linhas(format('update storage.objects set metadata = metadata where name = %L',
                        teste.pasta('X', 'OX1') || 'fotos/rx2.webp')) = 1);
  perform teste.conferir('admin edita filho de RDO aprovado',
    teste.linhas(format('update relatorio_atividades set progresso = 50 where relatorio_id = %L', teste.a('RX2'))) = 1);
  perform teste.sair();
end $$;

-- ================================================ 6. cota de armazenamento ==
do $$
declare
  Q  uuid := teste.a('Q');
  OQ uuid := teste.a('OQ1');
  p  text := teste.pasta('Q', 'OQ1');
  O2 uuid;
  dup uuid;
  usado bigint;
begin
  perform teste.sair();
  insert into empresas (id, nome, limite_armazenamento_mb) values (Q, 'Cota Q', 1);
  insert into obras (id, empresa_id, nome) values (OQ, Q, 'Q Um');
  perform admin_criar_usuario('q.admin@aud.obtra', 'segredo1', 'Q Admin', 'admin', Q);

  perform teste.vestir('q.admin@aud.obtra');
  insert into obras (empresa_id, nome) values (Q, 'Q Dois') returning id into O2;
  -- "Upload": o objeto entra como o usuário (políticas do bucket valendo).
  insert into storage.objects (bucket_id, name, metadata) values
    ('obtra', p || 'fotos/a.webp', '{"size": 300000}'), ('obtra', p || 'fotos/a_t.webp', '{"size": 20000}'),
    ('obtra', p || 'docs/d.pdf', '{"size": 100000}'),
    ('obtra', Q::text || '/' || O2::text || '/fotos/b.webp', '{"size": 200000}'),
    ('obtra', Q::text || '/' || O2::text || '/fotos/b_t.webp', '{"size": 10000}');
  insert into fotos (obra_id, path, thumb_path, bytes) values (OQ, p || 'fotos/a.webp', p || 'fotos/a_t.webp', 1);
  insert into documentos (obra_id, nome, path, bytes) values (OQ, 'd.pdf', p || 'docs/d.pdf', 1);
  insert into fotos (obra_id, path, thumb_path) values (O2, Q::text || '/' || O2::text || '/fotos/b.webp',
                                                        Q::text || '/' || O2::text || '/fotos/b_t.webp');
  select armazenamento_usado_bytes into usado from empresas where id = Q;
  perform teste.conferir('cota: soma foto+miniatura+documento pelos tamanhos reais (630000)', usado = 630000);

  -- Duas linhas para o mesmo arquivo: cada uma conta pelo tamanho real
  -- (declarar bytes = 0 não adianta).
  insert into fotos (obra_id, path, thumb_path, bytes) values (OQ, p || 'fotos/a.webp', p || 'fotos/a_t.webp', 0)
  returning id into dup;
  perform teste.conferir('cota: segunda linha para o mesmo arquivo conta o tamanho real (bytes = 0 ignorado)',
    (select armazenamento_usado_bytes from empresas where id = Q) = 950000);
  delete from fotos where id = dup;
  perform teste.conferir('cota: excluir a duplicata devolve os bytes', (select armazenamento_usado_bytes from empresas where id = Q) = 630000);

  insert into storage.objects (bucket_id, name, metadata) values ('obtra', p || 'fotos/g.webp', '{"size": 500000}'),
                                                                 ('obtra', p || 'fotos/g_t.webp', '{"size": 1}');
  perform teste.conferir('cota: registro que passa do limite é recusado com a mensagem do contrato',
    teste.erro(format($q$insert into fotos (obra_id, path, thumb_path) values (%L, %L, %L)$q$,
                      OQ, p || 'fotos/g.webp', p || 'fotos/g_t.webp')) = 'Limite de armazenamento da empresa atingido');
  perform teste.conferir('... e o uso não mudou', (select armazenamento_usado_bytes from empresas where id = Q) = 630000);
  -- O bucket agora tem 1130001 bytes de Q (> 1 MB), com só 630000 registrados:
  -- os órfãos contam para o Storage recusar o próximo envio.
  perform teste.conferir('cota: com órfãos no bucket passando do limite, o Storage recusa novo envio',
    teste.erro(format($q$insert into storage.objects (bucket_id, name, metadata) values ('obtra', %L, '{"size": 1}')$q$,
                      p || 'fotos/h.webp')) is not null);
  perform teste.conferir('cota: com a cota estourada, sobrescrever arquivo (upsert = UPDATE) também é barrado',
    teste.erro(format($q$update storage.objects set metadata = '{"size": 999999}' where name = %L$q$,
                      p || 'fotos/a.webp')) is not null);
  delete from storage.objects where name in (p || 'fotos/g.webp', p || 'fotos/g_t.webp');
  perform teste.conferir('cota: apagados os órfãos, o envio volta a passar',
    teste.erro(format($q$insert into storage.objects (bucket_id, name, metadata) values ('obtra', %L, '{"size": 1}')$q$,
                      p || 'fotos/h.webp')) is null);

  perform teste.conferir('cota: pela API, registro sem arquivo no bucket é recusado (bytes = 0 não fura a cota)',
    teste.erro(format($q$insert into fotos (obra_id, path, thumb_path, bytes) values (%L, %L, %L, 0)$q$,
                      OQ, p || 'fotos/nao_subiu.webp', p || 'fotos/a_t.webp')) like 'Arquivo não encontrado no Storage%');
  perform teste.conferir('cota: bytes e caminho não mudam por UPDATE',
    teste.erro(format('update fotos set bytes = 0 where obra_id = %L', OQ)) is not null
    and teste.erro(format('update documentos set path = %L where obra_id = %L', p || 'docs/x.pdf', OQ)) is not null);

  delete from documentos where obra_id = OQ;
  perform teste.conferir('cota: excluir documento devolve o espaço', (select armazenamento_usado_bytes from empresas where id = Q) = 530000);
  delete from obras where id = O2;
  perform teste.conferir('cota: excluir a obra (cascata nas fotos) devolve o espaço dela',
    (select armazenamento_usado_bytes from empresas where id = Q) = 320000);
  perform teste.sair();
  perform teste.conferir('cota: uso bate com a soma de fotos + documentos da empresa',
    (select armazenamento_usado_bytes from empresas where id = Q)
      = (select coalesce(sum(bytes), 0) from fotos where empresa_id = Q)
      + (select coalesce(sum(bytes), 0) from documentos where empresa_id = Q));

  -- limite reduzido abaixo do uso: nada novo entra, mas excluir continua podendo
  update empresas set limite_armazenamento_mb = 0 where id = Q;
  perform teste.vestir('q.admin@aud.obtra');
  perform teste.conferir('cota: limite abaixo do uso não impede excluir',
    teste.linhas(format('delete from fotos where obra_id = %L', OQ)) = 1);
  perform teste.conferir('... e o uso zera',
    (select armazenamento_usado_bytes from empresas where id = Q) = 0);

  -- master exclui a empresa inteira
  perform teste.vestir('t.master@teste.obtra');
  perform teste.conferir('master exclui a empresa com arquivos sem erro de cota',
    teste.erro(format('delete from empresas where id = %L', Q)) is null);
  perform teste.sair();
  delete from auth.users where email = 'q.admin@aud.obtra';
  delete from storage.objects where name like Q::text || '/%';
end $$;

-- ===================================================== 7. criar_relatorio ===
do $$
declare
  O   uuid := teste.a('OX2');
  r1  uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid;
begin
  perform teste.vestir('x.colab@aud.obtra');
  r1 := criar_relatorio(O, current_date - 10);
  perform teste.conferir('1º RDO: número 1, responsável = nome de quem cria, sem horário',
    (select numero = 1 and responsavel = 'X Colab' and horario_inicio is null from relatorios where id = r1));
  update relatorios set responsavel = 'Eng. Fulano', horario_inicio = '07:00', horario_fim = '17:00',
                        intervalo_inicio = '12:00', intervalo_fim = '13:00' where id = r1;
  insert into relatorio_mao_obra (relatorio_id, funcao, quantidade) values (r1, 'Pedreiro', 2);
  r2 := criar_relatorio(O, current_date - 20);   -- data ANTERIOR, criado depois
  perform teste.conferir('2º RDO: número 2 e copia do de maior data (r1)',
    (select numero = 2 and responsavel = 'Eng. Fulano' and horario_inicio = '07:00' and intervalo_fim = '13:00'
       from relatorios where id = r2)
    and (select count(*) from relatorio_mao_obra where relatorio_id = r2) = 1);
  update relatorios set responsavel = 'Outro' where id = r2;
  r3 := criar_relatorio(O, current_date - 5);
  perform teste.conferir('3º RDO copia o de maior data (r1), não o criado por último (r2)',
    (select numero = 3 and responsavel = 'Eng. Fulano' from relatorios where id = r3));
  perform teste.conferir('insert direto é aceito para a equipe',
    teste.erro(format($q$insert into relatorios (obra_id, empresa_id, numero, data) values (%L, %L, 999, current_date)$q$,
                      O, teste.a('X'))) is null);
  perform teste.conferir('... e ignora o número informado (vira o 4)',
    (select max(numero) from relatorios where obra_id = O) = 4);
  perform teste.conferir('insert direto sem responsável: nome de quem cria',
    (select responsavel from relatorios where obra_id = O and numero = 4) = 'X Colab');
  perform teste.conferir('número não muda por UPDATE',
    teste.erro(format('update relatorios set numero = 50 where id = %L', r3)) is not null);
  perform teste.conferir('data obrigatória',
    teste.erro(format('select criar_relatorio(%L, null)', O)) like '%data%');

  perform teste.vestir('x.admin@aud.obtra');
  delete from relatorios where id = r2;             -- buraco no meio fica
  r4 := criar_relatorio(O, current_date, false);
  perform teste.conferir('numeração segue do maior (buraco do excluído no meio não é reaproveitado)',
    (select numero from relatorios where id = r4) = 5);
  perform teste.conferir('sem copiar: responsável = quem cria, sem mão de obra',
    (select responsavel from relatorios where id = r4) = 'X Admin'
    and (select count(*) from relatorio_mao_obra where relatorio_id = r4) = 0);
  r5 := criar_relatorio(teste.a('OX1'), current_date);
  perform teste.conferir('numeração é por obra (OX1 segue a sua)',
    (select numero from relatorios where id = r5) = 4);
  perform teste.sair();
end $$;

-- ============================================================ 8. histórico =
do $$
declare
  X uuid := teste.a('X');
  n bigint;
  r uuid;
begin
  perform teste.vestir('x.admin@aud.obtra');
  perform teste.conferir('ninguém grava histórico pela API (insert/update/delete)',
    teste.erro(format($q$insert into historico (empresa_id, acao, entidade) values (%L, 'aprovou', 'relatorio')$q$, X)) like '%permission denied%'
    and teste.erro('update historico set descricao = descricao') like '%permission denied%'
    and teste.erro('delete from historico') like '%permission denied%'
    and teste.erro('truncate historico') like '%permission denied%');

  select count(*) into n from historico where empresa_id = X;
  r := criar_relatorio(teste.a('OX1'), current_date);
  update relatorios set observacoes = 'só conteúdo' where id = r;
  perform mudar_status_relatorio(r, 'revisar');
  perform mudar_status_relatorio(r, 'preenchendo');
  perform mudar_status_relatorio(r, 'aprovado');
  perform mudar_status_relatorio(r, 'preenchendo');
  delete from relatorios where id = r;
  perform teste.conferir('histórico do RDO: criou, enviou, devolveu, aprovou, reabriu, excluiu (edição de conteúdo não entra)',
    (select array_agg(acao order by id) from historico where entidade_id = r)
      = array['criou', 'enviou_aprovacao', 'devolveu', 'aprovou', 'reabriu', 'excluiu']);
  perform teste.conferir('histórico grava quem fez (id e nome) e a obra',
    not exists (select 1 from historico where entidade_id = r
                  and (usuario_id is distinct from teste.id('x.admin@aud.obtra')
                       or usuario_nome <> 'X Admin' or obra_id is distinct from teste.a('OX1'))));
  perform teste.conferir('histórico: descrição pronta para exibir',
    (select descricao from historico where entidade_id = r and acao = 'enviou_aprovacao') like 'RD-% · X Um enviado para aprovação');

  perform teste.vestir('x.colab@aud.obtra');
  insert into storage.objects (bucket_id, name, metadata) values
    ('obtra', teste.pasta('X', 'OX2') || 'docs/h.pdf', '{"size": 10}');
  insert into documentos (obra_id, nome, path) values (teste.a('OX2'), 'H.pdf', teste.pasta('X', 'OX2') || 'docs/h.pdf');
  delete from documentos where path = teste.pasta('X', 'OX2') || 'docs/h.pdf';
  insert into materiais (nome) values ('Areia');
  perform teste.conferir('histórico: documento enviado/excluído e cadastro criado',
    exists (select 1 from historico where empresa_id = X and acao = 'enviou_documento' and descricao like '%H.pdf%')
    and exists (select 1 from historico where empresa_id = X and entidade = 'documento' and acao = 'excluiu')
    and exists (select 1 from historico where empresa_id = X and entidade = 'cadastro' and descricao like '%Areia%'));
  perform teste.conferir('colaborador lê o histórico só da própria empresa',
    teste.conta('select count(*) from historico') = teste.conta(format('select count(*) from historico where empresa_id = %L', X)));
  perform teste.vestir('y.admin@aud.obtra');
  perform teste.conferir('admin Y não lê histórico de X', teste.conta(format('select count(*) from historico where empresa_id = %L', X)) = 0);
  perform teste.sair();
end $$;

-- ================================================================ 9. contas
do $$
declare
  v  uuid;
  u  auth.users%rowtype;
  i  auth.identities%rowtype;
begin
  perform teste.vestir('x.admin@aud.obtra');
  perform teste.conferir('e-mail duplicado com caixa e espaços diferentes é recusado',
    teste.erro(format($q$select admin_criar_usuario('  X.COLAB@Aud.Obtra ', 'segredo1', 'Dup', 'colaborador', %L)$q$,
                      teste.a('X'))) = 'E-mail já cadastrado');
  perform teste.conferir('senha de 5 caracteres é recusada; nome em branco é recusado',
    teste.erro(format($q$select admin_criar_usuario('n6@aud.obtra', '12345', 'N', 'colaborador', %L)$q$, teste.a('X')))
      = 'A senha deve ter pelo menos 6 caracteres'
    and teste.erro(format($q$select admin_criar_usuario('n6@aud.obtra', '123456', '   ', 'colaborador', %L)$q$, teste.a('X')))
      = 'Informe o nome');
  perform teste.conferir('papel inválido e empresa ausente são recusados',
    teste.erro(format($q$select admin_criar_usuario('n6@aud.obtra', '123456', 'N', 'dono', %L)$q$, teste.a('X'))) is not null
    and teste.erro($q$select admin_criar_usuario('n6@aud.obtra', '123456', 'N', 'colaborador', null)$q$) is not null);
  perform teste.conferir('redefinir senha curta é recusado',
    teste.erro(format($q$select admin_redefinir_senha(%L, '123')$q$, teste.id('x.colab@aud.obtra')))
      = 'A senha deve ter pelo menos 6 caracteres');

  v := admin_criar_usuario(' Novo.Colab@Aud.Obtra ', 'segredo9', ' Novo Colab ', 'colaborador', teste.a('X'),
                           '{}', ' 11 99999-0000 ', '  ');
  perform teste.sair();
  select * into u from auth.users where id = v;
  select * into i from auth.identities where user_id = v;
  perform teste.conferir('auth.users no formato do GoTrue (e-mail minúsculo, confirmado, aud/role, instance_id zero)',
    u.email = 'novo.colab@aud.obtra' and u.email_confirmed_at is not null and u.confirmed_at is not null
    and u.aud = 'authenticated' and u.role = 'authenticated'
    and u.instance_id = '00000000-0000-0000-0000-000000000000'
    and u.created_at is not null and u.updated_at is not null);
  perform teste.conferir('auth.users: nenhuma coluna de token/troca NULL (GoTrue quebra no login)',
    u.confirmation_token = '' and u.recovery_token = '' and u.email_change_token_new = ''
    and u.email_change = '' and u.email_change_token_current = '' and u.reauthentication_token = ''
    and u.phone_change = '' and u.phone_change_token = '' and u.phone is null
    and u.email_change_confirm_status = 0 and not u.is_sso_user and not u.is_anonymous
    and u.deleted_at is null and u.banned_until is null);
  perform teste.conferir('auth.users: senha bcrypt ($2a$/$2b$, custo 10) que confere',
    u.encrypted_password ~ '^\$2[ab]\$10\$' and u.encrypted_password = extensions.crypt('segredo9', u.encrypted_password));
  perform teste.conferir('auth.users: app_metadata {provider: email, providers: [email]}',
    u.raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb);
  perform teste.conferir('auth.identities: provider email, provider_id = id do usuário, identity_data com sub/email',
    i.provider = 'email' and i.provider_id = v::text and i.identity_data ->> 'sub' = v::text
    and i.identity_data ->> 'email' = 'novo.colab@aud.obtra' and i.email = 'novo.colab@aud.obtra'
    and (i.identity_data ->> 'email_verified')::boolean and i.created_at is not null and i.updated_at is not null);
  perform teste.conferir('perfil: nome/telefone aparados, cargo vazio vira null, papel e empresa certos',
    (select nome = 'Novo Colab' and telefone = '11 99999-0000' and cargo is null and papel = 'colaborador'
            and empresa_id = teste.a('X') and email = 'novo.colab@aud.obtra' and ativo
       from perfis where id = v));

  -- excluir: histórico do usuário fica; os vínculos viram null
  perform teste.vestir('novo.colab@aud.obtra');
  perform criar_relatorio(teste.a('OX2'), current_date);
  perform teste.vestir('x.admin@aud.obtra');
  perform admin_excluir_usuario(v);
  perform teste.sair();
  perform teste.conferir('excluir usuário: conta, identidade e perfil somem; RDO fica sem autor',
    not exists (select 1 from auth.users where id = v) and not exists (select 1 from auth.identities where user_id = v)
    and not exists (select 1 from perfis where id = v)
    and not exists (select 1 from relatorios where criado_por = v)
    and exists (select 1 from historico where entidade_id = v and acao = 'excluiu'));

  perform teste.conferir('SQL Editor: excluir usuário inexistente avisa',
    teste.erro(format('select admin_excluir_usuario(%L)', gen_random_uuid())) = 'Usuário não encontrado'
    and teste.erro(format($q$select admin_redefinir_senha(%L, 'abcdef')$q$, gen_random_uuid())) = 'Usuário não encontrado');
end $$;

-- ================================================ invariante final (global) =
do $$
begin
  perform teste.sair();
  perform teste.conferir('toda empresa: armazenamento_usado_bytes = soma de fotos + documentos',
    not exists (
      select 1 from empresas e
       where e.armazenamento_usado_bytes
             <> (select coalesce(sum(bytes), 0) from fotos f where f.empresa_id = e.id)
              + (select coalesce(sum(bytes), 0) from documentos d where d.empresa_id = e.id)));
  perform teste.conferir('todo relatório: empresa_id = empresa da obra; números únicos e positivos',
    not exists (select 1 from relatorios r join obras o on o.id = r.obra_id where r.empresa_id <> o.empresa_id or r.numero < 1));
  perform teste.conferir('toda foto/documento: empresa_id = empresa da obra',
    not exists (select 1 from fotos f join obras o on o.id = f.obra_id where f.empresa_id <> o.empresa_id)
    and not exists (select 1 from documentos d join obras o on o.id = d.obra_id where d.empresa_id <> o.empresa_id));
  perform teste.conferir('todo vínculo obra_clientes: cliente da mesma empresa da obra',
    not exists (select 1 from obra_clientes oc join obras o on o.id = oc.obra_id join perfis p on p.id = oc.cliente_id
                 where p.empresa_id is distinct from o.empresa_id or p.papel <> 'cliente'));
  perform teste.conferir('todo aprovado tem aprovado_em; nenhum não aprovado tem aprovado_por/em',
    not exists (select 1 from relatorios where status = 'aprovado' and aprovado_em is null)
    and not exists (select 1 from relatorios where status <> 'aprovado' and (aprovado_em is not null or aprovado_por is not null)));
end $$;
