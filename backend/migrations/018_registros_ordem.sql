-- 018: ordem MANUAL dos registros. Até aqui a lista era sempre por criado_em DESC;
-- agora o usuário pode subir/descer um registro. `ordem` é um número (maior = mais
-- no topo). Registros existentes recebem a ordem cronológica atual (epoch do
-- criado_em), então nada muda de lugar até alguém reordenar. Novos registros
-- nascem no topo (default = epoch de agora). A resolução de microssegundos do
-- epoch mantém os valores praticamente únicos, evitando empates na paginação.

alter table registros add column if not exists ordem double precision;

update registros set ordem = extract(epoch from criado_em) where ordem is null;

alter table registros alter column ordem set not null;
alter table registros alter column ordem set default extract(epoch from now());

-- Paginação por cursor agora é (coleção, ordem desc).
create index if not exists idx_registros_colecao_ordem on registros (colecao_id, ordem desc);
