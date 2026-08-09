-- 021: permitir apagar usuário (remover acesso) sem estourar FK.
-- Autoria em planilhas/registros/integrações vira NULL; o histórico de dados fica.
-- (A rota de delete também faz o UPDATE antes do DELETE; isto deixa o schema certo.)

alter table colecoes drop constraint if exists colecoes_criado_por_fkey;
alter table colecoes
  add constraint colecoes_criado_por_fkey
  foreign key (criado_por) references usuarios(id) on delete set null;

alter table registros drop constraint if exists registros_criado_por_id_fkey;
alter table registros
  add constraint registros_criado_por_id_fkey
  foreign key (criado_por_id) references usuarios(id) on delete set null;

alter table integracoes drop constraint if exists integracoes_criado_por_fkey;
alter table integracoes
  add constraint integracoes_criado_por_fkey
  foreign key (criado_por) references usuarios(id) on delete set null;
