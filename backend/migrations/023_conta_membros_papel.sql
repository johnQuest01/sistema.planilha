-- 023: papel efetivo do convidado na conta (membro | dono).
-- Permite passar autoridade de admin a quem pediu acesso por token.

alter table conta_membros
  add column if not exists papel text not null default 'membro';

alter table conta_membros drop constraint if exists conta_membros_papel_check;
alter table conta_membros
  add constraint conta_membros_papel_check
  check (papel in ('membro', 'dono'));
