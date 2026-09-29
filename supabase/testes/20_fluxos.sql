-- ============================================================================
-- Obtra — fluxos: RDO do começo ao fim, cota de armazenamento, contas.
-- ----------------------------------------------------------------------------
-- Roda depois do 10_rls.sql e reaproveita o cenário e as funções `teste.*`
-- de lá (empresa A/B, obras O1/O2/O3, usuários t.*@teste.obtra).
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ------------------------------------------------ RDO: criar e numerar -----
do $$
declare
  O1  uuid := 'a0000000-0000-4000-8000-0000000000a1';
  v1  uuid;
  v2  uuid;
  n   int;
begin
  perform teste.vestir('t.colab.a@teste.obtra');
  -- O último relatório (por data) de O1 é o R1 (ontem), com Pedreiro + Carpinteiro.
  insert into relatorio_equipamentos (relatorio_id, nome, quantidade)
  values ('a0000000-0000-4000-8000-000000000e01', 'Betoneira 400L', 1);

  v1 := criar_relatorio(O1, current_date);
  perform teste.conferir('criar_relatorio numera em sequência (3º da obra)',
    (select numero from relatorios where id = v1) = 3);
  perform teste.conferir('criar_relatorio grava quem criou e começa em preenchimento',
    (select criado_por = auth.uid() and status = 'preenchendo' from relatorios where id = v1));
  perform teste.conferir('copiou a mão de obra do último relatório',
    (select array_agg(funcao order by funcao) from relatorio_mao_obra where relatorio_id = v1)
      = array['Carpinteiro', 'Pedreiro']);
  perform teste.conferir('copiou os equipamentos do último relatório',
    (select count(*) from relatorio_equipamentos where relatorio_id = v1) = 1);
  perform teste.conferir('não copiou atividades (são do dia)',
    (select count(*) from relatorio_atividades where relatorio_id = v1) = 0);

  v2 := criar_relatorio(O1, current_date, false);
  perform teste.conferir('sem copiar: relatório nasce vazio e com o número seguinte',
    (select numero from relatorios where id = v2) = 4
    and (select count(*) from relatorio_mao_obra where relatorio_id = v2) = 0);

  perform teste.conferir('criar_relatorio exige data',
    teste.erro(format('select criar_relatorio(%L, null)', O1)) like '%data%');

  -- preenche o RDO como no app
  update relatorios
     set clima_manha = 'claro', clima_tarde = 'chuvoso', condicao_manha = 'praticavel',
         condicao_tarde = 'impraticavel', pluviometria_mm = 12.5,
         horario_inicio = '07:00', horario_fim = '17:00'
   where id = v1;
  insert into relatorio_atividades (relatorio_id, descricao, status, progresso)
  values (v1, 'Concretagem da laje do 2º pavimento', 'em_andamento', 40);
  insert into relatorio_ocorrencias (relatorio_id, descricao, tipo)
  values (v1, 'Chuva forte à tarde interrompeu a concretagem', 'clima');
  insert into relatorio_materiais (relatorio_id, descricao, quantidade, unidade, tipo)
  values (v1, 'Concreto usinado fck 30', 12, 'm³', 'recebido');
  perform teste.conferir('check de clima barra valor fora da lista',
    teste.erro(format($q$update relatorios set clima_noite = 'nevando' where id = %L$q$, v1)) is not null);
  perform teste.conferir('check de progresso barra progresso acima de 100',
    teste.erro(format($q$insert into relatorio_atividades (relatorio_id, descricao, progresso)
                          values (%L, 'x', 150)$q$, v1)) is not null);

  perform mudar_status_relatorio(v1, 'revisar');
  perform teste.conferir('colaborador envia para revisão',
    (select status from relatorios where id = v1) = 'revisar');

  -- guarda o id para os próximos blocos
  perform set_config('teste.rdo', v1::text, false);
  perform set_config('teste.rdo_vazio', v2::text, false);
end $$;

-- cliente ainda não vê
do $$
begin
  perform teste.vestir('t.cliente.a@teste.obtra');
  perform teste.conferir('cliente não vê o RDO em revisão',
    teste.conta(format('select count(*) from relatorios where id = %L', current_setting('teste.rdo'))) = 0);
  perform teste.conferir('cliente não vê as ocorrências do RDO em revisão',
    teste.conta(format('select count(*) from relatorio_ocorrencias where relatorio_id = %L',
                       current_setting('teste.rdo'))) = 0);
end $$;

-- admin aprova
do $$
declare v uuid := current_setting('teste.rdo')::uuid;
begin
  perform teste.vestir('t.admin.a@teste.obtra');
  perform mudar_status_relatorio(v, 'aprovado');
  perform teste.conferir('admin aprova: grava aprovado_por e aprovado_em',
    (select status = 'aprovado' and aprovado_por = auth.uid() and aprovado_em is not null
       from relatorios where id = v));
end $$;

do $$
declare v uuid := current_setting('teste.rdo')::uuid;
begin
  perform teste.vestir('t.cliente.a@teste.obtra');
  perform teste.conferir('cliente passa a ver o RDO aprovado e seus itens',
    teste.conta(format('select count(*) from relatorios where id = %L', v)) = 1
    and teste.conta(format('select count(*) from relatorio_ocorrencias where relatorio_id = %L', v)) = 1);
  insert into relatorio_comentarios (relatorio_id, texto) values (v, 'Quando retomam a laje?');

  perform teste.vestir('t.colab.a@teste.obtra');
  insert into relatorio_comentarios (relatorio_id, texto) values (v, 'Amanhã cedo, se não chover.');
  perform teste.conferir('colaborador não edita RDO aprovado (0 linhas)',
    teste.linhas(format($q$update relatorios set observacoes = 'x' where id = %L$q$, v)) = 0);
  perform teste.conferir('colaborador não apaga item de RDO aprovado (0 linhas)',
    teste.linhas(format('delete from relatorio_ocorrencias where relatorio_id = %L', v)) = 0);
  perform teste.conferir('colaborador não apaga comentário do cliente (0 linhas)',
    teste.linhas(format($q$delete from relatorio_comentarios where relatorio_id = %L
                           and autor_id <> auth.uid()$q$, v)) = 0);

  perform teste.vestir('t.cliente.a@teste.obtra');
  perform teste.conferir('cliente vê os dois comentários',
    teste.conta(format('select count(*) from relatorio_comentarios where relatorio_id = %L', v)) = 2);
  perform teste.conferir('cliente não edita comentário da equipe (0 linhas)',
    teste.linhas(format($q$update relatorio_comentarios set texto = 'x'
                           where relatorio_id = %L and autor_id <> auth.uid()$q$, v)) = 0);
  perform teste.conferir('cliente apaga o próprio comentário',
    teste.linhas(format($q$delete from relatorio_comentarios
                           where relatorio_id = %L and autor_id = auth.uid()$q$, v)) = 1);

  perform teste.vestir('t.admin.a@teste.obtra');
  perform teste.conferir('admin apaga comentário de outra pessoa',
    teste.linhas(format('delete from relatorio_comentarios where relatorio_id = %L', v)) = 1);
  perform mudar_status_relatorio(v, 'revisar');
  perform teste.conferir('admin reabre: aprovação some',
    (select status = 'revisar' and aprovado_por is null and aprovado_em is null
       from relatorios where id = v));

  perform teste.conferir('admin exclui relatório',
    teste.linhas(format('delete from relatorios where id = %L', current_setting('teste.rdo_vazio'))) = 1);
end $$;

-- ------------------------------------------------- cota de armazenamento ---
do $$
declare
  A     uuid := 'a0000000-0000-4000-8000-00000000000a';
  O2    uuid := 'a0000000-0000-4000-8000-0000000000a2';
  pasta text := 'a0000000-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000a2/';
  antes bigint;
  e     text;
begin
  update empresas set limite_armazenamento_mb = 1 where id = A;       -- 1 MB
  select armazenamento_usado_bytes into antes from empresas where id = A;
  insert into storage.objects (bucket_id, name, metadata) values
    ('obtra', pasta || 'fotos/grande.webp',   '{"size": 900000}'),
    ('obtra', pasta || 'fotos/grande_t.webp', '{"size": 30000}'),
    ('obtra', pasta || 'fotos/outra.webp',    '{"size": 200000}'),
    ('obtra', pasta || 'fotos/outra_t.webp',  '{"size": 20000}');

  perform teste.vestir('t.colab.a@teste.obtra');
  -- declara 1 byte, mas o Storage sabe o tamanho real
  insert into fotos (obra_id, empresa_id, path, thumb_path, bytes, legenda)
  values (O2, A, pasta || 'fotos/grande.webp', pasta || 'fotos/grande_t.webp', 1, 'Fachada');
  perform teste.conferir('bytes da foto vêm do Storage, não do que o navegador declarou',
    (select bytes from fotos where path = pasta || 'fotos/grande.webp') = 930000);
  perform teste.conferir('uso da empresa somou a foto',
    (select armazenamento_usado_bytes from empresas where id = A) = antes + 930000);

  e := teste.erro(format($q$insert into fotos (obra_id, empresa_id, path, thumb_path)
                            values (%L, %L, %L, %L)$q$, O2, A, pasta || 'fotos/outra.webp', pasta || 'fotos/outra_t.webp'));
  perform teste.conferir('foto que estoura o limite é recusada com a mensagem do contrato',
    e = 'Limite de armazenamento da empresa atingido');
  perform teste.conferir('... e o uso não mudou',
    (select armazenamento_usado_bytes from empresas where id = A) = antes + 930000);
  delete from fotos where path = pasta || 'fotos/grande.webp';
  perform teste.conferir('excluir a foto devolve o espaço',
    (select armazenamento_usado_bytes from empresas where id = A) = antes);

  -- documento também conta
  insert into documentos (obra_id, empresa_id, nome, path, bytes, mime)
  values (O2, A, 'Memorial.pdf', pasta || 'docs/memorial.pdf', 50000, 'application/pdf');
  perform teste.conferir('documento sem objeto no Storage usa os bytes informados',
    (select armazenamento_usado_bytes from empresas where id = A) = antes + 50000);
  delete from documentos where path = pasta || 'docs/memorial.pdf';
  perform teste.conferir('excluir documento devolve o espaço',
    (select armazenamento_usado_bytes from empresas where id = A) = antes);
  perform teste.vestir('t.admin.a@teste.obtra');
  perform teste.conferir('foto ligada a relatório de outra obra é recusada',
    teste.erro(format($q$insert into fotos (obra_id, empresa_id, relatorio_id, path, thumb_path)
                        values (%L, %L, 'a0000000-0000-4000-8000-000000000e01', %L, %L)$q$,
                      O2, A, pasta || 'fotos/outra.webp', pasta || 'fotos/outra_t.webp'))
      like '%não é desta obra%');
end $$;

-- cota: com o uso no limite, o Storage recusa o envio
do $$
declare
  A     uuid := 'a0000000-0000-4000-8000-00000000000a';
  pasta text := 'a0000000-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000a2/';
begin
  update empresas set limite_armazenamento_mb = 0 where id = A;
  perform teste.vestir('t.colab.a@teste.obtra');
  perform teste.conferir('empresa sem espaço não sobe arquivo no Storage',
    teste.erro(format($q$insert into storage.objects (bucket_id, name) values ('obtra', %L)$q$,
                      pasta || 'fotos/bloqueada.webp')) is not null);
  perform teste.sair();
  update empresas set limite_armazenamento_mb = 100 where id = A;
end $$;

-- --------------------------------------------------- contas de usuário -----
do $$
declare
  A  uuid := 'a0000000-0000-4000-8000-00000000000a';
  O1 uuid := 'a0000000-0000-4000-8000-0000000000a1';
  O2 uuid := 'a0000000-0000-4000-8000-0000000000a2';
  v  uuid;
  u  auth.users%rowtype;
begin
  perform teste.vestir('t.admin.a@teste.obtra');
  v := admin_criar_usuario('  Novo.Cliente@Teste.Obtra ', 'senha123', 'Novo Cliente', 'cliente', A, array[O1, O2]);
  perform teste.conferir('e-mail duplicado (sem diferenciar maiúsculas) é recusado',
    teste.erro(format($q$select admin_criar_usuario('novo.cliente@teste.obtra','senha123','X','cliente',%L)$q$, A))
      = 'E-mail já cadastrado');
  perform teste.conferir('senha curta é recusada',
    teste.erro(format($q$select admin_criar_usuario('curta@teste.obtra','12345','X','cliente',%L)$q$, A))
      like '%6 caracteres%');
  perform teste.conferir('e-mail inválido é recusado',
    teste.erro(format($q$select admin_criar_usuario('sem-arroba','123456','X','cliente',%L)$q$, A))
      like '%E-mail inválido%');
  perform teste.conferir('colaborador não recebe obras de cliente',
    teste.erro(format($q$select admin_criar_usuario('c2@teste.obtra','123456','X','colaborador',%L,%L::uuid[])$q$,
                      A, array[O1])) is not null);
  perform teste.sair();

  select * into u from auth.users where id = v;
  perform teste.conferir('auth.users: e-mail normalizado, confirmado, aud/role authenticated',
    u.email = 'novo.cliente@teste.obtra' and u.email_confirmed_at is not null
    and u.aud = 'authenticated' and u.role = 'authenticated'
    and u.instance_id = '00000000-0000-0000-0000-000000000000');
  perform teste.conferir('auth.users: colunas de token são texto vazio, nunca NULL (GoTrue)',
    u.confirmation_token = '' and u.recovery_token = '' and u.email_change_token_new = ''
    and u.email_change = '' and u.email_change_token_current = '' and u.reauthentication_token = ''
    and u.phone_change = '' and u.phone_change_token = '');
  perform teste.conferir('auth.users: senha em bcrypt que confere',
    u.encrypted_password like '$2%' and u.encrypted_password = extensions.crypt('senha123', u.encrypted_password));
  perform teste.conferir('auth.users: app_metadata de provedor e-mail',
    u.raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb);
  perform teste.conferir('auth.identities: provedor e-mail, provider_id = id, e-mail gerado',
    (select provider = 'email' and provider_id = v::text and email = 'novo.cliente@teste.obtra'
            and (identity_data ->> 'email_verified')::boolean
       from auth.identities where user_id = v));
  perform teste.conferir('cliente criado já vinculado às 2 obras',
    (select count(*) from obra_clientes where cliente_id = v) = 2);

  perform teste.vestir('t.admin.a@teste.obtra');
  perform definir_obras_cliente(v, array[O2]);
  perform teste.conferir('definir_obras_cliente substitui os vínculos',
    (select array_agg(obra_id) from obra_clientes where cliente_id = v) = array[O2]);
  perform teste.conferir('definir_obras_cliente recusa obra de outra empresa',
    teste.erro(format($q$select definir_obras_cliente(%L, array['b0000000-0000-4000-8000-0000000000b1']::uuid[])$q$, v))
      is not null);
  perform teste.conferir('definir_obras_cliente só para papel cliente',
    teste.erro(format('select definir_obras_cliente(%L, %L::uuid[])', teste.id('t.colab.a@teste.obtra'), array[O1]))
      is not null);

  perform admin_redefinir_senha(v, 'trocada1');
  perform teste.sair();
  perform teste.conferir('admin_redefinir_senha grava a nova senha em bcrypt',
    (select encrypted_password = extensions.crypt('trocada1', encrypted_password) from auth.users where id = v));

  -- excluir conta que tem histórico: as referências viram NULL, nada quebra
  perform teste.vestir('t.admin.a@teste.obtra');
  v := admin_criar_usuario('temporario@teste.obtra', 'senha123', 'Temporário', 'colaborador', A);
  perform set_config('teste.temp', v::text, false);
end $$;

do $$
declare
  v   uuid := current_setting('teste.temp')::uuid;
  rel uuid;
begin
  perform teste.vestir('temporario@teste.obtra');
  rel := criar_relatorio('a0000000-0000-4000-8000-0000000000a1', current_date);
  insert into relatorio_comentarios (relatorio_id, texto) values (rel, 'Primeiro dia');
  perform teste.vestir('t.admin.a@teste.obtra');
  perform mudar_status_relatorio(rel, 'aprovado');
  perform admin_excluir_usuario(v);
  perform teste.sair();
  perform teste.conferir('admin_excluir_usuario apaga conta, identidade e perfil',
    not exists (select 1 from auth.users where id = v)
    and not exists (select 1 from auth.identities where user_id = v)
    and not exists (select 1 from perfis where id = v));
  perform teste.conferir('o relatório fica, sem autor (on delete set null) e ainda aprovado',
    (select criado_por is null and status = 'aprovado' and aprovado_por is not null
       from relatorios where id = rel));
  perform teste.conferir('o comentário fica, sem autor',
    (select autor_id is null from relatorio_comentarios where relatorio_id = rel));
end $$;

-- ---------------------------------------------------------- painel ---------
do $$
declare j jsonb;
begin
  perform teste.vestir('t.admin.b@teste.obtra');
  j := painel_resumo();
  perform teste.conferir('painel do admin B conta só B (1 obra, 1 relatório, 0 fotos)',
    (j ->> 'obras_total')::int = 1 and (j ->> 'relatorios_total')::int = 1
    and (j ->> 'fotos_total')::int = 0 and (j ->> 'obras_andamento')::int = 1);
  perform teste.conferir('painel traz as chaves do contrato',
    j ?& array['obras_total', 'obras_andamento', 'relatorios_total', 'relatorios_mes', 'fotos_total',
               'armazenamento_usado_bytes', 'armazenamento_limite_bytes', 'empresas_total']);
end $$;

-- ------------------------------------------------ excluir empresa inteira ---
do $$
declare
  E uuid;
  O uuid;
  R uuid;
begin
  perform teste.vestir('t.master@teste.obtra');
  insert into empresas (nome) values ('Descartável') returning id into E;
  insert into obras (empresa_id, nome) values (E, 'Obra descartável') returning id into O;
  perform admin_criar_usuario('adm.desc@teste.obtra', 'senha123', 'Adm', 'admin', E);
  perform teste.vestir('adm.desc@teste.obtra');
  R := criar_relatorio(O, current_date);
  insert into relatorio_mao_obra (relatorio_id, funcao) values (R, 'Mestre de obras');
  insert into fotos (obra_id, empresa_id, relatorio_id, path, thumb_path, bytes)
  values (O, E, R, E || '/' || O || '/fotos/a.webp', E || '/' || O || '/fotos/a_t.webp', 1234);
  perform teste.vestir('t.master@teste.obtra');
  perform teste.conferir('master exclui a empresa com obras, relatórios, fotos e equipe',
    teste.erro(format('delete from empresas where id = %L', E)) is null);
  perform teste.sair();
  perform teste.conferir('... e tudo dela vai junto (o perfil também)',
    not exists (select 1 from obras where empresa_id = E)
    and not exists (select 1 from relatorios where empresa_id = E)
    and not exists (select 1 from perfis where email = 'adm.desc@teste.obtra'));
  delete from auth.users where email = 'adm.desc@teste.obtra';
end $$;
