-- Lixeira de registros: soft-delete com snapshot completo (valores + metadados).
-- Fotos ficam no R2 enquanto estiverem na lixeira (restauráveis).
-- Apagar definitivo remove a linha daqui E as keys do R2 na hora.

create table if not exists lixeira_registros (
  id               uuid primary key default gen_random_uuid(),
  conta_id         uuid not null references contas(id) on delete cascade,
  colecao_id       uuid not null,
  colecao_nome     text not null default '',
  registro_id      uuid not null,
  valores          jsonb not null default '{}'::jsonb,
  criado_por       text,
  criado_por_id    uuid,
  criado_em        timestamptz not null,
  atualizado_em    timestamptz not null,
  apagado_em       timestamptz not null default now(),
  apagado_por_id   uuid,
  apagado_por_nome text
);

create index if not exists lixeira_registros_conta_apagado_idx
  on lixeira_registros (conta_id, apagado_em desc);

create index if not exists lixeira_registros_colecao_idx
  on lixeira_registros (colecao_id);

alter table lixeira_registros enable row level security;
alter table lixeira_registros force row level security;

drop policy if exists conta_isola on lixeira_registros;
create policy conta_isola on lixeira_registros
  using      (conta_id = current_setting('app.conta_id', true)::uuid)
  with check (conta_id = current_setting('app.conta_id', true)::uuid);
