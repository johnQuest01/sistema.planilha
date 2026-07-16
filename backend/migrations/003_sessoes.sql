-- Sessão de verdade (ver 2.5.3). O cookie passa a carregar `sessoes.id` (opaco,
-- randômico), nunca o `conta_id`. Assim dá pra expirar na base e revogar (logout,
-- troca de senha) — o que o cookie assinado com o conta_id sozinho não permitia.
--
-- `sessoes` fica FORA da RLS de conta (mesma justificativa de `contas` em 002):
-- é a auth que media o acesso, e a própria RLS depende dela. exigeDono consulta
-- esta tabela com `sql` direto, antes de abrir o `comConta`.
create table sessoes (
  id          text primary key,          -- randomBytes(32).toString('base64url')
  conta_id    uuid not null references contas(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  revogado_em timestamptz
);
create index on sessoes (conta_id);
