import type { FastifyInstance } from 'fastify';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria } from '../auth/exigeDono';
import { validaIdParam } from '../validacao/params';
import { criarCampoSchema, editarCampoSchema, reordenarCamposSchema } from '../validacao/campo';
import { apagarCampo, criarCampo, editarCampo, reordenarCampos } from '../repositorios/campos';

export async function rotasCampos(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/api/colecoes/:id/campos',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const dados = criarCampoSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const campo = await comConta(contaId, (tx) => criarCampo(tx, req.params.id, dados));
      if (campo === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.code(201).send(campo);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/campos/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const patch = editarCampoSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const campo = await comConta(contaId, (tx) => editarCampo(tx, req.params.id, patch));
      if (campo === null) return reply.code(404).send({ erro: 'campo não encontrado' });
      return reply.send(campo);
    },
  );

  // Reordenação em lote: body traz a ordem final completa (ids). Substitui os
  // antigos POST /api/campos/:id/mover — ordem completa é imune a resposta fora de
  // ordem, delta de vizinho não é.
  app.patch<{ Params: { id: string } }>(
    '/api/colecoes/:id/campos/ordem',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { ids } = reordenarCamposSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const campos = await comConta(contaId, (tx) => reordenarCampos(tx, req.params.id, ids));
      if (campos === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.send(campos);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/campos/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const ok = await comConta(contaId, (tx) => apagarCampo(tx, req.params.id));
      if (!ok) return reply.code(404).send({ erro: 'campo não encontrado' });
      return reply.code(204).send();
    },
  );
}
