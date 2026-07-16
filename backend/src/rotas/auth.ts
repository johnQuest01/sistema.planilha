import type { FastifyInstance } from 'fastify';
import { sql } from '../db/client';
import { gerarHash, conferirSenha } from '../auth/senha';
import { NOME_COOKIE_SESSAO, opcoesLimpar, opcoesSessao } from '../auth/cookies';
import { exigeDono, usuarioObrigatorio, contaObrigatoria } from '../auth/exigeDono';
import { criarSessao, revogarSessao } from '../auth/sessoes';
import { workspaceContaId, workspaceCodigoHash } from '../auth/workspace';
import { credenciaisSchema, registrarSchema, codigoConviteSchema } from '../validacao/credenciais';

// `contas`/`usuarios`/`sessoes` não têm RLS (ver migration 002): a auth media o
// acesso aqui, então falamos direto com `sql`, fora do `comConta`.
// Aperto por IP nas rotas que fazem argon2, que é memory-hard (ver 2.5.4).
const limiteAuth = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

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
    return reply.code(201).send({ id: usuario.id, nome, email, papel: 'membro' });
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
    return reply.send({ id: usuario.id, nome: usuario.nome, email, papel: usuario.papel });
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
    return reply.send({ id: u.id, nome: u.nome, email: u.email, papel: u.papel });
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
