-- Rastreio de órfãos no R2 (seção 6.4). Remover uma foto do array tira a key do
-- jsonb e deixaria dois objetos no bucket pra sempre. Em vez de delete síncrono no
-- PATCH (que apagaria a foto se o registro falhasse depois), grava-se a INTENÇÃO:
-- o comando `npm run limpar-r2 -w backend` apaga do bucket o que está aqui há mais
-- de 7 dias (cheia + _t) e marca limpo_em.
--
-- Fica FORA da RLS de conta: é fila de manutenção, escrita dentro do comConta e lida
-- por um script sem contexto de conta. Não referencia dado sensível — só a key.
create table lixo_r2 (
  key        text primary key,
  motivo     text not null,
  criado_em  timestamptz not null default now(),
  limpo_em   timestamptz
);
create index on lixo_r2 (limpo_em);
