import type { FastifyInstance } from 'fastify';
import { sql } from '../db/client';
import { config } from '../config';
import { gerarHash, conferirSenha } from '../auth/senha';
import { NOME_COOKIE_SESSAO, opcoesLimpar, opcoesSessao } from '../auth/cookies';
import { exigeDono, usuarioObrigatorio, contaObrigatoria } from '../auth/exigeDono';
import { criarSessao, revogarSessao, revogarSessoesDoUsuario } from '../auth/sessoes';
import { registrarEntrada } from '../repositorios/presenca';
import { workspaceContaId, workspaceCodigoHash } from '../auth/workspace';
import {
  credenciaisSchema,
  registrarSchema,
  codigoConviteSchema,
  senhaUsuarioSchema,
} from '../validacao/credenciais';
import { paramsIdSchema } from '../validacao/params';

// `contas`/`usuarios`/`sessoes` não têm RLS (ver migration 002): a auth media o
// acesso aqui, então falamos direto com `sql`, fora do `comConta`.
// Aperto por IP nas rotas que fazem argon2, que é memory-hard (ver 2.5.4).
const limiteAuth = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

function podeGerirSenhas(email: string): boolean {
  return email.trim().toLowerCase() === config.workspaceOwnerEmail;
}

function corpoUsuario(u: {
  id: string;
  nome: string;
  email: string;
  papel: string;
}): { id: string; nome: string; email: string; papel: string; podeGerirSenhas: boolean } {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    podeGerirSenhas: podeGerirSenhas(u.email),
  };
}

export async function rotasAuth(app: FastifyInstance): Promise<void> {
  // Cadastro: entra no workspace compartilhado como 'membro', exige código de convite.
  app.post('/api/auth/registrar', limiteAuth, async (req, reply) => {
    const { nome, email, senha, codigo } = registrarSchema.parse(req.body);

    const codigoHash = await workspaceCodigoHash();
    if (codigoHash === null) {
      return reply.code(503).send({ erro: 'cadastro indisponível: código de convite não configurado' });
    }
    if (!(await conferirSenha(codigoHash, codigo))) {
      return reply.code(403).send({ erro: 'código de convite inválido' });
    }

    const existentes = await sql<{ id: string }[]>`select id from usuarios where email = ${email}`;
    if (existentes.length > 0) {
      return reply.code(409).send({ erro: 'e-mail já cadastrado' });
    }

    const contaId = await workspaceContaId();
    const senhaHash = await gerarHash(senha);
    const linhas = await sql<{ id: string }[]>`
      insert into usuarios (conta_id, nome, email, senha_hash, papel)
      values (${contaId}, ${nome}, ${email}, ${senhaHash}, 'membro') returning id`;
    const usuario = linhas[0];
    if (usuario === undefined) throw new Error('insert de usuario não retornou linha');

    const sessaoId = await criarSessao(usuario.id, contaId);
    reply.setCookie(NOME_COOKIE_SESSAO, sessaoId, opcoesSessao());
    await registrarEntrada(usuario.id, contaId, nome);
    return reply.code(201).send(corpoUsuario({ id: usuario.id, nome, email, papel: 'membro' }));
  });

  app.post('/api/auth/entrar', limiteAuth, async (req, reply) => {
    const { email, senha } = credenciaisSchema.parse(req.body);

    const linhas = await sql<
      { id: string; conta_id: string; nome: string; senha_hash: string; papel: string }[]
    >`select id, conta_id, nome, senha_hash, papel from usuarios where email = ${email}`;
    const usuario = linhas[0];

    // Mensagem única pra não revelar se o e-mail existe.
    if (usuario === undefined || !(await conferirSenha(usuario.senha_hash, senha))) {
      return reply.code(401).send({ erro: 'credenciais inválidas' });
    }

    const sessaoId = await criarSessao(usuario.id, usuario.conta_id);
    reply.setCookie(NOME_COOKIE_SESSAO, sessaoId, opcoesSessao());
    await registrarEntrada(usuario.id, usuario.conta_id, usuario.nome);
    return reply.send(
      corpoUsuario({
        id: usuario.id,
        nome: usuario.nome,
        email,
        papel: usuario.papel,
      }),
    );
  });

  // Revoga a sessão no servidor, não só no cliente: o valor assinado deixa de ser
  // aceito (era o furo do 2.5.3 — limpar o cookie não deslogava de verdade).
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
    return reply.send(corpoUsuario(u));
  });

  // Lista todos os usuários do workspace. Só o dono do workspace (brunoacre07).
  app.get('/api/auth/usuarios', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!podeGerirSenhas(u.email)) {
      return reply.code(403).send({ erro: 'só o dono do workspace pode listar usuários' });
    }
    const wsId = await workspaceContaId();
    const linhas = await sql<
      { id: string; nome: string; email: string; papel: string; criado_em: Date }[]
    >`
      select id, nome, email, papel, criado_em
      from usuarios
      where conta_id = ${wsId}
      order by lower(nome), email`;
    return reply.send(
      linhas.map((l) => ({
        id: l.id,
        nome: l.nome,
        email: l.email,
        papel: l.papel === 'dono' ? 'dono' : 'membro',
        criadoEm: l.criado_em.toISOString(),
      })),
    );
  });

  // Define/troca a senha de login de qualquer usuário (inclui Jurandir). Só brunoacre07.
  app.patch('/api/auth/usuarios/:id/senha', { preHandler: exigeDono, ...limiteAuth }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!podeGerirSenhas(u.email)) {
      return reply.code(403).send({ erro: 'só o dono do workspace pode definir senhas' });
    }
    const { id } = paramsIdSchema.parse(req.params);
    const { senha } = senhaUsuarioSchema.parse(req.body);
    const wsId = await workspaceContaId();

    const alvos = await sql<{ id: string; email: string }[]>`
      select id, email from usuarios where id = ${id} and conta_id = ${wsId}`;
    const alvo = alvos[0];
    if (alvo === undefined) {
      return reply.code(404).send({ erro: 'usuário não encontrado' });
    }

    const senhaHash = await gerarHash(senha);
    await sql`update usuarios set senha_hash = ${senhaHash} where id = ${alvo.id}`;
    // Força re-login do alvo (não derruba o admin se ele estiver editando a própria).
    if (alvo.id !== u.id) {
      await revogarSessoesDoUsuario(alvo.id);
    }
    return reply.send({ ok: true, email: alvo.email });
  });

  // Troca o código de convite do workspace. Só o dono DO workspace (não dono de
  // outra conta qualquer): exige papel 'dono' e que a conta logada seja a workspace.
  app.patch('/api/auth/codigo-convite', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    const contaId = contaObrigatoria(req);
    const wsId = await workspaceContaId();
    if (u.papel !== 'dono' || contaId !== wsId) {
      return reply.code(403).send({ erro: 'só o dono pode trocar o código de convite' });
    }
    const { codigo } = codigoConviteSchema.parse(req.body);
    const hashCodigo = await gerarHash(codigo);
    await sql`update contas set codigo_convite_hash = ${hashCodigo} where id = ${wsId}`;
    return reply.send({ ok: true });
  });
}
