# Atualização — multi-conta (workspaces isolados)

Texto original do pedido no fim. Abaixo, organizado para executar e releitura.

---

## Objetivo

Cada pessoa pode ter **sua própria conta (workspace)** com dados, senhas e
planilhas **isolados** — sem nunca misturar com outras contas.

A conta atual (Bruno / equipe) **continua funcionando**: quem já está nela
permanece; o admin gera **tokens** para novos usuários entrarem nela.

---

## Dois caminhos no cadastro

| Caminho | O que acontece |
|---|---|
| **Criar minha conta** | Cria um workspace novo + usuário `dono` (admin dessa conta). Dados 100% separados. |
| **Tenho um token** | Coloca o token no cadastro → entra como `membro` na conta do admin que gerou o token (vê planilhas/info dessa conta). |

Login continua por e-mail + senha do **usuário** (tabela `usuarios`). Isolamento
de dados = `conta_id` + RLS (já existia).

---

## Papéis na conta

| Papel | Quem | Pode |
|---|---|---|
| **`dono` (admin)** | Quem criou a conta, ou o dono já existente | Engrenagem (Config), gerar/revogar tokens, listar/remover usuários, restaurar lixeira, apagar definitivo, senhas de planilha/usuários, arquivar |
| **`membro`** | Entrou com token | Usar planilhas, preencher, criar o que a conta permitir — **sem** Config, **sem** lixeira (restaurar/apagar definitivo), **sem** remover gente |

---

## Tokens de convite (seguro)

1. Admin abre Config → gera token (código curto; o código é o segredo).
2. Entrega o token (WhatsApp etc.).
3. Novo usuário: Criar conta → “Tenho token” → cola o token → vira membro daquela conta.
4. Admin pode revogar tokens; tokens podem ter validade / limite de usos.

**Compatibilidade:** o código de convite antigo da conta Bruno (`codigo_convite_hash`)
continua válido para entrar na conta atual.

---

## Checklist de entrega

- [x] Organizar este arquivo
- [x] Migration `020` (`convites_conta` + `contas.nome`)
- [x] API: criar conta / join por token / tokens CRUD / remover usuário
- [x] Permissões: lixeira e Config só `dono`
- [x] UI: Entrar (dois caminhos) + Config (tokens + remover) + esconder lixeira de membro
- [x] Conta atual preservada (sem apagar dados)

---

## Regras

- **NÃO** apagar banco / dados existentes.
- Contas nunca compartilham `conta_id` — RLS impede vazamento.
- E-mail de usuário continua **único** no sistema (uma pessoa = um login).

---

## Texto original (preservado)

agora crie um o seguinte, schema migrations para banco de dados, para que outros usuarios possa criar conta e ter seu proprio ambinete seus dados suas senha seu sistema de planilhas, sem que conflite com outras contas de usauarios, e entenda bem ( esta conta precisa continuar dando acesso a usuarios que estão nela, criando a logica segura que admin dono da conta, ao gerar token, dou o token para usuario ele coloca no campo que pede token ao criar conta entra e tem acesso a minha conta com inforamções e tudo da conta, e para quem quer criar conta ira criar conta para ter sua conta separadas suas informações seus dados tudo sem NUNCA conflitar com outras contas, e este sera admin da propria conta, podendo gerar tokens para outros usuarios terem acesso a sua conta planilhas e informações, más so ele tera acessoa engrenagem restaurar lixeira de planilhas apagadas e apagar definitivo, e remover usaurios tirando seu acesso ok ?
