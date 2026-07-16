-- Fase 1 — schema como dado (ver seção 3/4).
-- A definição do campo é LINHA na tabela `campos`; o valor mora num `jsonb` em `registros`.
-- Nada de ALTER TABLE em runtime, nada de EAV.

create extension if not exists "pgcrypto";

-- ---------- tenancy ----------
create table contas (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  senha_hash  text not null,
  criado_em   timestamptz not null default now()
);

-- ---------- a planilha ----------
create table colecoes (
  id          uuid primary key default gen_random_uuid(),
  conta_id    uuid not null references contas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) between 1 and 80),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on colecoes (conta_id);

-- ---------- os blocos (o schema, como dado) ----------
create table campos (
  id          uuid primary key default gen_random_uuid(),
  colecao_id  uuid not null references colecoes(id) on delete cascade,
  nome        text not null check (length(trim(nome)) between 1 and 60),
  tipo        text not null check (tipo in
                ('texto','paragrafo','numero','imagem','selecao','data','booleano')),
  ordem       int  not null default 0,
  config      jsonb not null default '{}'::jsonb,   -- { opcoes?: string[], sufixo?: string, obrigatorio?: boolean }
  criado_em   timestamptz not null default now()
);
create index on campos (colecao_id, ordem);

-- ---------- os dados ----------
create table registros (
  id          uuid primary key default gen_random_uuid(),
  colecao_id  uuid not null references colecoes(id) on delete cascade,
  valores     jsonb not null default '{}'::jsonb,   -- { "<campo_id>": <valor> }
  criado_por  text,                                  -- token do convite, ou 'dono'
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on registros (colecao_id, criado_em desc);
create index on registros using gin (valores jsonb_path_ops);

-- ---------- o link de preenchimento ----------
create table convites (
  token       text primary key,                      -- 32 bytes randomBytes, base64url. NUNCA sequencial.
  colecao_id  uuid not null references colecoes(id) on delete cascade,
  papel       text not null check (papel in ('preencher','ler')),
  expira_em   timestamptz,
  revogado_em timestamptz,
  criado_em   timestamptz not null default now()
);
create index on convites (colecao_id);
