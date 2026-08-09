import type { FastifyInstance } from 'fastify';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import { validaIdParam } from '../validacao/params';
import {
  apagarKeysNoR2,
  apagarLixeiraDefinitivo,
  listarLixeira,
  restaurarDaLixeira,
} from '../repositorios/lixeira';

function exigeAdminConta(req: { usuario?: { papel: string } }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }): boolean {
  if (req.usuario?.papel !== 'dono') {
    void reply.code(403).send({ erro: 'só o admin da conta pode gerir a lixeira' });
    return false;
  }
  return true;
}

export async function rotasLixeira(app: FastifyInstance): Promise<void> {
  // Listar / restaurar / apagar definitivo: SÓ o admin (dono) da conta.
  app.get('/api/lixeira', { preHandler: [exigeDono] }, async (req, reply) => {
    if (!exigeAdminConta(req, reply)) return;
    const contaId = contaObrigatoria(req);
    const itens = await comConta(contaId, (tx) => listarLixeira(tx));
    return reply.send(itens);
  });

  app.post<{ Params: { id: string } }>(
    '/api/lixeira/:id/restaurar',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      if (!exigeAdminConta(req, reply)) return;
      const contaId = contaObrigatoria(req);
      const { resultado, registro } = await comConta(contaId, (tx) =>
        restaurarDaLixeira(tx, req.params.id),
      );
      if (resultado === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'item não encontrado na lixeira' });
      }
      if (resultado === 'colecao-sumiu') {
        return reply
          .code(409)
          .send({ erro: 'a planilha deste registro foi apagada; não dá para restaurar' });
      }
      if (resultado === 'id-ocupado') {
        return reply
          .code(409)
          .send({ erro: 'já existe um registro com este id; não dá para restaurar' });
      }
      if (resultado === 'colecao-ocupada') {
        return reply
          .code(409)
          .send({ erro: 'já existe uma planilha com este id; não dá para restaurar' });
      }
      return reply.send(registro ?? { ok: true });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/lixeira/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      if (!exigeAdminConta(req, reply)) return;
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const { resultado, keys } = await comConta(contaId, (tx) =>
        apagarLixeiraDefinitivo(tx, req.params.id, {
          id: u.id,
          nome: u.nome,
          papel: u.papel,
        }),
      );
      if (resultado === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'item não encontrado na lixeira' });
      }
      await apagarKeysNoR2(keys);
      return reply.code(204).send();
    },
  );
}
