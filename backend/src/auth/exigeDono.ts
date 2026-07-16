import type { FastifyReply, FastifyRequest } from 'fastify';
import { NOME_COOKIE_SESSAO } from './cookies';
import { contaDaSessao, FORMATO_ID_SESSAO } from './sessoes';

// preHandler do CAMINHO DONO. Único que habilita mexer em ESTRUTURA.
// Não compartilha código com o caminho de convite (ver seção 6.1) — de propósito.
export async function exigeDono(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const assinado = req.cookies[NOME_COOKIE_SESSAO];
  if (assinado === undefined) {
    await reply.code(401).send({ erro: 'não autenticado' });
    return;
  }

  const conferido = req.unsignCookie(assinado);
  if (!conferido.valid || conferido.value === null || !FORMATO_ID_SESSAO.test(conferido.value)) {
    await reply.code(401).send({ erro: 'sessão inválida' });
    return;
  }

  // A sessão precisa existir, não estar revogada e não ter expirado.
  const contaId = await contaDaSessao(conferido.value);
  if (contaId === null) {
    await reply.code(401).send({ erro: 'sessão inválida' });
    return;
  }

  req.contaId = contaId;
}

// Lê a conta já validada pelo preHandler. Evita `!` non-null nos handlers.
export function contaObrigatoria(req: FastifyRequest): string {
  const id = req.contaId;
  if (id === undefined) {
    throw new Error('contaObrigatoria chamada sem exigeDono no preHandler');
  }
  return id;
}
