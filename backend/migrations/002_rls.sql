-- RLS: os dois caminhos de auth NÃO compartilham controle de acesso (ver seção 6.1).
--
-- Caminho DONO (estrutura + dados dele): a aplicação abre uma transação e faz
--   `set local app.conta_id = '<uuid>'`. As políticas abaixo filtram TUDO por conta.
--   Como a aplicação conecta com a role dona das tabelas, usamos FORCE ROW LEVEL
--   SECURITY para que a própria role dona também seja submetida às políticas —
--   sem `set local`, `current_setting('app.conta_id', true)` é NULL e nada aparece
--   (deny por padrão).
--
-- Caminho CONVITE (Fase 6): NÃO passa por esta RLS de conta. Vai usar uma ROLE
--   separada, restrita, que só enxerga linhas derivadas do colecao_id do token.
--   Essa role e suas políticas serão criadas na migration da Fase 6 — de propósito
--   não misturamos aqui, pra não juntar credenciais dos dois caminhos no mesmo lugar.

alter table colecoes  enable row level security;
alter table campos    enable row level security;
alter table registros enable row level security;
alter table convites  enable row level security;

alter table colecoes  force row level security;
alter table campos    force row level security;
alter table registros force row level security;
alter table convites  force row level security;

create policy conta_isola on colecoes
  using      (conta_id = current_setting('app.conta_id', true)::uuid)
  with check (conta_id = current_setting('app.conta_id', true)::uuid);

create policy conta_isola on campos
  using (colecao_id in (
    select id from colecoes where conta_id = current_setting('app.conta_id', true)::uuid))
  with check (colecao_id in (
    select id from colecoes where conta_id = current_setting('app.conta_id', true)::uuid));

create policy conta_isola on registros
  using (colecao_id in (
    select id from colecoes where conta_id = current_setting('app.conta_id', true)::uuid))
  with check (colecao_id in (
    select id from colecoes where conta_id = current_setting('app.conta_id', true)::uuid));

create policy conta_isola on convites
  using (colecao_id in (
    select id from colecoes where conta_id = current_setting('app.conta_id', true)::uuid))
  with check (colecao_id in (
    select id from colecoes where conta_id = current_setting('app.conta_id', true)::uuid));
