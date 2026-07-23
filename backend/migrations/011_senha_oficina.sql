-- Senha por planilha (Oficina): hash na coleção + liberação por usuário.
-- Quem está na whitelist de e-mails (config) não precisa desbloquear.
-- Demais membros digitam a senha uma vez; o acesso fica em colecao_acessos.

alter table colecoes add column if not exists senha_hash text;

create table if not exists colecao_acessos (
  colecao_id  uuid not null references colecoes(id) on delete cascade,
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  primary key (colecao_id, usuario_id)
);
create index if not exists colecao_acessos_usuario_idx on colecao_acessos (usuario_id);

alter table colecao_acessos enable row level security;
alter table colecao_acessos force row level security;

drop policy if exists conta_isola on colecao_acessos;
create policy conta_isola on colecao_acessos
  using (colecao_id in (
    select id from colecoes where conta_id = current_setting('app.conta_id', true)::uuid))
  with check (colecao_id in (
    select id from colecoes where conta_id = current_setting('app.conta_id', true)::uuid));
