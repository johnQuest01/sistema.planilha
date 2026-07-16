import type { FastifyInstance } from 'fastify';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria } from '../auth/exigeDono';
import { criarColecaoSchema, renomearColecaoSchema } from '../validacao/colecao';
import {
  apagarColecao,
  criarColecao,
  listarColecoes,
  obterColecao,
  renomearColecao,
} from '../repositorios/colecoes';

export async function rotasColecoes(app: FastifyInstance): Promise<void> {
  app.post('/api/colecoes', { preHandler: exigeDono }, async (req, reply) => {
    const { nome } = criarColecaoSchema.parse(req.body);
    const contaId = contaObrigatoria(req);
    const colecao = await comConta(contaId, (tx) => criarColecao(tx, contaId, nome));
    return reply.code(201).send(colecao);
  });

  app.get('/api/colecoes', { preHandler: exigeDono }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const colecoes = await comConta(contaId, (tx) => listarColecoes(tx, contaId));
    return reply.send(colecoes);
  });

  app.get<{ Params: { id: string } }>(
    '/api/colecoes/:id',
    { preHandler: exigeDono },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const colecao = await comConta(contaId, (tx) => obterColecao(tx, req.params.id));
      if (colecao === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.send(colecao);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/colecoes/:id',
    { preHandler: exigeDono },
    async (req, reply) => {
      const { nome } = renomearColecaoSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const colecao = await comConta(contaId, (tx) => renomearColecao(tx, req.params.id, nome));
      if (colecao === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.send(colecao);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/colecoes/:id',
    { preHandler: exigeDono },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const ok = await comConta(contaId, (tx) => apagarColecao(tx, req.params.id));
      if (!ok) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.code(204).send();
    },
  );
}
