import type { FastifyReply, FastifyRequest } from 'fastify';
import { NOME_COOKIE_SESSAO } from './cookies';
import { usuarioDaSessao, FORMATO_ID_SESSAO } from './sessoes';

// preHandler de autenticação: valida a sessão e resolve o usuário logado. Todos os
// usuarios do workspace compartilham a mesma conta (contaId), então a RLS por conta
// continua funcionando; a distinção de quem é quem vem de req.usuario.
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
  const u = await usuarioDaSessao(conferido.value);
  if (u === null) {
    await reply.code(401).send({ erro: 'sessão inválida' });
    return;
  }

  req.contaId = u.contaId;
  req.usuario = { id: u.usuarioId, nome: u.nome, email: u.email, papel: u.papel };
}

// Lê a conta já validada pelo preHandler. Evita `!` non-null nos handlers.
export function contaObrigatoria(req: FastifyRequest): string {
  const id = req.contaId;
  if (id === undefined) {
    throw new Error('contaObrigatoria chamada sem exigeDono no preHandler');
  }
  return id;
}

// Lê o usuário logado já resolvido pelo preHandler.
export function usuarioObrigatorio(req: FastifyRequest): {
  id: string;
  nome: string;
  email: string;
  papel: 'dono' | 'membro';
} {
  const u = req.usuario;
  if (u === undefined) {
    throw new Error('usuarioObrigatorio chamado sem exigeDono no preHandler');
  }
  return u;
}
