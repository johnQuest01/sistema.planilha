import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { conectarPresencaWs, consumirTicketPresenca } from './presencaHub';

export async function rotasWs(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get('/ws/presenca', { websocket: true }, (socket, req) => {
    const q = req.query as { ticket?: string };
    const ticketStr = typeof q.ticket === 'string' ? q.ticket : '';
    const ticket = consumirTicketPresenca(ticketStr);
    if (ticket === null) {
      socket.close(4401, 'ticket inválido');
      return;
    }
    void conectarPresencaWs(socket, ticket);
  });
}
