-- ============================================================================
-- Obtra — 0003: políticas de RLS por papel.
-- ----------------------------------------------------------------------------
-- Todas as políticas são `to authenticated`: o anônimo não tem política
-- nenhuma (e nem privilégio de tabela — ver 0006), então não vê nada.
-- Regras de empresa inativa / perfil inativo moram nas funções auxiliares
-- (eh_equipe, eh_admin, eh_cliente_da_obra), não repetidas aqui.
-- ============================================================================

-- ------------------------------------------------------------- empresas ----
drop policy if exists empresas_ler on public.empresas;
create policy empresas_ler on public.empresas for select to authenticated
  using (public.eh_master() or (id = public.minha_empresa() and ativa));

drop policy if exists empresas_inserir on public.empresas;
create policy empresas_inserir on public.empresas for insert to authenticated
  with check (public.eh_master());

-- Admin edita os dados da própria empresa; limite e `ativa` são barrados
-- pelo gatilho empresas_proteger.
drop policy if exists empresas_atualizar on public.empresas;
create policy empresas_atualizar on public.empresas for update to authenticated
  using (public.eh_admin(id))
  with check (public.eh_admin(id));

drop policy if exists empresas_excluir on public.empresas;
create policy empresas_excluir on public.empresas for delete to authenticated
  using (public.eh_master());

-- --------------------------------------------------------------- perfis ----
-- O próprio perfil é sempre legível (mesmo inativo): é assim que a tela sabe
-- dizer "sua conta está desativada" em vez de simplesmente vazia.
-- Cliente vê a equipe da empresa dele (nomes nos relatórios/comentários),
-- nunca os outros clientes.
drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (
    id = auth.uid()
    or public.eh_master()
    or (empresa_id is not null and public.eh_equipe(empresa_id))
    or (papel in ('admin', 'colaborador')
        and empresa_id = public.minha_empresa()
        and public.meu_papel() = 'cliente'
        and exists (select 1 from public.empresas e where e.id = empresa_id and e.ativa))
  );

-- Sem insert/delete: perfis nascem do gatilho em auth.users e morrem com ele
-- (RPCs admin_criar_usuario / admin_excluir_usuario).
drop policy if exists perfis_atualizar on public.perfis;
create policy perfis_atualizar on public.perfis for update to authenticated
  using (
    id = auth.uid()
    or public.eh_master()
    or (papel <> 'master' and empresa_id is not null and public.eh_admin(empresa_id))
  )
  with check (
    id = auth.uid()
    or public.eh_master()
    or (papel <> 'master' and empresa_id is not null and public.eh_admin(empresa_id))
  );

-- --------------------------------------------------------- configuracao ----
drop policy if exists configuracao_ler on public.configuracao;
create policy configuracao_ler on public.configuracao for select to authenticated
  using (public.eh_master());

-- ---------------------------------------------------------------- obras ----
drop policy if exists obras_ler on public.obras;
create policy obras_ler on public.obras for select to authenticated
  using (public.eh_equipe(empresa_id) or public.eh_cliente_da_obra(id));

drop policy if exists obras_inserir on public.obras;
create policy obras_inserir on public.obras for insert to authenticated
  with check (public.eh_admin(empresa_id));

-- Colaborador atualiza (status, capa, observações), não cria nem exclui.
drop policy if exists obras_atualizar on public.obras;
create policy obras_atualizar on public.obras for update to authenticated
  using (public.eh_equipe(empresa_id))
  with check (public.eh_equipe(empresa_id));

drop policy if exists obras_excluir on public.obras;
create policy obras_excluir on public.obras for delete to authenticated
  using (public.eh_admin(empresa_id));

-- -------------------------------------------------------- obra_clientes ----
drop policy if exists obra_clientes_ler on public.obra_clientes;
create policy obra_clientes_ler on public.obra_clientes for select to authenticated
  using (
    public.eh_equipe(public.empresa_da_obra(obra_id))
    or (cliente_id = auth.uid() and public.eh_cliente_da_obra(obra_id))
  );

drop policy if exists obra_clientes_inserir on public.obra_clientes;
create policy obra_clientes_inserir on public.obra_clientes for insert to authenticated
  with check (public.eh_admin(public.empresa_da_obra(obra_id)));

drop policy if exists obra_clientes_excluir on public.obra_clientes;
create policy obra_clientes_excluir on public.obra_clientes for delete to authenticated
  using (public.eh_admin(public.empresa_da_obra(obra_id)));

-- ----------------------------------------------------------- relatorios ----
drop policy if exists relatorios_ler on public.relatorios;
create policy relatorios_ler on public.relatorios for select to authenticated
  using (
    public.eh_equipe(empresa_id)
    or (status = 'aprovado' and public.eh_cliente_da_obra(obra_id))
  );

-- Colaborador cria e edita, mas não grava `aprovado` nem mexe em aprovado.
drop policy if exists relatorios_inserir on public.relatorios;
create policy relatorios_inserir on public.relatorios for insert to authenticated
  with check (
    public.eh_equipe(empresa_id)
    and (status <> 'aprovado' or public.eh_admin(empresa_id))
  );

drop policy if exists relatorios_atualizar on public.relatorios;
create policy relatorios_atualizar on public.relatorios for update to authenticated
  using (
    public.eh_equipe(empresa_id)
    and (status <> 'aprovado' or public.eh_admin(empresa_id))
  )
  with check (
    public.eh_equipe(empresa_id)
    and (status <> 'aprovado' or public.eh_admin(empresa_id))
  );

drop policy if exists relatorios_excluir on public.relatorios;
create policy relatorios_excluir on public.relatorios for delete to authenticated
  using (public.eh_admin(empresa_id));

-- ------------------------------------------------ filhos do relatório ------
do $$
declare t text;
begin
  foreach t in array array['relatorio_mao_obra', 'relatorio_equipamentos', 'relatorio_atividades',
                           'relatorio_ocorrencias', 'relatorio_materiais'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ler', t);
    execute format('create policy %I on public.%I for select to authenticated
                      using (public.pode_ver_relatorio(relatorio_id))', t || '_ler', t);

    execute format('drop policy if exists %I on public.%I', t || '_inserir', t);
    execute format('create policy %I on public.%I for insert to authenticated
                      with check (public.pode_editar_relatorio(relatorio_id))', t || '_inserir', t);

    execute format('drop policy if exists %I on public.%I', t || '_atualizar', t);
    execute format('create policy %I on public.%I for update to authenticated
                      using (public.pode_editar_relatorio(relatorio_id))
                      with check (public.pode_editar_relatorio(relatorio_id))', t || '_atualizar', t);

    execute format('drop policy if exists %I on public.%I', t || '_excluir', t);
    execute format('create policy %I on public.%I for delete to authenticated
                      using (public.pode_editar_relatorio(relatorio_id))', t || '_excluir', t);
  end loop;
end $$;

-- ---------------------------------------------------------- comentários ----
-- Quem vê o relatório comenta nele (cliente: só nos aprovados, que são os
-- únicos que ele vê). Autor edita/exclui o seu; admin/master excluem qualquer.
drop policy if exists relatorio_comentarios_ler on public.relatorio_comentarios;
create policy relatorio_comentarios_ler on public.relatorio_comentarios for select to authenticated
  using (public.pode_ver_relatorio(relatorio_id));

drop policy if exists relatorio_comentarios_inserir on public.relatorio_comentarios;
create policy relatorio_comentarios_inserir on public.relatorio_comentarios for insert to authenticated
  with check (autor_id = auth.uid() and public.pode_ver_relatorio(relatorio_id));

drop policy if exists relatorio_comentarios_atualizar on public.relatorio_comentarios;
create policy relatorio_comentarios_atualizar on public.relatorio_comentarios for update to authenticated
  using (autor_id = auth.uid() and public.pode_ver_relatorio(relatorio_id))
  with check (autor_id = auth.uid() and public.pode_ver_relatorio(relatorio_id));

drop policy if exists relatorio_comentarios_excluir on public.relatorio_comentarios;
create policy relatorio_comentarios_excluir on public.relatorio_comentarios for delete to authenticated
  using (
    (autor_id = auth.uid() and public.pode_ver_relatorio(relatorio_id))
    or public.eh_admin(public.empresa_do_relatorio(relatorio_id))
  );

-- ---------------------------------------------------------------- fotos ----
-- Cliente: fotos da obra dele sem relatório, ou de relatório aprovado.
drop policy if exists fotos_ler on public.fotos;
create policy fotos_ler on public.fotos for select to authenticated
  using (
    public.eh_equipe(empresa_id)
    or (public.eh_cliente_da_obra(obra_id)
        and (relatorio_id is null or public.pode_ver_relatorio(relatorio_id)))
  );

drop policy if exists fotos_inserir on public.fotos;
create policy fotos_inserir on public.fotos for insert to authenticated
  with check (
    public.eh_equipe(empresa_id)
    and (relatorio_id is null or public.pode_editar_relatorio(relatorio_id))
  );

drop policy if exists fotos_atualizar on public.fotos;
create policy fotos_atualizar on public.fotos for update to authenticated
  using (
    public.eh_equipe(empresa_id)
    and (relatorio_id is null or public.pode_editar_relatorio(relatorio_id))
  )
  with check (
    public.eh_equipe(empresa_id)
    and (relatorio_id is null or public.pode_editar_relatorio(relatorio_id))
  );

drop policy if exists fotos_excluir on public.fotos;
create policy fotos_excluir on public.fotos for delete to authenticated
  using (
    public.eh_equipe(empresa_id)
    and (relatorio_id is null or public.pode_editar_relatorio(relatorio_id))
  );

-- ----------------------------------------------------------- documentos ----
drop policy if exists documentos_ler on public.documentos;
create policy documentos_ler on public.documentos for select to authenticated
  using (
    public.eh_equipe(empresa_id)
    or (visivel_cliente and public.eh_cliente_da_obra(obra_id))
  );

drop policy if exists documentos_inserir on public.documentos;
create policy documentos_inserir on public.documentos for insert to authenticated
  with check (public.eh_equipe(empresa_id));

drop policy if exists documentos_atualizar on public.documentos;
create policy documentos_atualizar on public.documentos for update to authenticated
  using (public.eh_equipe(empresa_id))
  with check (public.eh_equipe(empresa_id));

drop policy if exists documentos_excluir on public.documentos;
create policy documentos_excluir on public.documentos for delete to authenticated
  using (public.eh_equipe(empresa_id));
