-- Obtra — cria o seu acesso MASTER.
-- Troque os 3 valores entre aspas (e-mail, senha com 8+ caracteres, seu nome) e clique Run.
select admin_criar_usuario(
  'seu-email@dominio.com',   -- e-mail de login
  'TroqueEstaSenha123',      -- senha
  'Seu Nome',                -- nome que aparece no sistema
  'master',
  null
);
