import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

export const paramsIdSchema = z.object({ id: z.string().uuid() }).strict();

// preHandler pras rotas com `:id`. `:id` que não é uuid faria o postgres estourar
// 22P02 e virar 500 (ver 2.5.5). Aqui vira 404 — não 400: não confirmamos formato
// de recurso pra quem não tem acesso.
export async function validaIdParam(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!paramsIdSchema.safeParse(req.params).success) {
    await reply.code(404).send({ erro: 'não encontrado' });
  }
}
