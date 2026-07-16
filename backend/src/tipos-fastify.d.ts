import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    // Preenchido só pelo preHandler `exigeDono`. É o id da conta autenticada.
    contaId?: string;
  }
}
