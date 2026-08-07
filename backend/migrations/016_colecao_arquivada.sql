-- Arquivar planilha: quando arquivada, some para todo mundo (lista, abertura,
-- registros, busca) EXCETO o dono do workspace (config.workspaceOwnerEmail), que
-- é o único que consegue ver para desarquivar. É diferente de senha: aqui não há
-- desbloqueio por senha — é ocultação total até o dono desarquivar.

alter table colecoes add column if not exists arquivada boolean not null default false;

-- Consulta comum: listar por conta filtrando arquivadas.
create index if not exists colecoes_conta_arquivada_idx on colecoes (conta_id, arquivada);
