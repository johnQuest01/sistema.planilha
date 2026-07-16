import type { FastifyInstance } from 'fastify';
import { sql } from '../db/client';
import { gerarHash, conferirSenha } from '../auth/senha';
import { NOME_COOKIE_SESSAO, opcoesLimpar, opcoesSessao } from '../auth/cookies';
import { exigeDono, contaObrigatoria } from '../auth/exigeDono';
import { credenciaisSchema } from '../validacao/credenciais';

// `contas` não tem RLS (ver migration 002): a lógica de auth media o acesso aqui,
// então falamos direto com `sql`, fora do `comConta`.
export async function rotasAuth(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/registrar', async (req, reply) => {
    const { email, senha } = credenciaisSchema.parse(req.body);

    const existentes = await sql<{ id: string }[]>`select id from contas where email = ${email}`;
    if (existentes.length > 0) {
      return reply.code(409).send({ erro: 'e-mail já cadastrado' });
    }

    const senhaHash = await gerarHash(senha);
    const linhas = await sql<{ id: string }[]>`
      insert into contas (email, senha_hash) values (${email}, ${senhaHash}) returning id`;
    const conta = linhas[0];
    if (conta === undefined) throw new Error('insert de conta não retornou linha');

    reply.setCookie(NOME_COOKIE_SESSAO, conta.id, opcoesSessao());
    return reply.code(201).send({ id: conta.id, email });
  });

  app.post('/api/auth/entrar', async (req, reply) => {
    const { email, senha } = credenciaisSchema.parse(req.body);

    const linhas = await sql<{ id: string; senha_hash: string }[]>`
      select id, senha_hash from contas where email = ${email}`;
    const conta = linhas[0];

    // Mensagem única pra não revelar se o e-mail existe.
    if (conta === undefined || !(await conferirSenha(conta.senha_hash, senha))) {
      return reply.code(401).send({ erro: 'credenciais inválidas' });
    }

    reply.setCookie(NOME_COOKIE_SESSAO, conta.id, opcoesSessao());
    return reply.send({ id: conta.id, email });
  });

  app.post('/api/auth/sair', async (_req, reply) => {
    reply.clearCookie(NOME_COOKIE_SESSAO, opcoesLimpar());
    return reply.send({ ok: true });
  });

  app.get('/api/auth/eu', { preHandler: exigeDono }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const linhas = await sql<{ email: string }[]>`select email from contas where id = ${contaId}`;
    const conta = linhas[0];
    if (conta === undefined) return reply.code(401).send({ erro: 'sessão inválida' });
    return reply.send({ id: contaId, email: conta.email });
  });
}
