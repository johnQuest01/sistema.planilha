import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import { ZodError } from 'zod';
import { config } from './config';
import { sql } from './db/client';
import { rotasAuth } from './rotas/auth';
import { rotasColecoes } from './rotas/colecoes';
import { rotasCampos } from './rotas/campos';

export function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: 64 * 1024, // binário vai direto pro R2; JSON de registro cabe folgado aqui
  });

  app.register(helmet);
  app.register(cors, { origin: config.corsOrigin, credentials: true });
  app.register(cookie, { secret: config.cookieSecret });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ erro: 'validação', detalhes: err.issues });
    }
    const codigo = typeof err.statusCode === 'number' && err.statusCode >= 400 ? err.statusCode : 500;
    if (codigo >= 500) req.log.error(err);
    return reply.code(codigo).send({ erro: codigo >= 500 ? 'erro interno' : err.message });
  });

  app.get('/health', async () => {
    const linhas = await sql<{ ok: number }[]>`select 1 as ok`;
    return { status: 'ok', db: linhas[0]?.ok === 1 };
  });

  app.register(rotasAuth);
  app.register(rotasColecoes);
  app.register(rotasCampos);

  return app;
}

async function main() {
  const app = buildServer();
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
