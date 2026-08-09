# Atualização — multi-conta + acesso por token no login

Texto original dos pedidos no fim. Abaixo, organizado para executar e releitura.

---

## Objetivo

1. Cada pessoa pode ter **sua própria conta (workspace)** com dados isolados.
2. Quem já tem conta própria pode, **no login**, colar um **token do admin** e
   **pedir acesso** às planilhas da conta do admin — sem perder a conta própria.
3. Admin **aprova / recusa** pedidos, **revoga acesso** e **invalida tokens**
   (quem usou aquele token perde o acesso na hora).

---

## Dois caminhos no cadastro + token no login

| Momento | O que acontece |
|---|---|
| **Criar minha conta** | Workspace novo + usuário `dono`. |
| **Cadastro com token** | Entra como `membro` nativo na conta do admin (home = essa conta). |
| **Login + token** (já tem conta) | Cria pedido `pendente` na conta do admin; home continua a própria. Admin aprova → pode trocar de conta no topo. |

---

## Segurança do vínculo

- Tabela `conta_membros` (mig. `022`): `pendente` | `ativo` | `revogado`.
- Sessão aponta para a **conta ativa**; convidado nunca é admin da conta alheia.
- Token padrão: **7 dias**, **1 uso**; revogar token derruba membros ligados a ele + sessões.
- Após revogar acesso, a pessoa precisa de token válido para **pedir de novo**.

---

## Checklist

- [x] Migration `022_conta_membros`
- [x] Login com token + pedir acesso + aprovar/recusar
- [x] Trocar conta no topo + Config (pedidos)
- [x] Revogar token invalida acesso; remover convidado não apaga a conta dele

---

## Regras

- **NÃO** apagar banco / dados existentes.
- Contas nunca compartilham dados — RLS por `conta_id` da sessão.
- E-mail de usuário continua **único** no sistema.

---

## Texto original (preservado)

agora crie um o seguinte, schema migrations para banco de dados, para que outros usuarios possa criar conta e ter seu proprio ambinete seus dados suas senha seu sistema de planilhas, sem que conflite com outras contas de usauarios, e entenda bem ( esta conta precisa continuar dando acesso a usuarios que estão nela, criando a logica segura que admin dono da conta, ao gerar token, dou o token para usuario ele coloca no campo que pede token ao criar conta entra e tem acesso a minha conta com inforamções e tudo da conta, e para quem quer criar conta ira criar conta para ter sua conta separadas suas informações seus dados tudo sem NUNCA conflitar com outras contas, e este sera admin da propria conta, podendo gerar tokens para outros usuarios terem acesso a sua conta planilhas e informações, más so ele tera acessoa engrenagem restaurar lixeira de planilhas apagadas e apagar definitivo, e remover usaurios tirando seu acesso ok ?

ao logar crie area para colocar token para entrar em conta que admin deu token para este usuario mesmo ele tendo conta e seu proprio acesso a seus dados e sua area de planilha e conta, ele podera entrar com token que admin deu para ele ter acesso a conta do admin e seus dados planilhas, crie um sistema hiperseguro que ao usuario colocar token do admin na area de logar para ter acesso ao ambiente da conta do adimin com suas planilhas possa pedir permissão para o admin novamente, adimin podendo revogar o acesso e invalidar token
