-- 015: link de compartilhamento CURTO e gerenciável.
-- Em vez do token gigante assinado no PATH (/api/publico/r/<token base64url>), o
-- link agora é um CÓDIGO curto e aleatório (o código é o segredo) guardado aqui.
-- Ganhos: URL curta/bonita e possibilidade de REVOGAR um link específico.
create table compartilhamentos (
  codigo       text primary key,                    -- curto, aleatório, NUNCA sequencial (é o segredo)
  conta_id     uuid not null references contas(id) on delete cascade,
  registro_id  uuid not null references registros(id) on delete cascade,
  blocos       jsonb not null,                       -- array de ids de campos, ou "*" = todos
  expira_em    timestamptz,                          -- null = nunca expira
  revogado_em  timestamptz,
  criado_por   text,
  criado_em    timestamptz not null default now()
);
create index on compartilhamentos (registro_id);
create index on compartilhamentos (conta_id);

alter table compartilhamentos enable row level security;
alter table compartilhamentos force row level security;

-- LEITURA pública por código: a rota pública resolve por igualdade EXATA do código
-- (que é o segredo) e não expõe a tabela para varredura; os dados reais do registro
-- seguem protegidos pela RLS de `registros` via comConta(). Por isso o SELECT é
-- liberado aqui (o Neon não dá BYPASSRLS/superuser para uma função contornar o FORCE).
create policy compart_select_publico on compartilhamentos
  for select using (true);

-- ESCRITA/gestão (criar, revogar) só da conta dona — mesmo padrão das demais tabelas.
create policy compart_conta on compartilhamentos
  for all
  using (conta_id = current_setting('app.conta_id', true)::uuid)
  with check (conta_id = current_setting('app.conta_id', true)::uuid);
