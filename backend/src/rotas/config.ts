import type { FastifyInstance } from 'fastify';

// Config pública que o frontend precisa em runtime. Só a base pública do R2 por ora:
// com ela o cliente monta as URLs das fotos (cheia = base/key; mini = base/key _t)
// sem precustar rebuild. Lê direto do env e NÃO lança se ausente — sobe app sem R2.
export async function rotasConfig(app: FastifyInstance): Promise<void> {
  app.get('/api/config', async (_req, reply) => {
    return reply.send({ r2PublicBase: process.env.R2_PUBLIC_BASE ?? '' });
  });
}
