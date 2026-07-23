import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { config } from './config';
import { sql } from './db/client';
import { garantirSchemaPronto } from './db/schemaPronto';
import { rotasAuth } from './rotas/auth';
import { rotasColecoes } from './rotas/colecoes';
import { rotasCampos } from './rotas/campos';
import { rotasRegistros } from './rotas/registros';
import { rotasUpload } from './rotas/upload';
import { rotasConfig } from './rotas/config';
import { rotasPresenca } from './rotas/presenca';
import { rotasLixeira } from './rotas/lixeira';

export function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: 64 * 1024, // binário vai direto pro R2; JSON de registro cabe folgado aqui
  });

  app.register(helmet);
  app.register(cors, { origin: config.corsOrigin, credentials: true });
  app.register(cookie, { secret: config.cookieSecret });
  // Teto global por IP. As rotas de auth apertam mais (config.rateLimit local),
  // porque o argon2 é memory-hard e cada POST custa caro (ver 2.5.4).
  app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((err: FastifyError | ZodError | Error, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ erro: 'validação', detalhes: err.issues });
    }
    const statusCode = 'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : undefined;
    const codigo = statusCode !== undefined && statusCode >= 400 ? statusCode : 500;
    if (codigo >= 500) req.log.error(err);
    return reply.code(codigo).send({ erro: codigo >= 500 ? 'erro interno' : err.message });
  });

  app.get('/health', async (_req, reply) => {
    const linhas = await sql<{ ok: number }[]>`select 1 as ok`;
    const db = linhas[0]?.ok === 1;
    try {
      await garantirSchemaPronto();
      return { status: 'ok', db, schema: true };
    } catch (err) {
      return reply.code(503).send({
        status: 'schema_desatualizado',
        db,
        schema: false,
        erro: err instanceof Error ? err.message : 'schema incompleto',
      });
    }
  });

  app.register(rotasConfig);
  app.register(rotasAuth);
  app.register(rotasColecoes);
  app.register(rotasCampos);
  app.register(rotasRegistros);
  app.register(rotasUpload);
  app.register(rotasPresenca);
  app.register(rotasLixeira);

  return app;
}

async function main() {
  const app = buildServer();
  try {
    // Falha cedo se o Neon não recebeu as migrations (evita planilhas “vazias”).
    await garantirSchemaPronto();
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
