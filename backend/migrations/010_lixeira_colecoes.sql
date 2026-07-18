-- Lixeira de planilhas (coleções): snapshot completo (campos + registros).
-- Fotos ficam no R2 até apagar definitivo. Restaurar recria a planilha com os mesmos ids.

create table if not exists lixeira_colecoes (
  id               uuid primary key default gen_random_uuid(),
  conta_id         uuid not null references contas(id) on delete cascade,
  colecao_id       uuid not null,
  colecao_nome     text not null default '',
  snapshot         jsonb not null default '{}'::jsonb,
  fotos_referencia jsonb not null default '[]'::jsonb,
  qtd_registros    int not null default 0,
  criado_por       uuid,
  criado_em        timestamptz not null,
  atualizado_em    timestamptz not null,
  apagado_em       timestamptz not null default now(),
  apagado_por_id   uuid,
  apagado_por_nome text
);

create index if not exists lixeira_colecoes_conta_apagado_idx
  on lixeira_colecoes (conta_id, apagado_em desc);

alter table lixeira_colecoes enable row level security;
alter table lixeira_colecoes force row level security;

drop policy if exists conta_isola on lixeira_colecoes;
create policy conta_isola on lixeira_colecoes
  using      (conta_id = current_setting('app.conta_id', true)::uuid)
  with check (conta_id = current_setting('app.conta_id', true)::uuid);
