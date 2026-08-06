-- Integração de planilhas: UNIR várias coleções numa "planilha só" na prévia e no
-- preenchimento, casando registros por REFERÊNCIA. É apenas CONFIGURAÇÃO/VISÃO —
-- não altera colecoes/campos/registros. Habilitar/desabilitar (ativo) é só uma
-- alavanca: desabilitar volta cada planilha ao seu estado anterior sem tocar em
-- nenhum dado. Por isso vive numa TABELA NOVA e independente.
--
--   colecao_ids: array ORDENADO de ids de coleção. A ordem define a ordem dos
--                blocos no corpo unificado (ex.: [caderno_hugo, modelagem] -> foto e
--                referência do caderno no topo, blocos da modelagem em seguida).
create table if not exists integracoes (
  id          uuid primary key default gen_random_uuid(),
  conta_id    uuid not null references contas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) between 1 and 80),
  colecao_ids jsonb not null default '[]'::jsonb,
  ativo       boolean not null default false,
  criado_por  uuid references usuarios(id),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_integracoes_conta on integracoes (conta_id, criado_em desc);

-- Mesmo isolamento por conta das demais tabelas do caminho DONO (migration 002).
alter table integracoes enable row level security;
alter table integracoes force row level security;
create policy conta_isola on integracoes
  using      (conta_id = current_setting('app.conta_id', true)::uuid)
  with check (conta_id = current_setting('app.conta_id', true)::uuid);
