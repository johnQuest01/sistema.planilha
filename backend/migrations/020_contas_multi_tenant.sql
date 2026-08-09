-- 020: multi-conta de verdade — cada admin tem seu workspace isolado.
--
-- Já existiam `contas` + `usuarios.conta_id` + RLS. O cadastro, porém, sempre
-- jogava todo mundo na conta do WORKSPACE_OWNER. Esta migration:
--   1) dá nome amigável ao workspace (`contas.nome`);
--   2) cria `convites_conta`: tokens que o DONO gera para outros entrarem
--      na SUA conta (sem misturar dados com outras contas).
--
-- A conta atual (Bruno/equipe) NÃO é alterada nem apagada — só ganha a
-- capacidade de emitir tokens. Novos workspaces nascem no cadastro "Criar minha conta".

alter table contas
  add column if not exists nome text;

-- Backfill: nome = parte do e-mail da conta (só onde ainda estiver null).
update contas
set nome = split_part(email, '@', 1)
where nome is null or btrim(nome) = '';

-- Token de convite POR CONTA. O `token` é o segredo (igual compartilhamentos.codigo):
-- aleatório, não sequencial; quem tem o token entra como membro daquela conta.
-- Fora da RLS de conta — a auth resolve o token e só então cria o usuário.
create table if not exists convites_conta (
  token       text primary key,
  conta_id    uuid not null references contas(id) on delete cascade,
  rotulo      text,
  criado_por  uuid references usuarios(id) on delete set null,
  expira_em   timestamptz,
  revogado_em timestamptz,
  usos        int not null default 0,
  max_usos    int,                          -- null = usos ilimitados
  criado_em   timestamptz not null default now()
);

create index if not exists convites_conta_conta_id_idx on convites_conta (conta_id);

comment on table convites_conta is
  'Tokens gerados pelo dono da conta para outros usuários entrarem nesse workspace';
comment on column contas.nome is
  'Nome amigável do workspace (exibido na Config); não precisa ser único';
