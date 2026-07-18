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

export async function rotasLixeira(app: FastifyInstance): Promise<void> {
  app.get('/api/lixeira', { preHandler: [exigeDono] }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const itens = await comConta(contaId, (tx) => listarLixeira(tx));
    return reply.send(itens);
  });

  app.post<{ Params: { id: string } }>(
    '/api/lixeira/:id/restaurar',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
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
      // Qualquer usuário da conta pode; R2 fora da transação (Neon já limpo).
      await apagarKeysNoR2(keys);
      return reply.code(204).send();
    },
  );
}
