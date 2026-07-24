import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { comConta } from '../db/comConta';
import { config } from '../config';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import {
  aplicarSenhaColecao,
  colecaoExiste,
  gerarHashSenhaPlanilha,
  lerHashSenhaColecao,
  registrarDesbloqueio,
  removerSenhaColecao,
  senhaColecaoConfere,
  verificarAcessoColecao,
} from '../auth/acessoColecao';
import { validaIdParam } from '../validacao/params';
import { criarColecaoSchema, renomearColecaoSchema } from '../validacao/colecao';
import {
  apagarColecao,
  criarColecao,
  duplicarColecao,
  listarColecoes,
  obterColecao,
  renomearColecao,
} from '../repositorios/colecoes';

const senhaPlanilhaSchema = z
  .object({
    senha: z.string().min(4, 'mínimo 4 caracteres').max(200),
  })
  .strict();

function acessoDe(u: { id: string; email: string; papel: 'dono' | 'membro' }) {
  return { email: u.email, usuarioId: u.id, papel: u.papel };
}

function podeGerirSenhaPlanilha(email: string): boolean {
  return email.trim().toLowerCase() === config.workspaceOwnerEmail;
}

export async function rotasColecoes(app: FastifyInstance): Promise<void> {
  app.post('/api/colecoes', { preHandler: exigeDono }, async (req, reply) => {
    const { nome } = criarColecaoSchema.parse(req.body);
    const contaId = contaObrigatoria(req);
    const u = usuarioObrigatorio(req);
    const colecao = await comConta(contaId, (tx) =>
      criarColecao(tx, contaId, nome, u.id, acessoDe(u)),
    );
    return reply.code(201).send(colecao);
  });

  app.get('/api/colecoes', { preHandler: exigeDono }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const u = usuarioObrigatorio(req);
    const colecoes = await comConta(contaId, (tx) =>
      listarColecoes(tx, contaId, acessoDe(u)),
    );
    return reply.send(colecoes);
  });

  app.get<{ Params: { id: string } }>(
    '/api/colecoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const colecao = await comConta(contaId, (tx) =>
        obterColecao(tx, req.params.id, acessoDe(u)),
      );
      if (colecao === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      if (colecao.bloqueada) {
        return reply.code(403).send({
          erro: 'senha necessária',
          bloqueada: true,
          id: colecao.id,
          nome: colecao.nome,
        });
      }
      return reply.send(colecao);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/colecoes/:id/desbloquear',
    { preHandler: [exigeDono, validaIdParam], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { senha } = senhaPlanilhaSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);

      // 1) Lê o hash em tx curta — Argon2 NÃO roda com conexão presa.
      const lido = await comConta(contaId, (tx) => lerHashSenhaColecao(tx, req.params.id));
      if (lido === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      if (lido === 'sem-senha') {
        return reply.code(400).send({ erro: 'esta planilha não tem senha' });
      }
      if (!(await senhaColecaoConfere(lido.hash, senha))) {
        return reply.code(403).send({ erro: 'senha inválida' });
      }

      // 2) Registra acesso + devolve a coleção na mesma tx.
      const colecao = await comConta(contaId, async (tx) => {
        await registrarDesbloqueio(tx, req.params.id, u.id);
        return obterColecao(tx, req.params.id, acessoDe(u));
      });
      if (colecao === null || colecao.bloqueada) {
        return reply.code(500).send({ erro: 'não foi possível abrir a planilha após desbloquear' });
      }
      return reply.send(colecao);
    },
  );

  // Só brunoacre07 define/troca a senha de qualquer planilha.
  app.patch<{ Params: { id: string } }>(
    '/api/colecoes/:id/senha',
    { preHandler: [exigeDono, validaIdParam], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const u = usuarioObrigatorio(req);
      if (!podeGerirSenhaPlanilha(u.email)) {
        return reply.code(403).send({ erro: 'só o dono do workspace pode definir senha de planilha' });
      }
      const { senha } = senhaPlanilhaSchema.parse(req.body);
      const contaId = contaObrigatoria(req);

      const existe = await comConta(contaId, (tx) => colecaoExiste(tx, req.params.id));
      if (!existe) {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }

      // Argon2 fora do banco: senão a tx segura a conexão do pool e o app
      // inteiro fica em carregamento infinito (lista/coleção esperando conexão).
      const hash = await gerarHashSenhaPlanilha(senha);
      await comConta(contaId, (tx) => aplicarSenhaColecao(tx, req.params.id, hash));
      return reply.send({ ok: true });
    },
  );

  // Só brunoacre07 remove a senha de qualquer planilha.
  app.delete<{ Params: { id: string } }>(
    '/api/colecoes/:id/senha',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const u = usuarioObrigatorio(req);
      if (!podeGerirSenhaPlanilha(u.email)) {
        return reply.code(403).send({ erro: 'só o dono do workspace pode remover senha de planilha' });
      }
      const contaId = contaObrigatoria(req);
      const resultado = await comConta(contaId, (tx) => removerSenhaColecao(tx, req.params.id));
      if (resultado === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      return reply.send({ ok: true });
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/colecoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { nome } = renomearColecaoSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const acesso = await comConta(contaId, (tx) =>
        verificarAcessoColecao(tx, req.params.id, { id: u.id, email: u.email, papel: u.papel }),
      );
      if (acesso === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      if (acesso === 'bloqueado') {
        return reply.code(403).send({ erro: 'senha necessária', bloqueada: true });
      }
      const colecao = await comConta(contaId, (tx) =>
        renomearColecao(tx, req.params.id, nome, acessoDe(u)),
      );
      if (colecao === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.send(colecao);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/colecoes/:id/duplicar',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const acesso = await comConta(contaId, (tx) =>
        verificarAcessoColecao(tx, req.params.id, { id: u.id, email: u.email, papel: u.papel }),
      );
      if (acesso === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      if (acesso === 'bloqueado') {
        return reply.code(403).send({ erro: 'senha necessária', bloqueada: true });
      }
      const copia = await comConta(contaId, (tx) =>
        duplicarColecao(tx, contaId, req.params.id, u.id, acessoDe(u)),
      );
      if (copia === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.code(201).send(copia);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/colecoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const acesso = await comConta(contaId, (tx) =>
        verificarAcessoColecao(tx, req.params.id, { id: u.id, email: u.email, papel: u.papel }),
      );
      if (acesso === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      if (acesso === 'bloqueado') {
        return reply.code(403).send({ erro: 'senha necessária', bloqueada: true });
      }
      const resultado = await comConta(contaId, (tx) =>
        apagarColecao(tx, req.params.id, { id: u.id, nome: u.nome, papel: u.papel }),
      );
      if (resultado === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      if (resultado === 'proibido') {
        return reply.code(403).send({ erro: 'só quem criou (ou o dono) pode apagar esta planilha' });
      }
      return reply.code(204).send();
    },
  );
}
