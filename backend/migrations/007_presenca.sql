-- Presença "ao vivo": última atividade de cada usuario (visto_em) e um log de
-- entradas (logins) para anunciar "Fulano entrou". Sem RLS, como usuarios/sessoes:
-- as rotas filtram por conta_id explicitamente e a auth media o acesso.

alter table usuarios add column if not exists visto_em timestamptz;

create table if not exists entradas (
  id         uuid primary key default gen_random_uuid(),
  conta_id   uuid not null references contas(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  nome       text not null,
  criado_em  timestamptz not null default now()
);
create index if not exists entradas_conta_criado_idx on entradas (conta_id, criado_em desc);
