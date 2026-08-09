# Atualização 2 — etapas (organizado)

Texto original preservado no fim. Ordem de entrega abaixo.

---

## Regras gerais

- **NÃO** apagar banco / dados existentes.
- App continua **rápido** (sem gargalo em massa / troca de conta).
- Segurança: SQL parametrizado, rate limit, RLS, senha com hash.

---

## Etapa A — Troca de conta ao vivo

**Pedido:** ao alternar entre “minha conta” e “conta do admin” (após token
aprovado), a tela atualiza **ao vivo** (dados da conta ativa).

**Entrega:**
- [x] Ao trocar conta: limpar cache, recarregar listas, reconectar WS da conta nova
- [x] UI refletir planilhas/presença da conta ativa sem precisar F5

---

## Etapa B — Passar / remover autoridade de admin

**Pedido:** admin pode passar papel de admin para qualquer usuário (inclusive
quem pediu acesso por token no login). Admin pode remover acesso de admin
(desde que não fique sem nenhum admin).

**Entrega:**
- [x] API: promover a `dono` / rebaixar a `membro` (nativo ou convidado ativo)
- [x] Convidado promovido: papel efetivo `dono` na conta convidada (mig. 023)
- [x] UI Config: botões “Tornar admin” / “Tirar admin”
- [x] Impedir remover o último admin da conta

---

## Etapa C — Link compartilhável do app

**Pedido:** compartilhar link para pessoas **criarem conta** ou **entrarem com
token**.

**Entrega:**
- [x] URL tipo `/entrar?token=MOST-XXXX-XXXX` (pré-preenche token)
- [x] Config: “copiar link (login)” / “copiar link (criar conta)”
- [x] Cadastro/login abrem já no modo certo (`&cadastro=1`)

---

## Etapa D — Login mais seguro (confirmação + hardening)

**Pedido:** confirmação de senha (2× no cadastro); proteção contra SQL injection,
brute force, ataques; RLS; não esquecer funções de segurança.

**Entrega:**
- [x] Cadastro: campo “Confirmar senha” (senha === confirmação)
- [x] Rate limit auth (10/min entrar/registrar/pre-pedido; 30/min olhar-token)
- [x] Queries parametrizadas (`sql\`\``), cookies httpOnly assinados, argon2, RLS
- [x] Checklist: injection → params; brute force → rate limit; sessão → cookie
  assinado; multi-tenant → RLS + `conta_id` da sessão

---

## Etapa E — Importar fotos em massa (até 100) sem travar

**Pedido:** importação em massa aceitar **até ~100 fotos**, app rápido, sem
gargalo.

**Entrega:**
- [x] Limite 100 + paralelismo controlado (3 registros)
- [x] Progresso visível; UI não congela
- [x] Mesma lógica de renomear + encaixar no campo certo

---

## Etapa F — Conversão na tela inicial (home)

**Pedido:** na home, escolher planilha(s), jogar fotos renomeadas com nome das
referências; fotos caem no campo certo — **igual** à lógica já usada dentro da
planilha no import em massa.

**Entrega:**
- [x] Ação na Home: “Converter fotos”
- [x] Escolher uma ou várias coleções
- [x] Reutilizar `importarNaColecao` (matching por referência)

---

## Ordem sugerida de implementação

1. A (troca ao vivo)  
2. B (passar admin)  
3. C (link)  
4. D (confirmação senha + segurança)  
5. E (100 fotos)  
6. F (conversão na home)

---

## Texto original (preservado)

agora preciso que a tela possa ser ao vivo que ao trocar entre contas quando usuario recebe token e validação possa atualizar ao vivo ao transitar por contas a minha e a do admin ok ?, e quero passar autoridade de amin para qualquer usuario (admin pode remover acesso de admi , posso passar acesso de amin até para quem pediu token na area de login) e crie logica para que eu possa compartilhar link do app para que pessoas possam logar e criar conta ou entrar com token de acesso, crie sistema de login confirmação de senha duas vezes, sistema de login precisa ser seguro contra injetion SQL, contra brute force, contra ataques hackers RL implementado banco de dados seguro tudo seguro caso se esqueça de alguma função para implementar e corrigir, leia o arquivo @sistema.planilha-main/atualizacao.2.MD novamente, veja se ao importar fotos se aceita bastante fotos em massa precisa soportar até 100 fotos, app não pode dar gargalo precisa continuar rapido carregamento rapido, coloque função de conversão na tela incial para que possa escolher planilhas, e jogar fotos renoemadas com nome das referencias e fotos cair no campo certo como ja esta acontecendo dentro de planilhas ao colocar fotos em massa com logica que renomeia e joga no lugar certo
