import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client';
import { exigeDono, contaObrigatoria } from '../auth/exigeDono';
import { broadcastTrava } from '../ws/presencaHub';

const travaSchema = z.object({ liberada: z.boolean() }).strict();

// Alavanca de edição por conta (workspace). Fica salva no servidor para
// persistir entre aparelhos/sessões e valer para todos da mesma conta.
// `contas` não tem RLS (ver migration 002): a auth já isola por conta_id, então
// falamos direto com `sql`.
export async function rotasConta(app: FastifyInstance): Promise<void> {
  app.get('/api/conta/edicao-trava', { preHandler: exigeDono }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const linhas = await sql<{ edicao_liberada: boolean }[]>`
      select edicao_liberada from contas where id = ${contaId}`;
    return reply.send({ liberada: linhas[0]?.edicao_liberada ?? false });
  });

  app.patch('/api/conta/edicao-trava', { preHandler: exigeDono }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const { liberada } = travaSchema.parse(req.body);
    await sql`update contas set edicao_liberada = ${liberada} where id = ${contaId}`;
    broadcastTrava(contaId, liberada);
    return reply.send({ liberada });
  });
}
