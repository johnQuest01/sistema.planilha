import type { FastifyInstance } from 'fastify';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
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

export async function rotasColecoes(app: FastifyInstance): Promise<void> {
  app.post('/api/colecoes', { preHandler: exigeDono }, async (req, reply) => {
    const { nome } = criarColecaoSchema.parse(req.body);
    const contaId = contaObrigatoria(req);
    const u = usuarioObrigatorio(req);
    const colecao = await comConta(contaId, (tx) => criarColecao(tx, contaId, nome, u.id));
    return reply.code(201).send(colecao);
  });

  app.get('/api/colecoes', { preHandler: exigeDono }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const colecoes = await comConta(contaId, (tx) => listarColecoes(tx, contaId));
    return reply.send(colecoes);
  });

  app.get<{ Params: { id: string } }>(
    '/api/colecoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const colecao = await comConta(contaId, (tx) => obterColecao(tx, req.params.id));
      if (colecao === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.send(colecao);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/colecoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { nome } = renomearColecaoSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const colecao = await comConta(contaId, (tx) => renomearColecao(tx, req.params.id, nome));
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
      const copia = await comConta(contaId, (tx) =>
        duplicarColecao(tx, contaId, req.params.id, u.id),
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
