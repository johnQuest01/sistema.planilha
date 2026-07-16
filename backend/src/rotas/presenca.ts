import type { FastifyInstance } from 'fastify';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import { marcarVisto, online, entradasRecentes } from '../repositorios/presenca';

// Presença "ao vivo" por polling: o cliente consulta a cada ~20s. A própria consulta
// serve de heartbeat (marca o solicitante como visto), então não há endpoint separado.
export async function rotasPresenca(app: FastifyInstance): Promise<void> {
  app.get('/api/presenca', { preHandler: exigeDono }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const u = usuarioObrigatorio(req);
    await marcarVisto(u.id);
    const [agora, entradas] = await Promise.all([
      online(contaId, 2),
      entradasRecentes(contaId, 10),
    ]);
    return reply.send({ online: agora, entradas });
  });
}
