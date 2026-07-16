import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    // Preenchidos só pelo preHandler `exigeDono`. contaId é o workspace; usuario é quem logou.
    contaId?: string;
    usuario?: {
      id: string;
      nome: string;
      email: string;
      papel: 'dono' | 'membro';
    };
  }
}
