-- Corpo (blocos) PRÓPRIO por registro. Quando NULL, o registro herda o corpo
-- compartilhado da coleção (tabela campos). Quando preenchido (array de blocos
-- em jsonb), o registro tem estrutura independente: editar/adicionar/remover
-- blocos nele não afeta os demais registros da coleção.
alter table registros add column if not exists campos jsonb;

-- A lixeira precisa preservar o corpo próprio do registro para restaurá-lo igual
-- (senão, ao restaurar, ele voltaria herdando o corpo da coleção e perderia os
-- blocos que tinha). NULL = registro que herdava o corpo da coleção.
alter table lixeira_registros add column if not exists campos jsonb;
