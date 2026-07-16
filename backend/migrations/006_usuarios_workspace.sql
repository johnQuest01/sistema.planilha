-- Ambiente compartilhado: várias PESSOAS (usuarios) logam e caem todas na MESMA
-- conta-workspace (a do dono). Antes era 1 conta = 1 login = 1 tenant; agora a
-- conta vira o "espaço" e os usuarios são quem entra nele. Atribuição de quem
-- criou passa a existir em colecoes.criado_por e registros.criado_por_id.

-- 1) Pessoas que logam. Email único global. papel: 'dono' (você) ou 'membro'.
create table if not exists usuarios (
  id          uuid primary key default gen_random_uuid(),
  conta_id    uuid not null references contas(id) on delete cascade,
  nome        text not null,
  email       text not null unique,
  senha_hash  text not null,
  papel       text not null default 'membro' check (papel in ('dono', 'membro')),
  criado_em   timestamptz not null default now()
);
create index if not exists usuarios_conta_idx on usuarios (conta_id);

-- 2) Sessão passa a apontar para o usuario (mantém conta_id para a RLS não mudar).
alter table sessoes add column if not exists usuario_id uuid references usuarios(id) on delete cascade;

-- 3) Código de convite (hash argon2) guardado na conta-workspace. Definido por script.
alter table contas add column if not exists codigo_convite_hash text;

-- 4) Atribuição: quem criou a planilha e quem criou cada registro.
alter table colecoes  add column if not exists criado_por    uuid references usuarios(id);
alter table registros add column if not exists criado_por_id uuid references usuarios(id);

-- 5) Backfill: cada conta existente vira um usuario 'dono'. A conta do Bruno recebe
--    o nome "Bruno"; as demais, o prefixo do e-mail.
insert into usuarios (conta_id, nome, email, senha_hash, papel)
select id,
       case when email = 'brunoacre07@gmail.com' then 'Bruno' else split_part(email, '@', 1) end,
       email, senha_hash, 'dono'
from contas
on conflict (email) do nothing;

-- Vincula sessões vivas ao usuario dono da sua conta (mantém o login atual de pé).
update sessoes s
set usuario_id = u.id
from usuarios u
where u.conta_id = s.conta_id and u.papel = 'dono' and s.usuario_id is null;

-- colecoes/registros têm FORCE RLS: sem app.conta_id, todo UPDATE veria 0 linhas.
-- Desligamos a RLS só para o backfill e religamos em seguida (tudo transacional).
alter table colecoes  disable row level security;
alter table registros disable row level security;

update colecoes c
set criado_por = u.id
from usuarios u
where u.conta_id = c.conta_id and u.papel = 'dono' and c.criado_por is null;

-- No UPDATE ... FROM não se referencia a tabela-alvo (r) dentro de um JOIN; a
-- ligação com colecoes vai no WHERE (vírgula = cross join filtrado).
update registros r
set criado_por_id = u.id
from usuarios u, colecoes c
where c.id = r.colecao_id
  and u.conta_id = c.conta_id
  and u.papel = 'dono'
  and r.criado_por_id is null;

-- Denormaliza o nome de quem criou no texto legado criado_por (usado na exibição).
update registros r
set criado_por = u.nome
from usuarios u
where r.criado_por_id = u.id;

alter table colecoes  enable row level security;
alter table colecoes  force  row level security;
alter table registros enable row level security;
alter table registros force  row level security;
