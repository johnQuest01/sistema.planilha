import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import { verificarAcessoColecao } from '../auth/acessoColecao';
import { validaIdParam } from '../validacao/params';
import {
  apagarRegistro,
  buscarRegistros,
  criarRegistro,
  editarRegistro,
  listarRegistros,
  obterColecaoIdDoRegistro,
} from '../repositorios/registros';

const corpoRegistroSchema = z
  .object({ valores: z.record(z.string(), z.unknown()).default({}) })
  .strict();

const listaQuerySchema = z.object({ before: z.string().datetime().optional() }).strict();
const buscaQuerySchema = z.object({ q: z.string().min(1).max(200) }).strict();

async function barrarSeBloqueado(
  contaId: string,
  colecaoId: string,
  usuario: { id: string; email: string },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
): Promise<boolean> {
  const acesso = await comConta(contaId, (tx) =>
    verificarAcessoColecao(tx, colecaoId, usuario),
  );
  if (acesso === 'nao-encontrado') {
    await reply.code(404).send({ erro: 'coleção não encontrada' });
    return true;
  }
  if (acesso === 'bloqueado') {
    await reply.code(403).send({ erro: 'senha necessária', bloqueada: true });
    return true;
  }
  return false;
}

export async function rotasRegistros(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { q: string } }>(
    '/api/colecoes/:id/registros/busca',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { q } = buscaQuerySchema.parse(req.query);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      if (await barrarSeBloqueado(contaId, req.params.id, { id: u.id, email: u.email }, reply)) {
        return;
      }
      const registros = await comConta(contaId, (tx) => buscarRegistros(tx, req.params.id, q));
      if (registros === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.send(registros);
    },
  );

  app.get<{ Params: { id: string }; Querystring: { before?: string } }>(
    '/api/colecoes/:id/registros',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { before } = listaQuerySchema.parse(req.query);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      if (await barrarSeBloqueado(contaId, req.params.id, { id: u.id, email: u.email }, reply)) {
        return;
      }
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
      if (await barrarSeBloqueado(contaId, req.params.id, { id: u.id, email: u.email }, reply)) {
        return;
      }
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
      const u = usuarioObrigatorio(req);
      const colecaoId = await comConta(contaId, (tx) =>
        obterColecaoIdDoRegistro(tx, req.params.id),
      );
      if (colecaoId === null) return reply.code(404).send({ erro: 'registro não encontrado' });
      if (await barrarSeBloqueado(contaId, colecaoId, { id: u.id, email: u.email }, reply)) {
        return;
      }
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
      const colecaoId = await comConta(contaId, (tx) =>
        obterColecaoIdDoRegistro(tx, req.params.id),
      );
      if (colecaoId === null) return reply.code(404).send({ erro: 'registro não encontrado' });
      if (await barrarSeBloqueado(contaId, colecaoId, { id: u.id, email: u.email }, reply)) {
        return;
      }
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
