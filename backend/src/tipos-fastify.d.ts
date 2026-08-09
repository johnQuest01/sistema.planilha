import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    // Preenchidos só pelo preHandler `exigeDono`. contaId é o workspace ativo da sessão.
    contaId?: string;
    usuario?: {
      id: string;
      nome: string;
      email: string;
      papel: 'dono' | 'membro';
      contaHomeId?: string;
      contaNome?: string;
    };
  }
}
