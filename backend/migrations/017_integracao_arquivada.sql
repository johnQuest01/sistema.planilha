-- Arquivar planilha UNIFICADA (integração/Oficina): mesma ideia da coluna
-- arquivada em colecoes (016). Quando arquivada, some para todo mundo (lista da
-- Home e abertura por URL) EXCETO o dono do workspace (config.workspaceOwnerEmail),
-- que é o único que enxerga para desarquivar.

alter table integracoes add column if not exists arquivada boolean not null default false;

-- Consulta comum: listar por conta filtrando arquivadas.
create index if not exists integracoes_conta_arquivada_idx on integracoes (conta_id, arquivada);
