import type { FastifyInstance } from 'fastify';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import { obterColecaoIdPorCampo, verificarAcessoColecao } from '../auth/acessoColecao';
import { validaIdParam } from '../validacao/params';
import { criarCampoSchema, editarCampoSchema, reordenarCamposSchema } from '../validacao/campo';
import { apagarCampo, criarCampo, editarCampo, reordenarCampos } from '../repositorios/campos';

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

export async function rotasCampos(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/api/colecoes/:id/campos',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const dados = criarCampoSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      if (await barrarSeBloqueado(contaId, req.params.id, { id: u.id, email: u.email, papel: u.papel }, reply)) {
        return;
      }
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
      const u = usuarioObrigatorio(req);
      const colecaoId = await comConta(contaId, (tx) => obterColecaoIdPorCampo(tx, req.params.id));
      if (colecaoId === null) return reply.code(404).send({ erro: 'campo não encontrado' });
      if (await barrarSeBloqueado(contaId, colecaoId, { id: u.id, email: u.email, papel: u.papel }, reply)) {
        return;
      }
      const campo = await comConta(contaId, (tx) => editarCampo(tx, req.params.id, patch));
      if (campo === null) return reply.code(404).send({ erro: 'campo não encontrado' });
      return reply.send(campo);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/colecoes/:id/campos/ordem',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { ids } = reordenarCamposSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      if (await barrarSeBloqueado(contaId, req.params.id, { id: u.id, email: u.email, papel: u.papel }, reply)) {
        return;
      }
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
      const u = usuarioObrigatorio(req);
      const colecaoId = await comConta(contaId, (tx) => obterColecaoIdPorCampo(tx, req.params.id));
      if (colecaoId === null) return reply.code(404).send({ erro: 'campo não encontrado' });
      if (await barrarSeBloqueado(contaId, colecaoId, { id: u.id, email: u.email, papel: u.papel }, reply)) {
        return;
      }
      const ok = await comConta(contaId, (tx) => apagarCampo(tx, req.params.id));
      if (!ok) return reply.code(404).send({ erro: 'campo não encontrado' });
      return reply.code(204).send();
    },
  );
}
