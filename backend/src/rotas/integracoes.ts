import type { FastifyInstance } from 'fastify';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import { validaIdParam } from '../validacao/params';
import { criarIntegracaoSchema, editarIntegracaoSchema } from '../validacao/integracao';
import {
  apagarIntegracao,
  criarIntegracao,
  editarIntegracao,
  listarIntegracoes,
  obterIntegracao,
} from '../repositorios/integracoes';

export async function rotasIntegracoes(app: FastifyInstance): Promise<void> {
  app.get('/api/integracoes', { preHandler: exigeDono }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const integracoes = await comConta(contaId, (tx) => listarIntegracoes(tx, contaId));
    return reply.send(integracoes);
  });

  app.post('/api/integracoes', { preHandler: exigeDono }, async (req, reply) => {
    const dados = criarIntegracaoSchema.parse(req.body);
    const contaId = contaObrigatoria(req);
    const u = usuarioObrigatorio(req);
    const resultado = await comConta(contaId, (tx) =>
      criarIntegracao(tx, contaId, dados, u.id),
    );
    if ('erro' in resultado) {
      return reply.code(400).send({ erro: 'escolha ao menos duas planilhas válidas' });
    }
    return reply.code(201).send(resultado);
  });

  app.get<{ Params: { id: string } }>(
    '/api/integracoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const integracao = await comConta(contaId, (tx) => obterIntegracao(tx, req.params.id));
      if (integracao === null) return reply.code(404).send({ erro: 'integração não encontrada' });
      return reply.send(integracao);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/integracoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const patch = editarIntegracaoSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const resultado = await comConta(contaId, (tx) => editarIntegracao(tx, req.params.id, patch));
      if (resultado === null) return reply.code(404).send({ erro: 'integração não encontrada' });
      if ('erro' in resultado) {
        return reply.code(400).send({ erro: 'escolha ao menos duas planilhas válidas' });
      }
      return reply.send(resultado);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/integracoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const apagou = await comConta(contaId, (tx) => apagarIntegracao(tx, req.params.id));
      if (!apagou) return reply.code(404).send({ erro: 'integração não encontrada' });
      return reply.code(204).send();
    },
  );
}
