-- Obtra — corrige e-mail, senha e nome do master criado com os valores de exemplo.
-- Troque SÓ as 3 linhas marcadas com  <-- TROQUE  e clique Run.
do $$
declare
  v_email_novo text := 'seu-email-verdadeiro@gmail.com';   -- <-- TROQUE (seu e-mail de login)
  v_senha_nova text := 'SuaSenhaForte123';                  -- <-- TROQUE (mínimo 6 caracteres)
  v_nome_novo  text := 'Seu Nome';                          -- <-- TROQUE (nome que aparece no sistema)
  v_id uuid;
begin
  v_email_novo := lower(trim(v_email_novo));

  select id into v_id from auth.users where lower(email) = 'seu-email@dominio.com';
  if v_id is null then
    raise exception 'Não achei o usuário seu-email@dominio.com — talvez já tenha sido corrigido.';
  end if;
  if v_email_novo = 'seu-email-verdadeiro@gmail.com' or v_senha_nova = 'SuaSenhaForte123' then
    raise exception 'Você esqueceu de trocar o e-mail ou a senha nas linhas marcadas com TROQUE.';
  end if;
  if length(v_senha_nova) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email_novo and id <> v_id) then
    raise exception 'O e-mail % já está em uso por outro usuário.', v_email_novo;
  end if;

  update auth.users
     set email = v_email_novo,
         encrypted_password = extensions.crypt(v_senha_nova, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', v_nome_novo),
         updated_at = now()
   where id = v_id;

  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', v_email_novo),
         updated_at = now()
   where user_id = v_id and provider = 'email';

  update public.perfis set nome = v_nome_novo, email = v_email_novo where id = v_id;

  raise notice 'Pronto! Master agora entra com %', v_email_novo;
end $$;

select email, nome, papel from public.perfis where papel = 'master';
