import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import { validaIdParam } from '../validacao/params';
import {
  apagarRegistro,
  criarRegistro,
  editarRegistro,
  listarRegistros,
} from '../repositorios/registros';

// O corpo carrega só `valores`. As chaves de dentro são validadas contra os campos
// da coleção (schemaDeValores, na mesma transação); aqui o .strict() barra qualquer
// outra chave no topo.
const corpoRegistroSchema = z
  .object({ valores: z.record(z.string(), z.unknown()).default({}) })
  .strict();

// Cursor de paginação: `before` = criado_em (ISO) do último item da página anterior.
const listaQuerySchema = z.object({ before: z.string().datetime().optional() }).strict();

export async function rotasRegistros(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { before?: string } }>(
    '/api/colecoes/:id/registros',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { before } = listaQuerySchema.parse(req.query);
      const contaId = contaObrigatoria(req);
      const registros = await comConta(contaId, (tx) =>
        listarRegistros(tx, req.params.id, before),
      );
      if (registros === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.send(registros);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/colecoes/:id/registros',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { valores } = corpoRegistroSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const registro = await comConta(contaId, (tx) =>
        criarRegistro(tx, req.params.id, valores, { id: u.id, nome: u.nome, papel: u.papel }),
      );
      if (registro === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.code(201).send(registro);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/registros/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { valores } = corpoRegistroSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const registro = await comConta(contaId, (tx) =>
        editarRegistro(tx, req.params.id, valores),
      );
      if (registro === null) return reply.code(404).send({ erro: 'registro não encontrado' });
      return reply.send(registro);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/registros/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const resultado = await comConta(contaId, (tx) =>
        apagarRegistro(tx, req.params.id, { id: u.id, nome: u.nome, papel: u.papel }),
      );
      if (resultado === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'registro não encontrado' });
      }
      if (resultado === 'proibido') {
        return reply.code(403).send({ erro: 'só quem criou (ou o dono) pode apagar este registro' });
      }
      return reply.code(204).send();
    },
  );
}
