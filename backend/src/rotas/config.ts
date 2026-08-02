import type { FastifyInstance } from 'fastify';
import { config } from '../config';

// Config pública em runtime (R2 + base do WebSocket de presença).
export async function rotasConfig(app: FastifyInstance): Promise<void> {
  app.get('/api/config', async (_req, reply) => {
    const wsEnv = process.env.WS_PUBLIC_BASE?.trim() ?? '';
    const wsBase =
      wsEnv !== ''
        ? wsEnv.replace(/\/+$/, '')
        : config.isProd
          ? 'wss://mostruario-api.onrender.com'
          : '';
    return reply.send({
      r2PublicBase: process.env.R2_PUBLIC_BASE ?? '',
      wsBase,
    });
  });
}
