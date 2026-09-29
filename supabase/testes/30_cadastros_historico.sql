-- ============================================================================
-- Obtra — Adendo 1: cadastros da empresa, itens do RDO ligados a eles, notas
-- de compras, responsável/horários no criar_relatorio, histórico e painel.
-- Reaproveita o cenário e as funções `teste.*` do 10_rls.sql.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- --------------------------------------------------------- cadastros -------
do $$
declare
  A  uuid := 'a0000000-0000-4000-8000-00000000000a';
  B  uuid := 'b0000000-0000-4000-8000-00000000000b';
  f_ped uuid; f_ele uuid; c1 uuid; c2 uuid; m1 uuid; e1 uuid;
begin
  perform teste.vestir('t.colab.a@teste.obtra');
  insert into funcoes (nome) values ('Pedreiro') returning id into f_ped;
  insert into funcoes (nome) values ('Eletricista') returning id into f_ele;
  perform teste.conferir('cadastro sem empresa_id recebe a empresa de quem insere',
    (select empresa_id from funcoes where id = f_ped) = A);
  perform teste.conferir('nome de função repetido na mesma empresa é recusado',
    teste.erro($q$insert into funcoes (nome) values ('Pedreiro')$q$) is not null);
  perform teste.conferir('colaborador não cadastra função em outra empresa',
    teste.erro(format($q$insert into funcoes (empresa_id, nome) values (%L, 'Invasor')$q$, B)) is not null);
  insert into colaboradores (nome, funcao_id, tipo, empresa_terceira)
  values ('José da Silva', f_ped, 'propria', null) returning id into c1;
  insert into colaboradores (nome, funcao_id, tipo, empresa_terceira)
  values ('Marcos Voltz', f_ele, 'terceirizada', 'Elétrica Voltz') returning id into c2;
  insert into materiais (nome, unidade) values ('Cimento CP-II 50 kg', 'sc') returning id into m1;
  insert into equipamentos (nome, identificacao) values ('Betoneira 400 L', 'BT-02') returning id into e1;
  perform teste.conferir('colaborador edita cadastro',
    teste.linhas(format($q$update colaboradores set telefone = '11 91234-5678' where id = %L$q$, c1)) = 1);
  perform teste.conferir('colaborador não exclui cadastro (0 linhas)',
    teste.linhas(format('delete from equipamentos where id = %L', e1)) = 0);
  perform teste.conferir('cadastro não muda de empresa',
    teste.erro(format('update materiais set empresa_id = %L where id = %L', B, m1)) is not null);
  perform set_config('teste.c1', c1::text, false);
  perform set_config('teste.c2', c2::text, false);
  perform set_config('teste.m1', m1::text, false);
  perform set_config('teste.e1', e1::text, false);
  perform set_config('teste.f_ped', f_ped::text, false);

  perform teste.vestir('t.colab.b@teste.obtra');
  perform teste.conferir('equipe de B não vê cadastros de A',
    teste.conta('select count(*) from funcoes where empresa_id = ''a0000000-0000-4000-8000-00000000000a''') = 0
    and teste.conta('select count(*) from colaboradores where empresa_id = ''a0000000-0000-4000-8000-00000000000a''') = 0);
  perform teste.conferir('a mesma função pode existir em outra empresa',
    teste.erro($q$insert into funcoes (nome) values ('Pedreiro')$q$) is null);
  perform teste.conferir('colaborador de B não usa função de A',
    teste.erro(format($q$insert into colaboradores (nome, funcao_id) values ('X', %L)$q$, f_ped)) is not null);

  perform teste.vestir('t.cliente.a@teste.obtra');
  perform teste.conferir('cliente não vê cadastros',
    teste.conta('select count(*) from funcoes') = 0 and teste.conta('select count(*) from colaboradores') = 0
    and teste.conta('select count(*) from materiais') = 0 and teste.conta('select count(*) from equipamentos') = 0);
  perform teste.conferir('cliente não cadastra',
    teste.erro($q$insert into funcoes (nome) values ('Cliente')$q$) is not null);

  perform teste.vestir('t.master@teste.obtra');
  perform teste.conferir('master precisa informar a empresa do cadastro',
    teste.erro($q$insert into funcoes (nome) values ('Sem empresa')$q$) like '%Informe a empresa%');
end $$;

-- ------------------------------------------------ RDO ligado ao cadastro ----
do $$
declare
  O2  uuid := 'a0000000-0000-4000-8000-0000000000a2';
  r   uuid;
  r2  uuid;
  j   jsonb;
begin
  perform teste.vestir('t.colab.a@teste.obtra');
  -- O2 ainda não tem relatório: responsável = nome de quem cria.
  r := criar_relatorio(O2, current_date - 1);
  perform teste.conferir('1º RDO da obra: responsável = nome do perfil de quem cria',
    (select responsavel from relatorios where id = r) = (select nome from perfis where id = auth.uid()));

  update relatorios set responsavel = 'Eng. Fulano', horario_inicio = '07:00', horario_fim = '17:00',
                        intervalo_inicio = '12:00', intervalo_fim = '13:00'
   where id = r;
  insert into relatorio_mao_obra (relatorio_id, colaborador_id, funcao, quantidade)
  values (r, current_setting('teste.c1')::uuid, null, 1),
         (r, current_setting('teste.c2')::uuid, '', 1);
  perform teste.conferir('mão de obra do cadastro: função e nome preenchidos do cadastro',
    (select funcao = 'Pedreiro' and colaborador_nome = 'José da Silva' and tipo = 'propria'
       from relatorio_mao_obra where relatorio_id = r and colaborador_id = current_setting('teste.c1')::uuid));
  perform teste.conferir('colaborador terceirizado leva tipo e empresa terceira',
    (select funcao = 'Eletricista' and tipo = 'terceirizada' and empresa_terceira = 'Elétrica Voltz'
       from relatorio_mao_obra where relatorio_id = r and colaborador_id = current_setting('teste.c2')::uuid));
  insert into relatorio_equipamentos (relatorio_id, equipamento_id, nome, quantidade)
  values (r, current_setting('teste.e1')::uuid, '', 2);
  perform teste.conferir('equipamento do cadastro: nome preenchido',
    (select nome from relatorio_equipamentos where relatorio_id = r) = 'Betoneira 400 L');
  insert into relatorio_materiais (relatorio_id, material_id, descricao, quantidade, tipo)
  values (r, current_setting('teste.m1')::uuid, '', 35.5, 'recebido');
  perform teste.conferir('material do cadastro: descrição e unidade preenchidas, quantidade numérica',
    (select descricao = 'Cimento CP-II 50 kg' and unidade = 'sc' and quantidade = 35.50
       from relatorio_materiais where relatorio_id = r));
  insert into relatorio_notas_compras (relatorio_id, fornecedor, numero_nota, valor, descricao)
  values (r, 'Depósito São Jorge', 'NF 12345', 1789.90, 'Cimento e areia');
  perform teste.conferir('nota de compra registrada', (select count(*) from relatorio_notas_compras where relatorio_id = r) = 1);

  perform teste.vestir('t.colab.b@teste.obtra');
  perform teste.conferir('equipe de B não vê notas de compras de A',
    teste.conta(format('select count(*) from relatorio_notas_compras where relatorio_id = %L', r)) = 0);
  perform teste.conferir('equipe de B não liga item de A ao próprio cadastro',
    teste.erro(format($q$insert into relatorio_mao_obra (relatorio_id, funcao) values (%L, 'x')$q$, r)) is not null);

  -- colaborador de B não entra em RDO de A, nem pelo postgres (gatilho)
  perform teste.sair();
  perform teste.conferir('item de RDO não aponta para colaborador de outra empresa',
    teste.erro(format($q$insert into relatorio_mao_obra (relatorio_id, colaborador_id, funcao)
                        select 'b0000000-0000-4000-8000-000000000e03', %L, 'x'$q$, current_setting('teste.c1')))
      like '%outra empresa%');

  perform teste.vestir('t.colab.a@teste.obtra');
  perform mudar_status_relatorio(r, 'revisar');
  perform teste.vestir('t.admin.a@teste.obtra');
  j := painel_resumo();
  perform teste.conferir('painel_resumo traz relatorios_pendentes (revisar)',
    (j ->> 'relatorios_pendentes')::int = (select count(*) from relatorios where status = 'revisar'
                                            and empresa_id = 'a0000000-0000-4000-8000-00000000000a')
    and (j ->> 'relatorios_pendentes')::int >= 1);
  perform mudar_status_relatorio(r, 'aprovado');

  perform teste.vestir('t.colab.a@teste.obtra');
  perform teste.conferir('colaborador não mexe em nota de compra de RDO aprovado',
    teste.erro(format($q$insert into relatorio_notas_compras (relatorio_id, fornecedor) values (%L, 'x')$q$, r))
      is not null
    and teste.linhas(format('delete from relatorio_notas_compras where relatorio_id = %L', r)) = 0);

  r2 := criar_relatorio(O2, current_date);
  perform teste.conferir('criar_relatorio copia responsável e horários (com intervalo) do anterior',
    (select responsavel = 'Eng. Fulano' and horario_inicio = '07:00' and horario_fim = '17:00'
            and intervalo_inicio = '12:00' and intervalo_fim = '13:00'
       from relatorios where id = r2));
  perform teste.conferir('... e a mão de obra com o vínculo ao cadastro',
    (select count(*) from relatorio_mao_obra where relatorio_id = r2 and colaborador_id is not null) = 2
    and (select count(*) from relatorio_equipamentos where relatorio_id = r2 and equipamento_id is not null) = 1);
  perform teste.conferir('... mas não as notas nem os materiais',
    (select count(*) from relatorio_notas_compras where relatorio_id = r2) = 0
    and (select count(*) from relatorio_materiais where relatorio_id = r2) = 0);
  r2 := criar_relatorio(O2, current_date, false);
  perform teste.conferir('sem copiar: horários vazios, responsável = quem cria',
    (select horario_inicio is null and responsavel = (select nome from perfis where id = auth.uid())
       from relatorios where id = r2));

  perform teste.vestir('t.cliente.a@teste.obtra');
  perform teste.conferir('cliente (sem vínculo com O2) não vê as notas',
    teste.conta(format('select count(*) from relatorio_notas_compras where relatorio_id = %L', r)) = 0);

  perform teste.vestir('t.admin.a@teste.obtra');
  perform teste.conferir('admin exclui cadastro usado em RDO',
    teste.linhas(format('delete from colaboradores where id = %L', current_setting('teste.c1'))) = 1);
  perform teste.conferir('... o item do RDO fica, com o nome gravado e sem o vínculo',
    (select colaborador_id is null and colaborador_nome = 'José da Silva'
           from relatorio_mao_obra where relatorio_id = r and funcao = 'Pedreiro'));
  perform set_config('teste.rdo_o2', r::text, false);
end $$;

-- notas de compras são internas: o cliente não as vê nem no RDO aprovado da
-- obra dele (decisão de produto — migração 0007; ver também 50_entrega.sql)
do $$
declare r uuid := 'a0000000-0000-4000-8000-000000000e02';   -- R2: aprovado, O1
begin
  perform teste.sair();
  insert into relatorio_notas_compras (relatorio_id, fornecedor, valor) values (r, 'Casa do Construtor', 250);
  insert into relatorio_notas_compras (relatorio_id, fornecedor, valor)
  values ('a0000000-0000-4000-8000-000000000e01', 'Interna', 1);
  perform teste.vestir('t.cliente.a@teste.obtra');
  perform teste.conferir('cliente não vê notas nem do RDO aprovado nem do aberto',
    teste.conta(format('select count(*) from relatorio_notas_compras where relatorio_id = %L', r)) = 0
    and teste.conta($q$select count(*) from relatorio_notas_compras
                      where relatorio_id = 'a0000000-0000-4000-8000-000000000e01'$q$) = 0);
end $$;

-- ------------------------------------------------------------ histórico -----
do $$
declare
  r    uuid := current_setting('teste.rdo_o2')::uuid;
  O    uuid;
  v_nome text;
begin
  perform teste.vestir('t.admin.a@teste.obtra');
  perform teste.conferir('histórico do RDO: criou → enviou_aprovacao → aprovou, na ordem',
    (select array_agg(acao order by id) from historico where entidade_id = r)
      = array['criou', 'enviou_aprovacao', 'aprovou']);
  select p.nome into v_nome from perfis p where p.email = 't.admin.a@teste.obtra';
  perform teste.conferir('quem aprovou fica registrado com nome',
    (select usuario_id = auth.uid() and usuario_nome = v_nome and descricao like 'RD-% aprovado'
       from historico where entidade_id = r and acao = 'aprovou'));
  perform teste.conferir('histórico registra cadastros e usuários',
    exists (select 1 from historico where entidade = 'cadastro' and descricao like 'Função "Pedreiro"%')
    and exists (select 1 from historico where entidade = 'usuario' and acao = 'excluiu'));
  perform teste.conferir('histórico registra fotos enviadas',
    exists (select 1 from historico where acao = 'enviou_foto'));
  perform teste.conferir('ninguém escreve no histórico pela API',
    teste.erro($q$insert into historico (empresa_id, acao, entidade)
                 values ('a0000000-0000-4000-8000-00000000000a', 'x', 'y')$q$) like '%permission denied%'
    and teste.erro('delete from historico') like '%permission denied%'
    and teste.erro($q$update historico set descricao = 'x'$q$) like '%permission denied%');

  -- obra criada e excluída: registra as duas coisas, sem registrar a cascata
  insert into obras (empresa_id, nome) values ('a0000000-0000-4000-8000-00000000000a', 'Obra relâmpago')
  returning id into O;
  perform criar_relatorio(O, current_date);
  update obras set status = 'paralisada' where id = O;
  delete from obras where id = O;
  perform teste.conferir('obra: criou, editou (status) e excluiu; o RDO da cascata não polui',
    (select array_agg(acao order by id) from historico where obra_id = O)
      = array['criou', 'criou', 'editou', 'excluiu']
    and (select count(*) from historico where obra_id = O and entidade = 'relatorio') = 1);
  perform teste.conferir('mudança de status da obra descrita',
    exists (select 1 from historico where obra_id = O and descricao like '%em_andamento → paralisada%'));

  perform teste.vestir('t.colab.a@teste.obtra');
  perform teste.conferir('colaborador lê o histórico da empresa',
    teste.conta('select count(*) from historico where empresa_id = ''a0000000-0000-4000-8000-00000000000a''') > 0);
  perform teste.vestir('t.cliente.a@teste.obtra');
  perform teste.conferir('cliente não lê histórico', teste.conta('select count(*) from historico') = 0);
  perform teste.vestir('t.admin.b@teste.obtra');
  perform teste.conferir('admin de B não lê histórico de A',
    teste.conta('select count(*) from historico where empresa_id = ''a0000000-0000-4000-8000-00000000000a''') = 0);
  perform teste.vestir('t.master@teste.obtra');
  perform teste.conferir('master lê o histórico de todas',
    teste.conta('select count(distinct empresa_id) from historico') >= 2);
end $$;
