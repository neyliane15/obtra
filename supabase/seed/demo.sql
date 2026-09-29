-- ============================================================================
-- Obtra — carga de demonstração (opcional).
-- ----------------------------------------------------------------------------
-- Duas empresas; obras em todos os status; cadastros de funções, colaboradores,
-- materiais e equipamentos; RDOs com mão de obra, equipamentos, atividades,
-- ocorrências, materiais, notas de compras e comentários; histórico; e os
-- usuários da tabela "Ambiente local" do docs/CONTRATO.md (senha obtra123).
--
-- ATENÇÃO EM PRODUÇÃO: cria contas com senha conhecida. Se carregar num
-- projeto real para demonstrar, troque as senhas (admin_redefinir_senha) ou
-- exclua as contas depois. O master NÃO é criado aqui — ver supabase/README.md.
--
-- Rodar como postgres (SQL Editor / psql). Idempotente: se a Construtora
-- Aurora já existe, não faz nada.
-- ============================================================================

-- ----------------------------------------------------- ajudantes da carga --
create or replace function pg_temp.rdo(
  p_obra uuid, p_dias_atras int, p_status text,
  p_manha text, p_tarde text, p_chuva numeric, p_obs text,
  p_autor uuid, p_aprovador uuid, p_responsavel text
) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.relatorios (
    obra_id, empresa_id, numero, data, status, responsavel,
    horario_inicio, horario_fim, intervalo_inicio, intervalo_fim,
    clima_manha, clima_tarde, clima_noite, condicao_manha, condicao_tarde, condicao_noite,
    pluviometria_mm, observacoes, criado_por, aprovado_por, aprovado_em
  ) values (
    p_obra, (select empresa_id from public.obras where id = p_obra), 0, current_date - p_dias_atras, p_status,
    p_responsavel, '07:00', '17:00', '12:00', '13:00',
    p_manha, p_tarde, null,
    case when p_manha = 'chuvoso' then 'impraticavel' when p_manha is not null then 'praticavel' end,
    case when p_tarde = 'chuvoso' then 'impraticavel' when p_tarde is not null then 'praticavel' end,
    null,
    p_chuva, p_obs, p_autor,
    case when p_status = 'aprovado' then p_aprovador end,
    case when p_status = 'aprovado' then (current_date - p_dias_atras + 1)::timestamptz + interval '9 hours' end
  ) returning id into v;
  return v;
end $$;

-- Mão de obra: por colaborador do cadastro (nome) ou por função + quantidade.
create or replace function pg_temp.mo(
  p_rel uuid, p_colaborador text, p_funcao text, p_qtd int default 1,
  p_tipo text default 'propria', p_terceira text default null
) returns void
language plpgsql as $$
begin
  insert into public.relatorio_mao_obra (relatorio_id, ordem, colaborador_id, funcao, quantidade, tipo, empresa_terceira)
  values (
    p_rel,
    (select count(*) + 1 from public.relatorio_mao_obra where relatorio_id = p_rel),
    (select c.id from public.colaboradores c join public.relatorios r on r.empresa_id = c.empresa_id
      where r.id = p_rel and c.nome = p_colaborador),
    p_funcao, p_qtd, p_tipo, p_terceira
  );
end $$;

create or replace function pg_temp.eq(p_rel uuid, p_nome text, p_qtd int default 1)
returns void
language plpgsql as $$
begin
  insert into public.relatorio_equipamentos (relatorio_id, ordem, equipamento_id, nome, quantidade)
  values (
    p_rel,
    (select count(*) + 1 from public.relatorio_equipamentos where relatorio_id = p_rel),
    (select e.id from public.equipamentos e join public.relatorios r on r.empresa_id = e.empresa_id
      where r.id = p_rel and e.nome = p_nome),
    p_nome, p_qtd
  );
end $$;

create or replace function pg_temp.mat(p_rel uuid, p_nome text, p_qtd numeric, p_tipo text)
returns void
language plpgsql as $$
begin
  insert into public.relatorio_materiais (relatorio_id, ordem, material_id, descricao, quantidade, tipo)
  values (
    p_rel,
    (select count(*) + 1 from public.relatorio_materiais where relatorio_id = p_rel),
    (select m.id from public.materiais m join public.relatorios r on r.empresa_id = m.empresa_id
      where r.id = p_rel and m.nome = p_nome),
    p_nome, p_qtd, p_tipo
  );
end $$;

create or replace function pg_temp.atv(p_rel uuid, p_desc text, p_status text, p_prog int)
returns void
language plpgsql as $$
begin
  insert into public.relatorio_atividades (relatorio_id, ordem, descricao, status, progresso)
  values (p_rel, (select count(*) + 1 from public.relatorio_atividades where relatorio_id = p_rel),
          p_desc, p_status, p_prog);
end $$;

create or replace function pg_temp.oco(p_rel uuid, p_desc text, p_tipo text)
returns void
language plpgsql as $$
begin
  insert into public.relatorio_ocorrencias (relatorio_id, ordem, descricao, tipo)
  values (p_rel, (select count(*) + 1 from public.relatorio_ocorrencias where relatorio_id = p_rel),
          p_desc, p_tipo);
end $$;

create or replace function pg_temp.nota(p_rel uuid, p_fornecedor text, p_numero text, p_valor numeric, p_desc text)
returns void
language plpgsql as $$
begin
  insert into public.relatorio_notas_compras (relatorio_id, ordem, fornecedor, numero_nota, valor, descricao)
  values (p_rel, (select count(*) + 1 from public.relatorio_notas_compras where relatorio_id = p_rel),
          p_fornecedor, p_numero, p_valor, p_desc);
end $$;

-- ------------------------------------------------------------------ carga --
do $$
declare
  aurora uuid := '0b7a0000-0000-4000-8000-00000000a001';
  beta   uuid := '0b7a0000-0000-4000-8000-00000000b001';
  vista  uuid := '0b7a0000-0000-4000-8000-0000000a0b01';
  paulis uuid := '0b7a0000-0000-4000-8000-0000000a0b02';
  galpao uuid := '0b7a0000-0000-4000-8000-0000000a0b03';
  escola uuid := '0b7a0000-0000-4000-8000-0000000a0b04';
  clinic uuid := '0b7a0000-0000-4000-8000-0000000a0b05';
  flores uuid := '0b7a0000-0000-4000-8000-0000000b0b01';
  u_admin uuid; u_eng uuid; u_cli uuid; u_beta uuid; u_mestre uuid;
  rafael constant text := 'Eng. Rafael Souza';
  r uuid;
begin
  if exists (select 1 from public.empresas where id = aurora) then
    raise notice 'demo: já carregada';
    return;
  end if;

  insert into public.empresas (id, nome, cnpj, email, telefone, endereco, cidade, uf, limite_armazenamento_mb) values
    (aurora, 'Construtora Aurora', '12.345.678/0001-90', 'contato@construtoraaurora.com.br', '(11) 3456-7890',
     'Av. Brigadeiro Faria Lima, 1500 - Sala 42', 'São Paulo', 'SP', 2048),
    (beta, 'Beta Engenharia', '98.765.432/0001-10', 'contato@betaengenharia.com.br', '(31) 3222-1100',
     'Rua da Bahia, 900', 'Belo Horizonte', 'MG', 1024);

  insert into public.obras (id, empresa_id, nome, codigo, endereco, cidade, uf, contratante, responsavel_tecnico,
                            data_inicio, prazo_dias, previsao_termino, status, observacoes) values
    (vista, aurora, 'Residencial Vista Azul', 'AUR-2026-001', 'Rua das Hortênsias, 250 - Jardim Botânico',
     'Campinas', 'SP', 'Vista Azul Empreendimentos SPE Ltda.', 'Eng. Rafael Souza',
     current_date - 120, 540, current_date + 420, 'em_andamento',
     'Torre única, 14 pavimentos, 56 apartamentos. Estrutura em concreto armado.'),
    (paulis, aurora, 'Edifício Comercial Paulista', 'AUR-2026-002', 'Av. Paulista, 2200',
     'São Paulo', 'SP', 'Paulista Office Participações S.A.', 'Eng. Rafael Souza',
     current_date - 60, 720, current_date + 660, 'em_andamento',
     'Retrofit de fachada e modernização de 12 andares corporativos.'),
    (galpao, aurora, 'Galpão Logístico Jundiaí', 'AUR-2025-014', 'Rod. Anhanguera, km 58',
     'Jundiaí', 'SP', 'LogBR Armazéns Gerais Ltda.', 'Eng. Carla Menezes',
     current_date - 200, 180, current_date - 20, 'paralisada',
     'Paralisada aguardando liberação ambiental da área de expansão.'),
    (escola, aurora, 'Reforma EMEF Anita Garibaldi', 'AUR-2025-009', 'Rua Voluntários da Pátria, 45',
     'São Paulo', 'SP', 'Prefeitura Municipal de São Paulo', 'Eng. Carla Menezes',
     current_date - 300, 180, current_date - 120, 'concluida',
     'Reforma de cobertura, sanitários e acessibilidade. Entregue.'),
    (clinic, aurora, 'Clínica Bem Viver', 'AUR-2026-005', 'Rua Barão de Jaguara, 1100',
     'Campinas', 'SP', 'Clínica Bem Viver Ltda.', 'Eng. Rafael Souza',
     current_date + 30, 240, current_date + 270, 'nao_iniciada', 'Início previsto após aprovação do alvará.'),
    (flores, beta, 'Condomínio Jardim das Flores', 'BETA-031', 'Rua dos Ipês, 77 - Buritis',
     'Belo Horizonte', 'MG', 'Jardim das Flores Incorporadora', 'Eng. Paulo Andrade',
     current_date - 90, 480, current_date + 390, 'em_andamento', null);

  u_admin  := public.admin_criar_usuario('admin@construtoraaurora.com.br', 'obtra123', 'Carla Menezes',
                                         'admin', aurora, '{}', '(11) 98888-1001', 'Diretora de Obras');
  u_eng    := public.admin_criar_usuario('engenheiro@construtoraaurora.com.br', 'obtra123', 'Rafael Souza',
                                         'colaborador', aurora, '{}', '(11) 98888-1002', 'Engenheiro Civil');
  u_mestre := public.admin_criar_usuario('mestre@construtoraaurora.com.br', 'obtra123', 'Antônio Lima',
                                         'colaborador', aurora, '{}', '(11) 97777-3003', 'Mestre de Obras');
  u_cli    := public.admin_criar_usuario('cliente@exemplo.com', 'obtra123', 'João Pereira',
                                         'cliente', aurora, array[vista], '(19) 99999-4004', 'Representante do contratante');
  u_beta   := public.admin_criar_usuario('admin@betaengenharia.com.br', 'obtra123', 'Paulo Andrade',
                                         'admin', beta, '{}', '(31) 98888-5005', 'Sócio-diretor');

  update public.obras set criado_por = u_admin where empresa_id = aurora;
  update public.obras set criado_por = u_beta  where empresa_id = beta;

  -- -------------------------------------------------------- cadastros ----
  insert into public.funcoes (empresa_id, nome)
  select aurora, f from unnest(array['Mestre de obras', 'Encarregado', 'Pedreiro', 'Servente', 'Carpinteiro',
    'Armador', 'Eletricista', 'Encanador', 'Pintor', 'Operador de grua', 'Montador de fachada',
    'Técnico de segurança', 'Vigia']) f;
  insert into public.funcoes (empresa_id, nome)
  select beta, f from unnest(array['Encarregado', 'Pedreiro', 'Servente', 'Operador de perfuratriz']) f;

  insert into public.colaboradores (empresa_id, nome, funcao_id, tipo, empresa_terceira, telefone, documento)
  select aurora, c.nome, (select id from public.funcoes where empresa_id = aurora and nome = c.funcao),
         c.tipo, c.terceira, c.telefone, c.doc
    from (values
      ('Antônio Lima',        'Mestre de obras',     'propria',      null,                    '(11) 97777-3003', '123.456.789-01'),
      ('Francisco Alves',     'Pedreiro',            'propria',      null,                    '(11) 97777-3010', '234.567.890-12'),
      ('Raimundo Nonato',     'Pedreiro',            'propria',      null,                    '(11) 97777-3011', '345.678.901-23'),
      ('Edvaldo Santos',      'Carpinteiro',         'propria',      null,                    '(11) 97777-3012', '456.789.012-34'),
      ('Luciano Ferreira',    'Operador de grua',    'propria',      null,                    '(11) 97777-3013', '567.890.123-45'),
      ('Juliana Castro',      'Técnico de segurança','propria',      null,                    '(11) 97777-3014', '678.901.234-56'),
      ('Wesley Martins',      'Armador',             'terceirizada', 'Ferragens Silva ME',    '(11) 96666-2001', null),
      ('Diego Ramos',         'Eletricista',         'terceirizada', 'Elétrica Voltz',        '(11) 96666-2002', null),
      ('Paulo Henrique Dias', 'Montador de fachada', 'terceirizada', 'Fachadas Alfa',         '(11) 96666-2003', null)
    ) as c(nome, funcao, tipo, terceira, telefone, doc);
  insert into public.colaboradores (empresa_id, nome, funcao_id, tipo, empresa_terceira)
  values (beta, 'Geraldo Pires', (select id from public.funcoes where empresa_id = beta and nome = 'Encarregado'),
          'propria', null);

  insert into public.materiais (empresa_id, nome, unidade)
  select aurora, m.nome, m.un from (values
    ('Concreto usinado fck 35 MPa', 'm³'), ('Cimento CP-II 50 kg', 'sc'), ('Areia média', 'm³'),
    ('Brita 1', 'm³'), ('Aço CA-50 10 mm', 't'), ('Aço CA-60 5 mm', 't'),
    ('Bloco cerâmico 14x19x29', 'un'), ('Argamassa AC-II', 'sc'), ('Eletroduto corrugado 3/4"', 'm'),
    ('Painel ACM 4 mm', 'm²'), ('Perfil de alumínio', 'barra')) as m(nome, un);
  insert into public.materiais (empresa_id, nome, unidade) values (beta, 'Concreto usinado fck 30 MPa', 'm³');

  insert into public.equipamentos (empresa_id, nome, identificacao)
  select aurora, e.nome, e.ident from (values
    ('Grua torre 42 m', 'GR-01'), ('Betoneira 400 L', 'BT-01/BT-02'), ('Vibrador de imersão', 'VB-01 a VB-04'),
    ('Caminhão-bomba lança 36 m', 'Locado — Polimix'), ('Balancim elétrico', 'BL-01/BL-02'),
    ('Andaime fachadeiro', 'Módulos 1,0 x 2,0 m'), ('Serra circular de bancada', 'SC-01')) as e(nome, ident);
  insert into public.equipamentos (empresa_id, nome, identificacao) values (beta, 'Perfuratriz hélice contínua', 'PHC-900');

  -- ------------------------------------------ Residencial Vista Azul (5) --
  r := pg_temp.rdo(vista, 6, 'aprovado', 'claro', 'claro', 0, 'Dia produtivo, sem intercorrências.', u_eng, u_admin, rafael);
  perform pg_temp.mo(r, 'Antônio Lima', null);
  perform pg_temp.mo(r, 'Francisco Alves', null);
  perform pg_temp.mo(r, 'Raimundo Nonato', null);
  perform pg_temp.mo(r, null, 'Pedreiro', 4);
  perform pg_temp.mo(r, null, 'Servente', 8);
  perform pg_temp.mo(r, 'Wesley Martins', null);
  perform pg_temp.mo(r, null, 'Armador', 3, 'terceirizada', 'Ferragens Silva ME');
  perform pg_temp.mo(r, 'Edvaldo Santos', null);
  perform pg_temp.eq(r, 'Grua torre 42 m');
  perform pg_temp.eq(r, 'Betoneira 400 L', 2);
  perform pg_temp.eq(r, 'Vibrador de imersão', 3);
  perform pg_temp.atv(r, 'Armação dos pilares do 5º pavimento', 'concluida', 100);
  perform pg_temp.atv(r, 'Fôrmas da laje do 5º pavimento', 'em_andamento', 60);
  perform pg_temp.atv(r, 'Alvenaria de vedação do 2º pavimento', 'em_andamento', 35);
  perform pg_temp.mat(r, 'Aço CA-50 10 mm', 3.2, 'recebido');
  perform pg_temp.mat(r, 'Bloco cerâmico 14x19x29', 4000, 'recebido');
  perform pg_temp.mat(r, 'Argamassa AC-II', 40, 'utilizado');
  perform pg_temp.nota(r, 'Gerdau Comercial de Aços', 'NF-e 458.221', 18432.00, 'Aço CA-50 10 mm — 3,2 t');
  perform pg_temp.nota(r, 'Cerâmica Jundiaí Ltda.', 'NF-e 90.117', 6280.00, 'Bloco cerâmico 14x19x29 — 4.000 un');
  insert into public.relatorio_comentarios (relatorio_id, autor_id, texto, criado_em) values
    (r, u_cli, 'Ótimo avanço na estrutura. Qual a previsão para concretar a laje do 5º?', now() - interval '5 days'),
    (r, u_eng, 'Previsão para quinta-feira, se o tempo ajudar.', now() - interval '5 days' + interval '2 hours');

  r := pg_temp.rdo(vista, 5, 'aprovado', 'nublado', 'chuvoso', 18.5,
                   'Chuva forte a partir das 14h paralisou os serviços externos.', u_eng, u_admin, rafael);
  perform pg_temp.mo(r, 'Antônio Lima', null);
  perform pg_temp.mo(r, 'Francisco Alves', null);
  perform pg_temp.mo(r, null, 'Pedreiro', 4);
  perform pg_temp.mo(r, null, 'Servente', 7);
  perform pg_temp.mo(r, 'Wesley Martins', null);
  perform pg_temp.eq(r, 'Grua torre 42 m');
  perform pg_temp.eq(r, 'Betoneira 400 L', 2);
  perform pg_temp.atv(r, 'Fôrmas da laje do 5º pavimento', 'em_andamento', 85);
  perform pg_temp.atv(r, 'Alvenaria de vedação do 2º pavimento', 'paralisada', 40);
  perform pg_temp.oco(r, 'Chuva intensa à tarde; equipe realocada para serviços internos.', 'clima');
  perform pg_temp.mat(r, 'Cimento CP-II 50 kg', 60, 'recebido');
  perform pg_temp.nota(r, 'Depósito São Jorge', 'NF-e 12.345', 2394.00, 'Cimento CP-II — 60 sacos');

  r := pg_temp.rdo(vista, 3, 'aprovado', 'claro', 'claro', 0,
                   'Concretagem da laje do 5º pavimento concluída.', u_eng, u_admin, rafael);
  perform pg_temp.mo(r, 'Antônio Lima', null);
  perform pg_temp.mo(r, 'Francisco Alves', null);
  perform pg_temp.mo(r, 'Raimundo Nonato', null);
  perform pg_temp.mo(r, null, 'Pedreiro', 5);
  perform pg_temp.mo(r, null, 'Servente', 10);
  perform pg_temp.mo(r, 'Luciano Ferreira', null);
  perform pg_temp.mo(r, null, 'Operador de bomba', 2, 'terceirizada', 'Concreteira Polimix');
  perform pg_temp.eq(r, 'Grua torre 42 m');
  perform pg_temp.eq(r, 'Caminhão-bomba lança 36 m');
  perform pg_temp.eq(r, 'Vibrador de imersão', 4);
  perform pg_temp.atv(r, 'Concretagem da laje do 5º pavimento', 'concluida', 100);
  perform pg_temp.atv(r, 'Cura úmida da laje', 'iniciada', 10);
  perform pg_temp.mat(r, 'Concreto usinado fck 35 MPa', 48, 'utilizado');
  perform pg_temp.oco(r, 'Caminhão-betoneira chegou com 40 min de atraso.', 'atraso');
  perform pg_temp.nota(r, 'Polimix Concreto Ltda.', 'NF-e 771.902', 26880.00, 'Concreto fck 35 — 48 m³ + bombeamento');

  r := pg_temp.rdo(vista, 1, 'revisar', 'claro', 'nublado', 0, null, u_eng, null, rafael);
  perform pg_temp.mo(r, 'Antônio Lima', null);
  perform pg_temp.mo(r, 'Francisco Alves', null);
  perform pg_temp.mo(r, null, 'Pedreiro', 4);
  perform pg_temp.mo(r, null, 'Servente', 8);
  perform pg_temp.mo(r, 'Diego Ramos', null);
  perform pg_temp.mo(r, 'Juliana Castro', null);
  perform pg_temp.eq(r, 'Grua torre 42 m');
  perform pg_temp.eq(r, 'Betoneira 400 L', 2);
  perform pg_temp.eq(r, 'Serra circular de bancada');
  perform pg_temp.atv(r, 'Desforma da laje do 4º pavimento', 'concluida', 100);
  perform pg_temp.atv(r, 'Tubulação elétrica embutida do 3º pavimento', 'em_andamento', 25);
  perform pg_temp.oco(r, 'Servente sofreu corte leve na mão; atendido no local, sem afastamento.', 'acidente');
  perform pg_temp.oco(r, 'Reforçado o uso de luvas na desforma (DDS às 7h).', 'seguranca');
  perform pg_temp.mat(r, 'Eletroduto corrugado 3/4"', 300, 'recebido');
  perform pg_temp.mat(r, 'Eletroduto corrugado 3/4"', 120, 'utilizado');

  r := pg_temp.rdo(vista, 0, 'preenchendo', 'claro', null, null, null, u_mestre, null, 'Antônio Lima');
  perform pg_temp.mo(r, 'Antônio Lima', null);
  perform pg_temp.mo(r, null, 'Pedreiro', 5);
  perform pg_temp.mo(r, null, 'Servente', 8);
  perform pg_temp.eq(r, 'Grua torre 42 m');

  -- ---------------------------------------- Edifício Comercial Paulista ---
  r := pg_temp.rdo(paulis, 4, 'aprovado', 'nublado', 'nublado', 2.0,
                   'Montagem do balancim na fachada norte.', u_eng, u_admin, rafael);
  perform pg_temp.mo(r, null, 'Encarregado', 1);
  perform pg_temp.mo(r, 'Paulo Henrique Dias', null);
  perform pg_temp.mo(r, null, 'Montador de fachada', 3, 'terceirizada', 'Fachadas Alfa');
  perform pg_temp.mo(r, null, 'Servente', 3);
  perform pg_temp.eq(r, 'Balancim elétrico', 2);
  perform pg_temp.eq(r, 'Andaime fachadeiro', 40);
  perform pg_temp.atv(r, 'Remoção do revestimento antigo — fachada norte', 'em_andamento', 30);
  perform pg_temp.mat(r, 'Painel ACM 4 mm', 120, 'recebido');
  perform pg_temp.nota(r, 'Alucobond Distribuidora', 'NF-e 33.410', 21960.00, 'Painéis ACM 4 mm — 120 m²');

  r := pg_temp.rdo(paulis, 2, 'revisar', 'claro', 'claro', 0, null, u_eng, null, rafael);
  perform pg_temp.mo(r, null, 'Encarregado', 1);
  perform pg_temp.mo(r, 'Paulo Henrique Dias', null);
  perform pg_temp.mo(r, null, 'Montador de fachada', 4, 'terceirizada', 'Fachadas Alfa');
  perform pg_temp.mo(r, 'Diego Ramos', null);
  perform pg_temp.eq(r, 'Balancim elétrico', 2);
  perform pg_temp.atv(r, 'Remoção do revestimento antigo — fachada norte', 'em_andamento', 55);
  perform pg_temp.atv(r, 'Substituição de quadros elétricos do 7º andar', 'iniciada', 10);
  perform pg_temp.oco(r, 'Entrega dos perfis de alumínio remarcada pelo fornecedor.', 'material');

  r := pg_temp.rdo(paulis, 0, 'preenchendo', 'nublado', null, null, null, u_eng, null, rafael);
  perform pg_temp.mo(r, null, 'Encarregado', 1);

  -- ------------------------------------------ Galpão Logístico Jundiaí ----
  r := pg_temp.rdo(galpao, 40, 'aprovado', 'chuvoso', 'chuvoso', 32.0,
                   'Obra paralisada por determinação do órgão ambiental.', u_eng, u_admin, 'Eng. Carla Menezes');
  perform pg_temp.mo(r, null, 'Vigia', 1, 'terceirizada', 'Segurança Patrimonial Norte');
  perform pg_temp.oco(r, 'Notificação da CETESB: suspensão da terraplenagem na área de expansão.', 'geral');

  -- ------------------------------------------------ Beta Engenharia -------
  r := pg_temp.rdo(flores, 1, 'aprovado', 'claro', 'claro', 0, 'Fundações do bloco B.', u_beta, u_beta, 'Eng. Paulo Andrade');
  perform pg_temp.mo(r, 'Geraldo Pires', null);
  perform pg_temp.mo(r, null, 'Operador de perfuratriz', 2, 'terceirizada', 'Fundações Minas');
  perform pg_temp.mo(r, null, 'Servente', 5);
  perform pg_temp.eq(r, 'Perfuratriz hélice contínua');
  perform pg_temp.atv(r, 'Estacas hélice contínua — bloco B', 'em_andamento', 45);
  perform pg_temp.mat(r, 'Concreto usinado fck 30 MPa', 36, 'utilizado');

  -- ------------------------------------------------------- histórico -----
  -- Os gatilhos registraram tudo como "Sistema" e com a hora da carga. Aqui a
  -- carga assina cada evento com quem o teria feito, na data plausível.
  delete from public.historico where empresa_id in (aurora, beta) and entidade = 'obra' and acao = 'editou';
  update public.historico h
     set usuario_id = o.criado_por, usuario_nome = p.nome,
         criado_em = least(o.data_inicio - 7, current_date - 3)::timestamptz + interval '10 hours'
    from public.obras o join public.perfis p on p.id = o.criado_por
   where h.entidade = 'obra' and h.entidade_id = o.id;
  update public.historico h
     set usuario_id = coalesce(pa.id, u_admin), usuario_nome = coalesce(pa.nome, 'Carla Menezes'),
         criado_em = now() - interval '130 days'
    from public.perfis pa
   where h.empresa_id in (aurora, beta) and h.entidade in ('usuario', 'cadastro')
     and pa.id = case when h.empresa_id = beta then u_beta else u_admin end;
  update public.historico h
     set usuario_id = r2.criado_por, usuario_nome = p.nome,
         criado_em = r2.data + time '07:40'
    from public.relatorios r2 join public.perfis p on p.id = r2.criado_por
   where h.entidade = 'relatorio' and h.entidade_id = r2.id and h.acao = 'criou';
  insert into public.historico (empresa_id, obra_id, usuario_id, usuario_nome, acao, entidade, entidade_id, descricao, criado_em)
  select r2.empresa_id, r2.obra_id, r2.criado_por, p.nome, 'enviou_aprovacao', 'relatorio', r2.id,
         format('RD-%s · %s enviado para aprovação', r2.numero, o.nome), r2.data + time '17:20'
    from public.relatorios r2 join public.obras o on o.id = r2.obra_id join public.perfis p on p.id = r2.criado_por
   where r2.empresa_id in (aurora, beta) and r2.status in ('revisar', 'aprovado');
  insert into public.historico (empresa_id, obra_id, usuario_id, usuario_nome, acao, entidade, entidade_id, descricao, criado_em)
  select r2.empresa_id, r2.obra_id, r2.aprovado_por, p.nome, 'aprovou', 'relatorio', r2.id,
         format('RD-%s · %s aprovado', r2.numero, o.nome), r2.aprovado_em
    from public.relatorios r2 join public.obras o on o.id = r2.obra_id join public.perfis p on p.id = r2.aprovado_por
   where r2.empresa_id in (aurora, beta) and r2.status = 'aprovado';

  raise notice 'demo: Construtora Aurora (5 obras) e Beta Engenharia (1 obra) carregadas';
end $$;
