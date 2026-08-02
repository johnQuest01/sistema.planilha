import type { FastifyInstance } from 'fastify';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import { marcarVisto, online, entradasRecentes } from '../repositorios/presenca';
import { emitirTicketPresenca } from '../ws/presencaHub';

// REST permanece como fallback. O caminho rápido é WebSocket (/ws/presenca + ticket).
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

  // Ticket de curta duração: cookie da Vercel não vai no WS do Render (domínio diferente).
  app.get('/api/presenca/ws-ticket', { preHandler: exigeDono }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const u = usuarioObrigatorio(req);
    const { ticket, expiraEm } = emitirTicketPresenca(u.id, contaId, u.nome);
    return reply.send({ ticket, expiraEm });
  });
}
