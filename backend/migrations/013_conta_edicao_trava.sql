-- Alavanca de edição por conta (workspace): fica salva no servidor para
-- persistir entre aparelhos/sessões. Padrão: TRAVADA (false) — mais seguro.
alter table contas add column if not exists edicao_liberada boolean not null default false;
