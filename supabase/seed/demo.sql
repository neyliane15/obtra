-- ============================================================================
-- Obtra — carga de demonstração (opcional).
-- ----------------------------------------------------------------------------
-- Duas empresas, obras em todos os status, RDOs com mão de obra, equipamentos,
-- atividades, ocorrências, materiais e comentários, e os usuários da tabela
-- "Ambiente local" do docs/CONTRATO.md (senha obtra123).
--
-- ATENÇÃO EM PRODUÇÃO: cria contas com senha conhecida. Se carregar num
-- projeto real para demonstrar, troque as senhas (admin_redefinir_senha) ou
-- exclua as contas depois. O master NÃO é criado aqui — ver supabase/README.md.
--
-- Rodar como postgres (SQL Editor / psql). Idempotente: se a Construtora
-- Aurora já existe, não faz nada.
-- ============================================================================

create or replace function pg_temp.rdo(
  p_obra uuid, p_dias_atras int, p_status text,
  p_manha text, p_tarde text, p_chuva numeric, p_obs text,
  p_autor uuid, p_aprovador uuid
) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.relatorios (
    obra_id, empresa_id, numero, data, status, horario_inicio, horario_fim,
    clima_manha, clima_tarde, clima_noite, condicao_manha, condicao_tarde, condicao_noite,
    pluviometria_mm, observacoes, criado_por, aprovado_por, aprovado_em
  ) values (
    p_obra, (select empresa_id from public.obras where id = p_obra), 0, current_date - p_dias_atras, p_status,
    '07:00', '17:00',
    p_manha, p_tarde, 'claro',
    case when p_manha = 'chuvoso' then 'impraticavel' else 'praticavel' end,
    case when p_tarde = 'chuvoso' then 'impraticavel' else 'praticavel' end,
    'praticavel',
    p_chuva, p_obs, p_autor,
    case when p_status = 'aprovado' then p_aprovador end,
    case when p_status = 'aprovado' then (current_date - p_dias_atras + 1)::timestamptz + interval '9 hours' end
  ) returning id into v;
  return v;
end $$;

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
     'Campinas', 'SP', 'Vista Azul Empreendimentos SPE Ltda.', 'Eng. Rafael Souza — CREA-SP 5063123456',
     current_date - 120, 540, current_date + 420, 'em_andamento',
     'Torre única, 14 pavimentos, 56 apartamentos. Estrutura em concreto armado.'),
    (paulis, aurora, 'Edifício Comercial Paulista', 'AUR-2026-002', 'Av. Paulista, 2200',
     'São Paulo', 'SP', 'Paulista Office Participações S.A.', 'Eng. Rafael Souza — CREA-SP 5063123456',
     current_date - 60, 720, current_date + 660, 'em_andamento',
     'Retrofit de fachada e modernização de 12 andares corporativos.'),
    (galpao, aurora, 'Galpão Logístico Jundiaí', 'AUR-2025-014', 'Rod. Anhanguera, km 58',
     'Jundiaí', 'SP', 'LogBR Armazéns Gerais Ltda.', 'Eng. Carla Menezes — CREA-SP 5061987654',
     current_date - 200, 300, current_date + 100, 'paralisada',
     'Paralisada aguardando liberação ambiental da área de expansão.'),
    (escola, aurora, 'Reforma EMEF Anita Garibaldi', 'AUR-2025-009', 'Rua Voluntários da Pátria, 45',
     'São Paulo', 'SP', 'Prefeitura Municipal de São Paulo', 'Eng. Carla Menezes — CREA-SP 5061987654',
     current_date - 300, 180, current_date - 120, 'concluida',
     'Reforma de cobertura, sanitários e acessibilidade. Entregue.'),
    (clinic, aurora, 'Clínica Bem Viver', 'AUR-2026-005', 'Rua Barão de Jaguara, 1100',
     'Campinas', 'SP', 'Clínica Bem Viver Ltda.', 'Eng. Rafael Souza — CREA-SP 5063123456',
     current_date + 30, 240, current_date + 270, 'nao_iniciada', 'Início previsto após aprovação do alvará.'),
    (flores, beta, 'Condomínio Jardim das Flores', 'BETA-031', 'Rua dos Ipês, 77 - Buritis',
     'Belo Horizonte', 'MG', 'Jardim das Flores Incorporadora', 'Eng. Paulo Andrade — CREA-MG 1402334455',
     current_date - 90, 480, current_date + 390, 'em_andamento', null);

  u_admin := public.admin_criar_usuario('admin@construtoraaurora.com.br', 'obtra123', 'Carla Menezes',
                                        'admin', aurora, '{}', '(11) 98888-1001', 'Diretora de Obras');
  u_eng   := public.admin_criar_usuario('engenheiro@construtoraaurora.com.br', 'obtra123', 'Rafael Souza',
                                        'colaborador', aurora, '{}', '(11) 98888-1002', 'Engenheiro Civil');
  u_mestre := public.admin_criar_usuario('mestre@construtoraaurora.com.br', 'obtra123', 'Seu Antônio Lima',
                                        'colaborador', aurora, '{}', '(11) 97777-3003', 'Mestre de Obras');
  u_cli   := public.admin_criar_usuario('cliente@exemplo.com', 'obtra123', 'João Pereira',
                                        'cliente', aurora, array[vista], '(19) 99999-4004', 'Representante do contratante');
  u_beta  := public.admin_criar_usuario('admin@betaengenharia.com.br', 'obtra123', 'Paulo Andrade',
                                        'admin', beta, '{}', '(31) 98888-5005', 'Sócio-diretor');

  update public.obras set criado_por = u_admin where empresa_id = aurora;
  update public.obras set criado_por = u_beta  where empresa_id = beta;

  -- ------------------------------------------ Residencial Vista Azul (5) --
  r := pg_temp.rdo(vista, 6, 'aprovado', 'claro', 'claro', 0, 'Dia produtivo, sem intercorrências.', u_eng, u_admin);
  insert into public.relatorio_mao_obra (relatorio_id, ordem, funcao, quantidade, tipo, empresa_terceira) values
    (r, 1, 'Mestre de obras', 1, 'propria', null), (r, 2, 'Pedreiro', 6, 'propria', null),
    (r, 3, 'Servente', 8, 'propria', null), (r, 4, 'Armador', 4, 'terceirizada', 'Ferragens Silva ME'),
    (r, 5, 'Carpinteiro', 3, 'propria', null);
  insert into public.relatorio_equipamentos (relatorio_id, ordem, nome, quantidade) values
    (r, 1, 'Grua torre 42 m', 1), (r, 2, 'Betoneira 400 L', 2), (r, 3, 'Vibrador de imersão', 3);
  insert into public.relatorio_atividades (relatorio_id, ordem, descricao, status, progresso) values
    (r, 1, 'Armação dos pilares do 5º pavimento', 'concluida', 100),
    (r, 2, 'Fôrmas da laje do 5º pavimento', 'em_andamento', 60),
    (r, 3, 'Alvenaria de vedação do 2º pavimento', 'em_andamento', 35);
  insert into public.relatorio_materiais (relatorio_id, ordem, descricao, quantidade, tipo) values
    (r, 1, 'Aço CA-50 10 mm', '3,2 t', 'recebido'), (r, 2, 'Bloco cerâmico 14x19x29', '4.000 un', 'recebido');
  insert into public.relatorio_comentarios (relatorio_id, autor_id, texto, criado_em) values
    (r, u_cli, 'Ótimo avanço na estrutura. Qual a previsão para concretar a laje do 5º?', now() - interval '5 days'),
    (r, u_eng, 'Previsão para quinta-feira, se o tempo ajudar.', now() - interval '5 days' + interval '2 hours');

  r := pg_temp.rdo(vista, 5, 'aprovado', 'nublado', 'chuvoso', 18.5,
                   'Chuva forte a partir das 14h paralisou os serviços externos.', u_eng, u_admin);
  insert into public.relatorio_mao_obra (relatorio_id, ordem, funcao, quantidade, tipo, empresa_terceira) values
    (r, 1, 'Mestre de obras', 1, 'propria', null), (r, 2, 'Pedreiro', 6, 'propria', null),
    (r, 3, 'Servente', 7, 'propria', null), (r, 4, 'Armador', 4, 'terceirizada', 'Ferragens Silva ME');
  insert into public.relatorio_equipamentos (relatorio_id, ordem, nome, quantidade) values
    (r, 1, 'Grua torre 42 m', 1), (r, 2, 'Betoneira 400 L', 2);
  insert into public.relatorio_atividades (relatorio_id, ordem, descricao, status, progresso) values
    (r, 1, 'Fôrmas da laje do 5º pavimento', 'em_andamento', 85),
    (r, 2, 'Alvenaria de vedação do 2º pavimento', 'paralisada', 40);
  insert into public.relatorio_ocorrencias (relatorio_id, ordem, descricao, tipo) values
    (r, 1, 'Chuva intensa à tarde; equipe realocada para serviços internos.', 'clima');

  r := pg_temp.rdo(vista, 3, 'aprovado', 'claro', 'claro', 0,
                   'Concretagem da laje do 5º pavimento concluída.', u_eng, u_admin);
  insert into public.relatorio_mao_obra (relatorio_id, ordem, funcao, quantidade, tipo, empresa_terceira) values
    (r, 1, 'Mestre de obras', 1, 'propria', null), (r, 2, 'Pedreiro', 8, 'propria', null),
    (r, 3, 'Servente', 10, 'propria', null), (r, 4, 'Operador de bomba', 2, 'terceirizada', 'Concreteira Polimix');
  insert into public.relatorio_equipamentos (relatorio_id, ordem, nome, quantidade) values
    (r, 1, 'Grua torre 42 m', 1), (r, 2, 'Caminhão-bomba lança 36 m', 1), (r, 3, 'Vibrador de imersão', 4);
  insert into public.relatorio_atividades (relatorio_id, ordem, descricao, status, progresso) values
    (r, 1, 'Concretagem da laje do 5º pavimento', 'concluida', 100),
    (r, 2, 'Cura úmida da laje', 'iniciada', 10);
  insert into public.relatorio_materiais (relatorio_id, ordem, descricao, quantidade, tipo) values
    (r, 1, 'Concreto usinado fck 35 MPa', '48 m³', 'utilizado');
  insert into public.relatorio_ocorrencias (relatorio_id, ordem, descricao, tipo) values
    (r, 1, 'Caminhão-betoneira chegou com 40 min de atraso.', 'atraso');

  r := pg_temp.rdo(vista, 1, 'revisar', 'claro', 'nublado', 0, null, u_eng, null);
  insert into public.relatorio_mao_obra (relatorio_id, ordem, funcao, quantidade, tipo, empresa_terceira) values
    (r, 1, 'Mestre de obras', 1, 'propria', null), (r, 2, 'Pedreiro', 6, 'propria', null),
    (r, 3, 'Servente', 8, 'propria', null), (r, 4, 'Eletricista', 2, 'terceirizada', 'Elétrica Voltz');
  insert into public.relatorio_equipamentos (relatorio_id, ordem, nome, quantidade) values
    (r, 1, 'Grua torre 42 m', 1), (r, 2, 'Betoneira 400 L', 2);
  insert into public.relatorio_atividades (relatorio_id, ordem, descricao, status, progresso) values
    (r, 1, 'Desforma da laje do 4º pavimento', 'concluida', 100),
    (r, 2, 'Tubulação elétrica embutida do 3º pavimento', 'em_andamento', 25);
  insert into public.relatorio_ocorrencias (relatorio_id, ordem, descricao, tipo) values
    (r, 1, 'Servente sofreu corte leve na mão; atendido no local, sem afastamento.', 'acidente'),
    (r, 2, 'Reforçado o uso de luvas na desforma (DDS às 7h).', 'seguranca');

  r := pg_temp.rdo(vista, 0, 'preenchendo', 'claro', null, null, null, u_mestre, null);
  insert into public.relatorio_mao_obra (relatorio_id, ordem, funcao, quantidade, tipo, empresa_terceira) values
    (r, 1, 'Mestre de obras', 1, 'propria', null), (r, 2, 'Pedreiro', 5, 'propria', null),
    (r, 3, 'Servente', 8, 'propria', null);
  insert into public.relatorio_equipamentos (relatorio_id, ordem, nome, quantidade) values
    (r, 1, 'Grua torre 42 m', 1);

  -- ---------------------------------------- Edifício Comercial Paulista ---
  r := pg_temp.rdo(paulis, 4, 'aprovado', 'nublado', 'nublado', 2.0,
                   'Montagem do balancim na fachada norte.', u_eng, u_admin);
  insert into public.relatorio_mao_obra (relatorio_id, ordem, funcao, quantidade, tipo, empresa_terceira) values
    (r, 1, 'Encarregado', 1, 'propria', null), (r, 2, 'Montador de fachada', 4, 'terceirizada', 'Fachadas Alfa'),
    (r, 3, 'Ajudante', 3, 'propria', null);
  insert into public.relatorio_equipamentos (relatorio_id, ordem, nome, quantidade) values
    (r, 1, 'Balancim elétrico', 2), (r, 2, 'Andaime fachadeiro (módulos)', 40);
  insert into public.relatorio_atividades (relatorio_id, ordem, descricao, status, progresso) values
    (r, 1, 'Remoção do revestimento antigo — fachada norte', 'em_andamento', 30);
  insert into public.relatorio_materiais (relatorio_id, ordem, descricao, quantidade, tipo) values
    (r, 1, 'Painéis ACM 4 mm', '120 m²', 'recebido');

  r := pg_temp.rdo(paulis, 2, 'revisar', 'claro', 'claro', 0, null, u_eng, null);
  insert into public.relatorio_mao_obra (relatorio_id, ordem, funcao, quantidade, tipo, empresa_terceira) values
    (r, 1, 'Encarregado', 1, 'propria', null), (r, 2, 'Montador de fachada', 5, 'terceirizada', 'Fachadas Alfa'),
    (r, 3, 'Eletricista', 2, 'propria', null);
  insert into public.relatorio_atividades (relatorio_id, ordem, descricao, status, progresso) values
    (r, 1, 'Remoção do revestimento antigo — fachada norte', 'em_andamento', 55),
    (r, 2, 'Substituição de quadros elétricos do 7º andar', 'iniciada', 10);
  insert into public.relatorio_ocorrencias (relatorio_id, ordem, descricao, tipo) values
    (r, 1, 'Entrega dos perfis de alumínio remarcada pelo fornecedor.', 'material');

  r := pg_temp.rdo(paulis, 0, 'preenchendo', 'nublado', null, null, null, u_eng, null);

  -- ------------------------------------------ Galpão Logístico Jundiaí ----
  r := pg_temp.rdo(galpao, 40, 'aprovado', 'chuvoso', 'chuvoso', 32.0,
                   'Obra paralisada por determinação do órgão ambiental.', u_eng, u_admin);
  insert into public.relatorio_mao_obra (relatorio_id, ordem, funcao, quantidade, tipo, empresa_terceira) values
    (r, 1, 'Vigia', 1, 'terceirizada', 'Segurança Patrimonial Norte');
  insert into public.relatorio_ocorrencias (relatorio_id, ordem, descricao, tipo) values
    (r, 1, 'Notificação da CETESB: suspensão da terraplenagem na área de expansão.', 'geral');

  -- ------------------------------------------------ Beta Engenharia -------
  r := pg_temp.rdo(flores, 1, 'aprovado', 'claro', 'claro', 0, 'Fundações do bloco B.', u_beta, u_beta);
  insert into public.relatorio_mao_obra (relatorio_id, ordem, funcao, quantidade, tipo, empresa_terceira) values
    (r, 1, 'Operador de perfuratriz', 2, 'terceirizada', 'Fundações Minas'), (r, 2, 'Servente', 5, 'propria', null);
  insert into public.relatorio_equipamentos (relatorio_id, ordem, nome, quantidade) values
    (r, 1, 'Perfuratriz hélice contínua', 1);
  insert into public.relatorio_atividades (relatorio_id, ordem, descricao, status, progresso) values
    (r, 1, 'Estacas hélice contínua — bloco B', 'em_andamento', 45);

  raise notice 'demo: Construtora Aurora (5 obras) e Beta Engenharia (1 obra) carregadas';
end $$;
