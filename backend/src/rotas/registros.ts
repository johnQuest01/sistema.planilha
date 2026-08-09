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
  editarCorpoRegistro,
  editarRegistro,
  listarRegistros,
  moverRegistro,
  obterColecaoIdDoRegistro,
} from '../repositorios/registros';
import { corpoRegistroSchema as camposProprioSchema } from '../validacao/campo';
import type { Campo } from '../../../shared/tipos';
import { broadcastRegistro } from '../ws/presencaHub';

// Criar aceita valores e, opcionalmente, um CORPO próprio (blocos) — usado ao
// duplicar/gerar um novo registro a partir de outro, com estrutura independente.
const corpoRegistroSchema = z
  .object({
    valores: z.record(z.string(), z.unknown()).default({}),
    campos: camposProprioSchema.optional(),
  })
  .strict();

// Substituição do corpo de UM registro (torna-o independente da coleção).
const corpoProprioSchema = z.object({ campos: camposProprioSchema }).strict();

// `before` agora é o cursor de `ordem` (número), não mais a data de criação.
// `.catch(undefined)` deixa um cursor inválido (ex.: uma data do app em cache
// antigo, durante o deploy) cair na 1ª página em vez de dar 400.
const listaQuerySchema = z
  .object({ before: z.coerce.number().finite().optional().catch(undefined) })
  .strict();
const buscaQuerySchema = z.object({ q: z.string().min(1).max(200) }).strict();
const moverSchema = z.object({ direcao: z.enum(['cima', 'baixo']) }).strict();

async function barrarSeBloqueado(
  contaId: string,
  colecaoId: string,
  usuario: { id: string; email: string; papel: 'dono' | 'membro' },
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
      if (await barrarSeBloqueado(contaId, req.params.id, { id: u.id, email: u.email, papel: u.papel }, reply)) {
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
      if (await barrarSeBloqueado(contaId, req.params.id, { id: u.id, email: u.email, papel: u.papel }, reply)) {
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
      const { valores, campos } = corpoRegistroSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      if (await barrarSeBloqueado(contaId, req.params.id, { id: u.id, email: u.email, papel: u.papel }, reply)) {
        return;
      }
      const registro = await comConta(contaId, (tx) =>
        criarRegistro(tx, req.params.id, valores, { id: u.id, nome: u.nome, papel: u.papel }, campos as Campo[] | undefined),
      );
      if (registro === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      broadcastRegistro(contaId, { acao: 'criado', colecaoId: req.params.id, registro });
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
      if (await barrarSeBloqueado(contaId, colecaoId, { id: u.id, email: u.email, papel: u.papel }, reply)) {
        return;
      }
      const registro = await comConta(contaId, (tx) =>
        editarRegistro(tx, req.params.id, valores),
      );
      if (registro === null) return reply.code(404).send({ erro: 'registro não encontrado' });
      broadcastRegistro(contaId, { acao: 'atualizado', colecaoId, registro });
      return reply.send(registro);
    },
  );

  // Substitui o corpo (blocos) de UM registro sem afetar os demais. Ao mudar o
  // corpo, o registro passa a ter estrutura própria; o corpo da coleção segue
  // compartilhado para os que não têm o seu.
  app.put<{ Params: { id: string } }>(
    '/api/registros/:id/corpo',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { campos } = corpoProprioSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const colecaoId = await comConta(contaId, (tx) =>
        obterColecaoIdDoRegistro(tx, req.params.id),
      );
      if (colecaoId === null) return reply.code(404).send({ erro: 'registro não encontrado' });
      if (await barrarSeBloqueado(contaId, colecaoId, { id: u.id, email: u.email, papel: u.papel }, reply)) {
        return;
      }
      const registro = await comConta(contaId, (tx) =>
        editarCorpoRegistro(tx, req.params.id, campos as Campo[]),
      );
      if (registro === null) return reply.code(404).send({ erro: 'registro não encontrado' });
      broadcastRegistro(contaId, { acao: 'atualizado', colecaoId, registro });
      return reply.send(registro);
    },
  );

  // Sobe/desce o registro na ordem de exibição (troca com o vizinho).
  app.post<{ Params: { id: string } }>(
    '/api/registros/:id/mover',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { direcao } = moverSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const colecaoId = await comConta(contaId, (tx) =>
        obterColecaoIdDoRegistro(tx, req.params.id),
      );
      if (colecaoId === null) return reply.code(404).send({ erro: 'registro não encontrado' });
      if (await barrarSeBloqueado(contaId, colecaoId, { id: u.id, email: u.email, papel: u.papel }, reply)) {
        return;
      }
      const trocados = await comConta(contaId, (tx) => moverRegistro(tx, req.params.id, direcao));
      if (trocados === null) return reply.code(404).send({ erro: 'registro não encontrado' });
      for (const r of trocados) {
        broadcastRegistro(contaId, { acao: 'atualizado', colecaoId, registro: r });
      }
      return reply.send(trocados);
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
      if (await barrarSeBloqueado(contaId, colecaoId, { id: u.id, email: u.email, papel: u.papel }, reply)) {
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
      broadcastRegistro(contaId, { acao: 'apagado', colecaoId, registroId: req.params.id });
      return reply.code(204).send();
    },
  );
}
