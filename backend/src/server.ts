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
import { rotasIntegracoes } from './rotas/integracoes';
import { rotasPublico } from './rotas/publico';
import { rotasConta } from './rotas/conta';
import { rotasPresenca } from './rotas/presenca';
import { rotasLixeira } from './rotas/lixeira';
import websocket from '@fastify/websocket';
import { rotasWs } from './ws/rotasWs';

export function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: 64 * 1024, // binário vai direto pro R2; JSON de registro cabe folgado aqui
    // O link público leva o token ASSINADO no PATH (/api/publico/r/:token). Esse
    // token carrega conta+registro+blocos+validade em base64url e passa fácil dos
    // 100 chars que o Fastify aceita por parâmetro por padrão — sem isto a rota
    // devolve 414 (URI Too Long) e a página do link "não carrega". 8 KB cobre
    // links com dezenas/centenas de blocos com folga. (Fastify 5: vai em routerOptions.)
    routerOptions: { maxParamLength: 8192 },
  });

  // @fastify/websocket é exportado via fastify-plugin, então registrar direto no
  // `app` decora a instância raiz e as rotas-filho (rotasWs) herdam o suporte a
  // `{ websocket: true }`. Envolver num plugin encapsulado próprio quebrava isso:
  // a rota /ws/presenca virava um GET HTTP comum e nunca fazia o upgrade.
  app.register(websocket);

  app.register(helmet);
  app.register(cors, { origin: config.corsOrigin, credentials: true });
  app.register(cookie, { secret: config.cookieSecret });
  // Teto global por IP. As rotas de auth apertam mais (config.rateLimit local),
  // porque o argon2 é memory-hard e cada POST custa caro (ver 2.5.4).
  app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  app.register(rotasWs);

  app.setErrorHandler((err: FastifyError | ZodError | Error, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ erro: 'validação', detalhes: err.issues });
    }
    const statusCode = 'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : undefined;
    const codigo = statusCode !== undefined && statusCode >= 400 ? statusCode : 500;
    if (codigo >= 500) req.log.error(err);
    return reply.code(codigo).send({ erro: codigo >= 500 ? 'erro interno' : err.message });
  });

  // Health LEVE: só confirma que o banco responde (1 ida). O check pesado de
  // schema (várias consultas ao information_schema) roda no boot em main() — se o
  // schema estiver velho, o processo nem sobe. Tirar o schema daqui deixa o
  // health-check do Render e o "ping" anti cold start baratos e rápidos.
  app.get('/health', async (_req, reply) => {
    try {
      const linhas = await sql<{ ok: number }[]>`select 1 as ok`;
      return { status: 'ok', db: linhas[0]?.ok === 1 };
    } catch {
      return reply.code(503).send({ status: 'sem_banco', db: false });
    }
  });

  app.register(rotasConfig);
  app.register(rotasPublico);
  app.register(rotasConta);
  app.register(rotasAuth);
  app.register(rotasColecoes);
  app.register(rotasCampos);
  app.register(rotasRegistros);
  app.register(rotasIntegracoes);
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
