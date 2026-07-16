import type { FastifyReply, FastifyRequest } from 'fastify';
import { NOME_COOKIE_SESSAO } from './cookies';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// preHandler do CAMINHO DONO. Único que habilita mexer em ESTRUTURA.
// Não compartilha código com o caminho de convite (ver seção 6.1) — de propósito.
export async function exigeDono(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const assinado = req.cookies[NOME_COOKIE_SESSAO];
  if (assinado === undefined) {
    await reply.code(401).send({ erro: 'não autenticado' });
    return;
  }

  const conferido = req.unsignCookie(assinado);
  if (!conferido.valid || conferido.value === null || !UUID.test(conferido.value)) {
    await reply.code(401).send({ erro: 'sessão inválida' });
    return;
  }

  req.contaId = conferido.value;
}

// Lê a conta já validada pelo preHandler. Evita `!` non-null nos handlers.
export function contaObrigatoria(req: FastifyRequest): string {
  const id = req.contaId;
  if (id === undefined) {
    throw new Error('contaObrigatoria chamada sem exigeDono no preHandler');
  }
  return id;
}
