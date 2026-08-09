import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client';
import { gerarHash, conferirSenha } from '../auth/senha';
import { NOME_COOKIE_SESSAO, opcoesLimpar, opcoesSessao } from '../auth/cookies';
import { exigeDono, usuarioObrigatorio, contaObrigatoria } from '../auth/exigeDono';
import {
  criarSessao,
  revogarSessao,
  revogarSessoesDoUsuario,
  revogarSessoesDoUsuarioNaConta,
} from '../auth/sessoes';
import { registrarEntrada } from '../repositorios/presenca';
import {
  anunciarEntradaWs,
  anunciarPedidoAcessoWs,
  expulsarUsuarioWs,
} from '../ws/presencaHub';
import { workspaceContaId, workspaceCodigoHash } from '../auth/workspace';
import {
  criarConviteConta,
  consumirConviteConta,
  listarConvitesConta,
  acharConviteConta,
  revogarConviteConta,
} from '../repositorios/convitesConta';
import {
  aprovarAcesso,
  listarContasDoUsuario,
  listarMembrosConvidados,
  listarPedidosPendentes,
  membroAtivo,
  nomeConta as nomeDaConta,
  pedirAcessoConta,
  revogarAcessoMembro,
  revogarMembrosDoToken,
  statusMembro,
} from '../repositorios/contaMembros';
import {
  credenciaisSchema,
  registrarSchema,
  codigoConviteSchema,
  senhaUsuarioSchema,
  criarTokenConviteSchema,
} from '../validacao/credenciais';
import { paramsIdSchema } from '../validacao/params';

const limiteAuth = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
const limiteOlhar = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

const entrarSchema = credenciaisSchema
  .extend({
    /** Token do admin: pede/entra na conta dele sem abandonar a conta própria. */
    token: z.string().trim().max(200).optional(),
  })
  .strict();

const trocarContaSchema = z
  .object({ contaId: z.string().uuid() })
  .strict();

const olharTokenSchema = z
  .object({ token: z.string().trim().min(4).max(200) })
  .strict();

const prePedidoSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    token: z.string().trim().min(4).max(200),
  })
  .strict();

/**
 * Resolve token → pedido de acesso.
 * Se o pré-pedido já gastou o uso (1/1), quem já está pendente/ativo ainda entra —
 * não exige token "disponível" de novo.
 */
async function aplicarTokenAcesso(
  usuario: { id: string; nome: string; email: string; conta_id: string },
  tokenLimpo: string,
): Promise<
  | {
      ok: true;
      pedido: { status: 'pendente' | 'ativo'; contaId: string; contaNome: string };
      jaAtivo: boolean;
    }
  | { ok: false; erro: string; code: number }
> {
  const convite = await acharConviteConta(tokenLimpo);

  if (convite === null) {
    // Código permanente legado (Bruno).
    const codigoHash = await workspaceCodigoHash();
    if (codigoHash === null || !(await conferirSenha(codigoHash, tokenLimpo))) {
      return { ok: false, erro: 'token inválido, expirado ou já usado', code: 403 };
    }
    const cid = await workspaceContaId();
    if (cid === usuario.conta_id) {
      return { ok: false, erro: 'este token é da sua própria conta', code: 400 };
    }
    const st = await statusMembro(cid, usuario.id);
    const r = await pedirAcessoConta(cid, usuario.id, 'codigo-legado');
    const cn = await nomeDaConta(cid);
    if (r.status === 'pendente' && (st === null || st === 'revogado')) {
      anunciarPedidoAcessoWs(cid, {
        usuarioId: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
      });
    }
    return {
      ok: true,
      pedido: { status: r.status === 'ativo' ? 'ativo' : 'pendente', contaId: cid, contaNome: cn },
      jaAtivo: r.jaAtivo,
    };
  }

  if (convite.revogadoEm !== null) {
    return { ok: false, erro: 'token revogado pelo admin', code: 403 };
  }
  if (convite.contaId === usuario.conta_id) {
    return { ok: false, erro: 'este token é da sua própria conta', code: 400 };
  }

  const st = await statusMembro(convite.contaId, usuario.id);
  const cn = await nomeDaConta(convite.contaId);

  // Já pediu ou já foi aprovado: não precisa gastar o token de novo.
  if (st === 'ativo') {
    return {
      ok: true,
      pedido: { status: 'ativo', contaId: convite.contaId, contaNome: cn },
      jaAtivo: true,
    };
  }
  if (st === 'pendente') {
    anunciarPedidoAcessoWs(convite.contaId, {
      usuarioId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
    });
    return {
      ok: true,
      pedido: { status: 'pendente', contaId: convite.contaId, contaNome: cn },
      jaAtivo: false,
    };
  }

  // Primeiro pedido (ou após revogação): exige token ainda disponível.
  if (!convite.disponivel) {
    return {
      ok: false,
      erro: 'token inválido, expirado ou já usado — peça um token novo ao admin',
      code: 403,
    };
  }
  const gasto = await consumirConviteConta(tokenLimpo);
  if (gasto === null) {
    return { ok: false, erro: 'token inválido, expirado ou já usado', code: 403 };
  }
  const r = await pedirAcessoConta(convite.contaId, usuario.id, convite.token);
  if (r.status === 'pendente') {
    anunciarPedidoAcessoWs(convite.contaId, {
      usuarioId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
    });
  }
  return {
    ok: true,
    pedido: {
      status: r.status === 'ativo' ? 'ativo' : 'pendente',
      contaId: convite.contaId,
      contaNome: cn,
    },
    jaAtivo: r.jaAtivo,
  };
}

function ehAdminConta(papel: string): boolean {
  return papel === 'dono';
}

function corpoUsuario(u: {
  id: string;
  nome: string;
  email: string;
  papel: string;
  contaId?: string;
  contaHomeId?: string;
  contaNome?: string;
  pedido?: { status: 'pendente' | 'ativo'; contaId: string; contaNome: string } | null;
}): {
  id: string;
  nome: string;
  email: string;
  papel: string;
  podeGerirSenhas: boolean;
  contaId?: string;
  contaHomeId?: string;
  contaNome?: string;
  pedido?: { status: 'pendente' | 'ativo'; contaId: string; contaNome: string } | null;
} {
  const admin = ehAdminConta(u.papel);
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    podeGerirSenhas: admin,
    contaId: u.contaId,
    contaHomeId: u.contaHomeId,
    contaNome: u.contaNome,
    pedido: u.pedido ?? null,
  };
}

async function abrirSessao(
  reply: FastifyReply,
  usuarioId: string,
  contaId: string,
  nome: string,
): Promise<void> {
  const sessaoId = await criarSessao(usuarioId, contaId);
  reply.setCookie(NOME_COOKIE_SESSAO, sessaoId, opcoesSessao());
  const entrada = await registrarEntrada(usuarioId, contaId, nome);
  void anunciarEntradaWs(contaId, entrada);
}

export async function rotasAuth(app: FastifyInstance): Promise<void> {
  // Cadastro dual:
  // - COM token → membro na conta do admin (home = essa conta);
  // - SEM token → cria workspace novo e vira dono.
  app.post('/api/auth/registrar', limiteAuth, async (req, reply) => {
    const { nome, email, senha, token, nomeConta } = registrarSchema.parse(req.body);

    const existentes = await sql<{ id: string }[]>`select id from usuarios where email = ${email}`;
    if (existentes.length > 0) {
      return reply.code(409).send({
        erro:
          'e-mail já cadastrado — faça login e, se tiver token do admin, cole no campo Token na tela de entrar',
      });
    }

    const senhaHash = await gerarHash(senha);
    let contaId: string;
    let papel: 'dono' | 'membro';

    if (token !== '') {
      const viaToken = await consumirConviteConta(token);
      if (viaToken !== null) {
        contaId = viaToken;
        papel = 'membro';
      } else {
        const codigoHash = await workspaceCodigoHash();
        if (codigoHash === null || !(await conferirSenha(codigoHash, token))) {
          return reply.code(403).send({ erro: 'token ou código de convite inválido' });
        }
        contaId = await workspaceContaId();
        papel = 'membro';
      }

      const linhas = await sql<{ id: string }[]>`
        insert into usuarios (conta_id, nome, email, senha_hash, papel)
        values (${contaId}, ${nome}, ${email}, ${senhaHash}, ${papel})
        returning id`;
      const usuario = linhas[0];
      if (usuario === undefined) throw new Error('insert de usuario não retornou linha');

      await abrirSessao(reply, usuario.id, contaId, nome);
      const cn = await nomeDaConta(contaId);
      return reply.code(201).send(
        corpoUsuario({
          id: usuario.id,
          nome,
          email,
          papel,
          contaId,
          contaHomeId: contaId,
          contaNome: cn,
        }),
      );
    }

    const nomeWs = (nomeConta ?? nome).slice(0, 80);
    const contasEmail = await sql<{ id: string }[]>`select id from contas where email = ${email}`;
    if (contasEmail.length > 0) {
      return reply.code(409).send({ erro: 'já existe uma conta com este e-mail' });
    }

    const criadas = await sql<{ id: string }[]>`
      insert into contas (email, senha_hash, nome)
      values (${email}, ${senhaHash}, ${nomeWs})
      returning id`;
    const conta = criadas[0];
    if (conta === undefined) throw new Error('insert de conta não retornou linha');
    contaId = conta.id;
    papel = 'dono';

    const linhas = await sql<{ id: string }[]>`
      insert into usuarios (conta_id, nome, email, senha_hash, papel)
      values (${contaId}, ${nome}, ${email}, ${senhaHash}, ${papel})
      returning id`;
    const usuario = linhas[0];
    if (usuario === undefined) throw new Error('insert de usuario não retornou linha');

    await abrirSessao(reply, usuario.id, contaId, nome);
    return reply.code(201).send(
      corpoUsuario({
        id: usuario.id,
        nome,
        email,
        papel,
        contaId,
        contaHomeId: contaId,
        contaNome: nomeWs,
      }),
    );
  });

  // Login: e-mail+senha. Token opcional → pede acesso à conta do admin (ou entra se já ativo).
  app.post('/api/auth/entrar', limiteAuth, async (req, reply) => {
    const { email, senha, token } = entrarSchema.parse(req.body);

    const linhas = await sql<
      { id: string; conta_id: string; nome: string; senha_hash: string; papel: string }[]
    >`select id, conta_id, nome, senha_hash, papel from usuarios where email = ${email}`;
    const usuario = linhas[0];

    if (usuario === undefined || !(await conferirSenha(usuario.senha_hash, senha))) {
      return reply.code(401).send({ erro: 'credenciais inválidas' });
    }

    let contaSessao = usuario.conta_id;
    let papelSessao: 'dono' | 'membro' =
      usuario.papel === 'dono' ? 'dono' : 'membro';
    let pedido: {
      status: 'pendente' | 'ativo';
      contaId: string;
      contaNome: string;
    } | null = null;

    const tokenLimpo = (token ?? '').trim();
    if (tokenLimpo !== '') {
      const r = await aplicarTokenAcesso(
        {
          id: usuario.id,
          nome: usuario.nome,
          email,
          conta_id: usuario.conta_id,
        },
        tokenLimpo,
      );
      if (!r.ok) {
        return reply.code(r.code).send({ erro: r.erro });
      }
      pedido = r.pedido;
      if (r.jaAtivo) {
        contaSessao = r.pedido.contaId;
        papelSessao = 'membro';
      }
    }

    await abrirSessao(reply, usuario.id, contaSessao, usuario.nome);
    const cnSessao = await nomeDaConta(contaSessao);
    return reply.send(
      corpoUsuario({
        id: usuario.id,
        nome: usuario.nome,
        email,
        papel: papelSessao,
        contaId: contaSessao,
        contaHomeId: usuario.conta_id,
        contaNome: cnSessao,
        pedido,
      }),
    );
  });

  /** Só olha o token (não gasta uso) — login inteligente mostra o nome da conta. */
  app.post('/api/auth/olhar-token', limiteOlhar, async (req, reply) => {
    const { token } = olharTokenSchema.parse(req.body);
    const convite = await acharConviteConta(token);
    if (convite !== null) {
      if (convite.revogadoEm !== null) {
        return reply.send({
          valido: false,
          disponivel: false,
          esgotado: false,
          revogado: true,
          contaNome: await nomeDaConta(convite.contaId),
        });
      }
      return reply.send({
        // Conhecido = ok para UI (mesmo se o pré-pedido já gastou o uso).
        valido: true,
        disponivel: convite.disponivel,
        esgotado: !convite.disponivel,
        revogado: false,
        contaNome: await nomeDaConta(convite.contaId),
      });
    }
    const codigoHash = await workspaceCodigoHash();
    if (codigoHash !== null && (await conferirSenha(codigoHash, token))) {
      const cid = await workspaceContaId();
      return reply.send({
        valido: true,
        disponivel: true,
        esgotado: false,
        revogado: false,
        contaNome: await nomeDaConta(cid),
      });
    }
    return reply.send({
      valido: false,
      disponivel: false,
      esgotado: false,
      revogado: false,
      contaNome: null,
    });
  });

  /**
   * Antes do "Entrar": e-mail + token → cria/lembra pedido e avisa o admin ao vivo
   * (com o login informado). Senha ainda é exigida no POST /entrar.
   */
  app.post('/api/auth/pre-pedido', limiteAuth, async (req, reply) => {
    const { email, token } = prePedidoSchema.parse(req.body);
    const linhas = await sql<
      { id: string; conta_id: string; nome: string; email: string }[]
    >`select id, conta_id, nome, email from usuarios where email = ${email}`;
    const usuario = linhas[0];
    if (usuario === undefined) {
      return reply.code(404).send({ erro: 'e-mail não cadastrado — crie uma conta primeiro' });
    }
    const r = await aplicarTokenAcesso(
      {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        conta_id: usuario.conta_id,
      },
      token,
    );
    if (!r.ok) {
      return reply.code(r.code).send({ erro: r.erro });
    }
    return reply.send({
      ok: true,
      status: r.pedido.status,
      contaId: r.pedido.contaId,
      contaNome: r.pedido.contaNome,
      jaAtivo: r.jaAtivo,
      email: usuario.email,
      nome: usuario.nome,
    });
  });

  app.post('/api/auth/sair', async (req, reply) => {
    const assinado = req.cookies[NOME_COOKIE_SESSAO];
    if (assinado !== undefined) {
      const conferido = req.unsignCookie(assinado);
      if (conferido.valid && conferido.value !== null) {
        await revogarSessao(conferido.value);
      }
    }
    reply.clearCookie(NOME_COOKIE_SESSAO, opcoesLimpar());
    return reply.send({ ok: true });
  });

  app.get('/api/auth/eu', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    const contaId = contaObrigatoria(req);
    return reply.send(
      corpoUsuario({
        id: u.id,
        nome: u.nome,
        email: u.email,
        papel: u.papel,
        contaId,
        contaHomeId: u.contaHomeId,
        contaNome: u.contaNome,
      }),
    );
  });

  /** Contas que o usuário pode abrir (home + convidadas). */
  app.get('/api/auth/contas', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    const lista = await listarContasDoUsuario(u.id);
    return reply.send(lista);
  });

  /** Troca a sessão para outra conta (home ou convidado ativo). */
  app.post('/api/auth/trocar-conta', { preHandler: exigeDono, ...limiteAuth }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    const { contaId } = trocarContaSchema.parse(req.body);
    const homeId = u.contaHomeId ?? contaObrigatoria(req);

    let papel: 'dono' | 'membro' = 'membro';
    if (contaId === homeId) {
      const linhas = await sql<{ papel: string }[]>`
        select papel from usuarios where id = ${u.id}`;
      papel = linhas[0]?.papel === 'dono' ? 'dono' : 'membro';
    } else if (!(await membroAtivo(contaId, u.id))) {
      return reply.code(403).send({ erro: 'sem acesso a esta conta (aguardando aprovação ou revogado)' });
    }

    // Troca limpa: revoga sessão atual e abre outra na conta alvo.
    const assinado = req.cookies[NOME_COOKIE_SESSAO];
    if (assinado !== undefined) {
      const conferido = req.unsignCookie(assinado);
      if (conferido.valid && conferido.value !== null) {
        await revogarSessao(conferido.value);
      }
    }
    await abrirSessao(reply, u.id, contaId, u.nome);
    const cn = await nomeDaConta(contaId);
    return reply.send(
      corpoUsuario({
        id: u.id,
        nome: u.nome,
        email: u.email,
        papel,
        contaId,
        contaHomeId: homeId,
        contaNome: cn,
      }),
    );
  });

  /** Já logado: cola token e pede acesso (sem sair da conta). */
  app.post('/api/auth/pedir-acesso', { preHandler: exigeDono, ...limiteAuth }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    const body = z.object({ token: z.string().trim().min(4).max(200) }).strict().parse(req.body);
    const homeId = u.contaHomeId ?? contaObrigatoria(req);
    const r = await aplicarTokenAcesso(
      {
        id: u.id,
        nome: u.nome,
        email: u.email,
        conta_id: homeId,
      },
      body.token,
    );
    if (!r.ok) {
      return reply.code(r.code).send({ erro: r.erro });
    }
    return reply.send({
      status: r.pedido.status,
      contaId: r.pedido.contaId,
      contaNome: r.pedido.contaNome,
      jaAtivo: r.jaAtivo,
    });
  });

  // Pedidos pendentes (admin).
  app.get('/api/auth/pedidos-acesso', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode ver pedidos' });
    }
    return reply.send(await listarPedidosPendentes(contaObrigatoria(req)));
  });

  app.post<{ Params: { id: string } }>(
    '/api/auth/pedidos-acesso/:id/aprovar',
    { preHandler: exigeDono },
    async (req, reply) => {
      const u = usuarioObrigatorio(req);
      if (!ehAdminConta(u.papel)) {
        return reply.code(403).send({ erro: 'só o admin pode aprovar' });
      }
      const { id } = paramsIdSchema.parse(req.params);
      const ok = await aprovarAcesso(contaObrigatoria(req), id);
      if (!ok) return reply.code(404).send({ erro: 'pedido não encontrado' });
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/auth/pedidos-acesso/:id/recusar',
    { preHandler: exigeDono },
    async (req, reply) => {
      const u = usuarioObrigatorio(req);
      if (!ehAdminConta(u.papel)) {
        return reply.code(403).send({ erro: 'só o admin pode recusar' });
      }
      const { id } = paramsIdSchema.parse(req.params);
      const contaId = contaObrigatoria(req);
      const ok = await revogarAcessoMembro(contaId, id);
      if (!ok) return reply.code(404).send({ erro: 'pedido não encontrado' });
      await revogarSessoesDoUsuarioNaConta(id, contaId);
      expulsarUsuarioWs(contaId, id);
      return reply.send({ ok: true });
    },
  );

  // Lista usuários nativos da conta + convidados ativos.
  app.get('/api/auth/usuarios', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode listar usuários' });
    }
    const contaId = contaObrigatoria(req);
    const linhas = await sql<
      { id: string; nome: string; email: string; papel: string; criado_em: Date }[]
    >`
      select id, nome, email, papel, criado_em
      from usuarios
      where conta_id = ${contaId}
      order by lower(nome), email`;
    const nativos = linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      email: l.email,
      papel: (l.papel === 'dono' ? 'dono' : 'membro') as 'dono' | 'membro',
      criadoEm: l.criado_em.toISOString(),
      origem: 'nativo' as const,
    }));
    const convidados = (await listarMembrosConvidados(contaId)).map((m) => ({
      id: m.usuarioId,
      nome: m.nome ?? '',
      email: m.email ?? '',
      papel: 'membro' as const,
      criadoEm: m.criadoEm,
      origem: 'convidado' as const,
    }));
    // Evita duplicar se alguém for nativo e também estiver na tabela (não deveria).
    const ids = new Set(nativos.map((n) => n.id));
    return reply.send([...nativos, ...convidados.filter((c) => !ids.has(c.id))]);
  });

  // Remove acesso: convidado → só revoga vínculo; nativo → apaga usuário da conta.
  app.delete('/api/auth/usuarios/:id', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode remover usuários' });
    }
    const { id } = paramsIdSchema.parse(req.params);
    const contaId = contaObrigatoria(req);

    if (id === u.id) {
      return reply.code(400).send({ erro: 'você não pode remover a si mesmo' });
    }

    // Convidado (tem conta própria em outro lugar).
    const revogado = await revogarAcessoMembro(contaId, id);
    if (revogado) {
      await revogarSessoesDoUsuarioNaConta(id, contaId);
      expulsarUsuarioWs(contaId, id);
      return reply.send({ ok: true, modo: 'convidado' });
    }

    const alvos = await sql<{ id: string; papel: string }[]>`
      select id, papel from usuarios where id = ${id} and conta_id = ${contaId}`;
    const alvo = alvos[0];
    if (alvo === undefined) {
      return reply.code(404).send({ erro: 'usuário não encontrado' });
    }
    if (alvo.papel === 'dono') {
      const donos = await sql<{ n: string }[]>`
        select count(*)::text as n from usuarios
        where conta_id = ${contaId} and papel = 'dono'`;
      if (Number(donos[0]?.n ?? '0') <= 1) {
        return reply.code(400).send({ erro: 'não dá para remover o único admin da conta' });
      }
    }

    await revogarSessoesDoUsuario(alvo.id);
    try {
      await sql.begin(async (tx) => {
        await tx`update colecoes set criado_por = null where criado_por = ${alvo.id}`;
        await tx`update registros set criado_por_id = null where criado_por_id = ${alvo.id}`;
        await tx`update integracoes set criado_por = null where criado_por = ${alvo.id}`;
        await tx`delete from usuarios where id = ${alvo.id} and conta_id = ${contaId}`;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'falha ao remover usuário';
      return reply.code(500).send({ erro: `não foi possível remover: ${msg}` });
    }

    expulsarUsuarioWs(contaId, alvo.id);
    return reply.send({ ok: true, modo: 'nativo' });
  });

  app.patch('/api/auth/usuarios/:id/senha', { preHandler: exigeDono, ...limiteAuth }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode definir senhas' });
    }
    const { id } = paramsIdSchema.parse(req.params);
    const { senha } = senhaUsuarioSchema.parse(req.body);
    const contaId = contaObrigatoria(req);

    // Só nativos da conta (convidado tem senha da conta própria).
    const alvos = await sql<{ id: string; email: string }[]>`
      select id, email from usuarios where id = ${id} and conta_id = ${contaId}`;
    const alvo = alvos[0];
    if (alvo === undefined) {
      return reply.code(404).send({
        erro: 'usuário não encontrado nesta conta (convidados usam a senha da própria conta)',
      });
    }

    const senhaHash = await gerarHash(senha);
    await sql`update usuarios set senha_hash = ${senhaHash} where id = ${alvo.id}`;
    if (alvo.id !== u.id) {
      await revogarSessoesDoUsuario(alvo.id);
    }
    return reply.send({ ok: true, email: alvo.email });
  });

  app.patch('/api/auth/codigo-convite', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    const contaId = contaObrigatoria(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode trocar o código de convite' });
    }
    const { codigo } = codigoConviteSchema.parse(req.body);
    const hashCodigo = await gerarHash(codigo);
    await sql`update contas set codigo_convite_hash = ${hashCodigo} where id = ${contaId}`;
    return reply.send({ ok: true });
  });

  app.get('/api/auth/tokens-convite', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode ver tokens' });
    }
    const lista = await listarConvitesConta(contaObrigatoria(req));
    return reply.send(lista);
  });

  app.post('/api/auth/tokens-convite', { preHandler: exigeDono, ...limiteAuth }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode gerar tokens' });
    }
    const body = criarTokenConviteSchema.parse(req.body ?? {});
    const convite = await criarConviteConta(contaObrigatoria(req), u.id, {
      rotulo: body.rotulo,
      diasValidade: body.diasValidade,
      maxUsos: body.maxUsos,
    });
    return reply.code(201).send(convite);
  });

  app.delete<{ Params: { token: string } }>(
    '/api/auth/tokens-convite/:token',
    { preHandler: exigeDono },
    async (req, reply) => {
      const u = usuarioObrigatorio(req);
      if (!ehAdminConta(u.papel)) {
        return reply.code(403).send({ erro: 'só o admin da conta pode revogar tokens' });
      }
      const contaId = contaObrigatoria(req);
      const token = decodeURIComponent(req.params.token);
      const ok = await revogarConviteConta(contaId, token);
      if (ok) {
        const afetados = await revogarMembrosDoToken(contaId, token);
        for (const uid of afetados) {
          await revogarSessoesDoUsuarioNaConta(uid, contaId);
          expulsarUsuarioWs(contaId, uid);
        }
      }
      return reply.send({ revogado: ok });
    },
  );
}
