-- 019: compartilhamento de registro UNIDO (várias planilhas / vários registros
-- num único link público). `partes` null = link antigo (1 registro + `blocos`).
-- `partes` = [{ "registroId", "fonte", "blocos": string[] }, ...]
alter table compartilhamentos
  add column if not exists partes jsonb,
  add column if not exists titulo text;

comment on column compartilhamentos.partes is
  'null = link de 1 registro (usa registro_id + blocos); array = link unido multi-planilha';
comment on column compartilhamentos.titulo is
  'Título exibido na página pública (útil no link unido); null = deriva do registro';
