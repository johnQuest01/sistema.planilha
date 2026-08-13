import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { comConta, type Tx } from '../db/comConta';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import { verificarAcessoColecao, type UsuarioAcesso } from '../auth/acessoColecao';
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

type ReplyBloqueio = { code: (n: number) => { send: (b: unknown) => unknown } };

/** Acesso + trabalho na MESMA transação — evita 2× comConta (RTT Neon) por request. */
async function comAcessoColecao<T>(
  contaId: string,
  colecaoId: string,
  usuario: UsuarioAcesso,
  reply: ReplyBloqueio,
  fn: (tx: Tx) => Promise<T>,
): Promise<T | undefined> {
  let barrado: 'nao-encontrado' | 'bloqueado' | null = null;
  const valor = await comConta(contaId, async (tx) => {
    const acesso = await verificarAcessoColecao(tx, colecaoId, usuario);
    if (acesso === 'nao-encontrado') {
      barrado = 'nao-encontrado';
      return undefined;
    }
    if (acesso === 'bloqueado') {
      barrado = 'bloqueado';
      return undefined;
    }
    return fn(tx);
  });
  if (barrado === 'nao-encontrado') {
    await reply.code(404).send({ erro: 'coleção não encontrada' });
    return undefined;
  }
  if (barrado === 'bloqueado') {
    await reply.code(403).send({ erro: 'senha necessária', bloqueada: true });
    return undefined;
  }
  return valor;
}

/** Resolve coleção do registro + acesso + trabalho numa só transação. */
async function comAcessoRegistro<T>(
  contaId: string,
  registroId: string,
  usuario: UsuarioAcesso,
  reply: ReplyBloqueio,
  fn: (tx: Tx, colecaoId: string) => Promise<T>,
): Promise<{ colecaoId: string; valor: T } | undefined> {
  let erro: 'registro' | 'nao-encontrado' | 'bloqueado' | null = null;
  const out = await comConta(contaId, async (tx) => {
    const colecaoId = await obterColecaoIdDoRegistro(tx, registroId);
    if (colecaoId === null) {
      erro = 'registro';
      return undefined;
    }
    const acesso = await verificarAcessoColecao(tx, colecaoId, usuario);
    if (acesso === 'nao-encontrado') {
      erro = 'nao-encontrado';
      return undefined;
    }
    if (acesso === 'bloqueado') {
      erro = 'bloqueado';
      return undefined;
    }
    const valor = await fn(tx, colecaoId);
    return { colecaoId, valor };
  });
  if (erro === 'registro') {
    await reply.code(404).send({ erro: 'registro não encontrado' });
    return undefined;
  }
  if (erro === 'nao-encontrado') {
    await reply.code(404).send({ erro: 'coleção não encontrada' });
    return undefined;
  }
  if (erro === 'bloqueado') {
    await reply.code(403).send({ erro: 'senha necessária', bloqueada: true });
    return undefined;
  }
  return out;
}

export async function rotasRegistros(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { q: string } }>(
    '/api/colecoes/:id/registros/busca',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { q } = buscaQuerySchema.parse(req.query);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const registros = await comAcessoColecao(
        contaId,
        req.params.id,
        { id: u.id, email: u.email, papel: u.papel },
        reply,
        (tx) => buscarRegistros(tx, req.params.id, q),
      );
      if (registros === undefined) return;
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
      const registros = await comAcessoColecao(
        contaId,
        req.params.id,
        { id: u.id, email: u.email, papel: u.papel },
        reply,
        (tx) => listarRegistros(tx, req.params.id, before),
      );
      if (registros === undefined) return;
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
      const registro = await comAcessoColecao(
        contaId,
        req.params.id,
        { id: u.id, email: u.email, papel: u.papel },
        reply,
        (tx) =>
          criarRegistro(tx, req.params.id, valores, { id: u.id, nome: u.nome, papel: u.papel }, campos as Campo[] | undefined),
      );
      if (registro === undefined) return;
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
      const out = await comAcessoRegistro(
        contaId,
        req.params.id,
        { id: u.id, email: u.email, papel: u.papel },
        reply,
        (tx) => editarRegistro(tx, req.params.id, valores),
      );
      if (out === undefined) return;
      if (out.valor === null) return reply.code(404).send({ erro: 'registro não encontrado' });
      broadcastRegistro(contaId, { acao: 'atualizado', colecaoId: out.colecaoId, registro: out.valor });
      return reply.send(out.valor);
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
      const out = await comAcessoRegistro(
        contaId,
        req.params.id,
        { id: u.id, email: u.email, papel: u.papel },
        reply,
        (tx) => editarCorpoRegistro(tx, req.params.id, campos as Campo[]),
      );
      if (out === undefined) return;
      if (out.valor === null) return reply.code(404).send({ erro: 'registro não encontrado' });
      broadcastRegistro(contaId, { acao: 'atualizado', colecaoId: out.colecaoId, registro: out.valor });
      return reply.send(out.valor);
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
      const out = await comAcessoRegistro(
        contaId,
        req.params.id,
        { id: u.id, email: u.email, papel: u.papel },
        reply,
        (tx) => moverRegistro(tx, req.params.id, direcao),
      );
      if (out === undefined) return;
      if (out.valor === null) return reply.code(404).send({ erro: 'registro não encontrado' });
      for (const r of out.valor) {
        broadcastRegistro(contaId, { acao: 'atualizado', colecaoId: out.colecaoId, registro: r });
      }
      return reply.send(out.valor);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/registros/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const out = await comAcessoRegistro(
        contaId,
        req.params.id,
        { id: u.id, email: u.email, papel: u.papel },
        reply,
        (tx) => apagarRegistro(tx, req.params.id, { id: u.id, nome: u.nome, papel: u.papel }),
      );
      if (out === undefined) return;
      if (out.valor === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'registro não encontrado' });
      }
      if (out.valor === 'proibido') {
        return reply.code(403).send({ erro: 'só quem criou (ou o dono) pode apagar este registro' });
      }
      broadcastRegistro(contaId, { acao: 'apagado', colecaoId: out.colecaoId, registroId: req.params.id });
      return reply.code(204).send();
    },
  );
}
