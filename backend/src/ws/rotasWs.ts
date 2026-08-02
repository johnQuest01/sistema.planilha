import type { FastifyInstance } from 'fastify';
import { conectarPresencaWs, consumirTicketPresenca, type SocketPresenca } from './presencaHub';

// O plugin @fastify/websocket é registrado na instância raiz em server.ts.
export async function rotasWs(app: FastifyInstance): Promise<void> {
  app.get('/ws/presenca', { websocket: true }, (socket, req) => {
    const q = req.query as { ticket?: string };
    const ticketStr = typeof q.ticket === 'string' ? q.ticket : '';
    const ticket = consumirTicketPresenca(ticketStr);
    if (ticket === null) {
      socket.close(1008, 'ticket inválido');
      return;
    }
    conectarPresencaWs(socket as unknown as SocketPresenca, ticket);
  });
}
