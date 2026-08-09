-- 022: vínculo N:N — usuário com conta própria pode pedir/ter acesso a OUTRA conta
-- (token do admin), sem misturar dados. Sessão aponta para a conta ativa.
--
-- status:
--   pendente  = pediu com token; admin precisa aprovar
--   ativo     = pode trocar para essa conta e ver planilhas
--   revogado  = admin tirou o acesso (pode pedir de novo com token válido)

create table if not exists conta_membros (
  conta_id      uuid not null references contas(id) on delete cascade,
  usuario_id    uuid not null references usuarios(id) on delete cascade,
  status        text not null check (status in ('pendente', 'ativo', 'revogado')),
  token_origem  text references convites_conta(token) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  aprovado_em   timestamptz,
  revogado_em   timestamptz,
  primary key (conta_id, usuario_id)
);

create index if not exists conta_membros_usuario_idx
  on conta_membros (usuario_id);

create index if not exists conta_membros_conta_status_idx
  on conta_membros (conta_id, status);

-- Tokens novos mais seguros por padrão (admin ainda pode sobrescrever na API).
-- Não altera tokens já emitidos.
comment on table conta_membros is
  'Acesso convidado a uma conta alheia; home do usuário continua em usuarios.conta_id';
