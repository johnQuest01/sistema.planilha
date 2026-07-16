-- Novos tipos de bloco: 'datahora' (data e hora) e 'secao' (grupo repetível de
-- subcampos). O CHECK inline de 001 fixava a lista antiga; recriamos com os novos.
-- Idempotente: dropa o constraint (nome padrão do Postgres) e recria completo.
alter table campos drop constraint if exists campos_tipo_check;
alter table campos add constraint campos_tipo_check
  check (tipo in
    ('texto','paragrafo','numero','imagem','selecao','data','datahora','booleano','secao'));
