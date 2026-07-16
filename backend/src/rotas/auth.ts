import type { FastifyInstance } from 'fastify';
import { sql } from '../db/client';
import { gerarHash, conferirSenha } from '../auth/senha';
import { NOME_COOKIE_SESSAO, opcoesLimpar, opcoesSessao } from '../auth/cookies';
import { exigeDono, contaObrigatoria } from '../auth/exigeDono';
import { criarSessao, revogarSessao } from '../auth/sessoes';
import { credenciaisSchema } from '../validacao/credenciais';

// `contas` não tem RLS (ver migration 002): a lógica de auth media o acesso aqui,
// então falamos direto com `sql`, fora do `comConta`.
// Aperto por IP nas rotas que fazem argon2. Deixa pronto pro convite (Fase 6),
// onde a chave do limiter será o token, não o IP (ver 2.5.4).
const limiteAuth = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export async function rotasAuth(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/registrar', limiteAuth, async (req, reply) => {
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

    const sessaoId = await criarSessao(conta.id);
    reply.setCookie(NOME_COOKIE_SESSAO, sessaoId, opcoesSessao());
    return reply.code(201).send({ id: conta.id, email });
  });

  app.post('/api/auth/entrar', limiteAuth, async (req, reply) => {
    const { email, senha } = credenciaisSchema.parse(req.body);

    const linhas = await sql<{ id: string; senha_hash: string }[]>`
      select id, senha_hash from contas where email = ${email}`;
    const conta = linhas[0];

    // Mensagem única pra não revelar se o e-mail existe.
    if (conta === undefined || !(await conferirSenha(conta.senha_hash, senha))) {
      return reply.code(401).send({ erro: 'credenciais inválidas' });
    }

    const sessaoId = await criarSessao(conta.id);
    reply.setCookie(NOME_COOKIE_SESSAO, sessaoId, opcoesSessao());
    return reply.send({ id: conta.id, email });
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
    const contaId = contaObrigatoria(req);
    const linhas = await sql<{ email: string }[]>`select email from contas where id = ${contaId}`;
    const conta = linhas[0];
    if (conta === undefined) return reply.code(401).send({ erro: 'sessão inválida' });
    return reply.send({ id: contaId, email: conta.email });
  });
}
