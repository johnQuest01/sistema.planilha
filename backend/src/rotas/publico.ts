import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import { verificarAcessoColecao } from '../auth/acessoColecao';
import { validaIdParam } from '../validacao/params';
import { obterColecaoIdDoRegistro, lerRegistroComCampos } from '../repositorios/registros';
import {
  criarCompartilhamento,
  lerCompartilhamento,
  revogarCompartilhamento,
  type AlvoCompartilhado,
} from '../repositorios/compartilhamentos';
import { lerLinkToken } from '../publico/link';
import type { Campo } from '../../../shared/tipos';

// Corpo do "gerar link": ids dos blocos escolhidos na prévia (na ordem não importa,
// a ordem de exibição vem sempre da estrutura do registro).
const gerarLinkSchema = z
  .object({ campos: z.array(z.string().min(1)).min(1).max(300) })
  .strict();

// Prazo (em dias, do config) até o link expirar. 0/negativo = nunca expira (null).
function calcularExpiraEmData(): Date | null {
  const dias = config.linkPublicoDias;
  return dias <= 0 ? null : new Date(Date.now() + dias * 86400 * 1000);
}

export async function rotasPublico(app: FastifyInstance): Promise<void> {
  // --- Gerar link CURTO (AUTENTICADO): só quem tem acesso ao registro gera o link. ---
  app.post<{ Params: { id: string } }>(
    '/api/registros/:id/link',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { campos } = gerarLinkSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);

      const colecaoId = await comConta(contaId, (tx) => obterColecaoIdDoRegistro(tx, req.params.id));
      if (colecaoId === null) return reply.code(404).send({ erro: 'registro não encontrado' });

      // Precisa ter acesso à planilha (respeita senha para quem não é dono/whitelist).
      const acesso = await comConta(contaId, (tx) =>
        verificarAcessoColecao(tx, colecaoId, { id: u.id, email: u.email, papel: u.papel }),
      );
      if (acesso === 'nao-encontrado') return reply.code(404).send({ erro: 'registro não encontrado' });
      if (acesso === 'bloqueado') return reply.code(403).send({ erro: 'senha necessária', bloqueada: true });

      const codigo = await comConta(contaId, (tx) =>
        criarCompartilhamento(tx, contaId, {
          registroId: req.params.id,
          blocos: campos,
          expiraEm: calcularExpiraEmData(),
          criadoPor: u.nome,
        }),
      );
      return reply.send({ codigo });
    },
  );

  // --- Revogar UM link específico (AUTENTICADO). ---
  app.delete<{ Params: { id: string; codigo: string } }>(
    '/api/registros/:id/link/:codigo',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const afetados = await comConta(contaId, (tx) => revogarCompartilhamento(tx, req.params.codigo));
      return reply.send({ revogado: afetados > 0 });
    },
  );

  // --- Ver registro por link (PÚBLICO, sem login). Só os blocos selecionados. ---
  // Aceita o CÓDIGO curto novo e, por compatibilidade, o token assinado antigo.
  app.get<{ Params: { codigo: string } }>('/api/publico/r/:codigo', async (req, reply) => {
    const chave = req.params.codigo;

    let alvo: AlvoCompartilhado | null = null;
    if (chave.includes('.')) {
      // Formato antigo: token assinado (payload.assinatura).
      const carga = lerLinkToken(chave);
      if (carga !== null) alvo = { contaId: carga.c, registroId: carga.r, blocos: carga.s };
    } else {
      // Formato novo: código curto guardado no banco.
      alvo = await lerCompartilhamento(chave);
    }
    if (alvo === null) return reply.code(404).send({ erro: 'link inválido ou expirado' });
    const a = alvo; // const p/ o narrowing sobreviver dentro do closure

    const dados = await comConta(a.contaId, (tx) => lerRegistroComCampos(tx, a.registroId));
    if (dados === null) return reply.code(404).send({ erro: 'registro não encontrado' });

    // Filtra para EXPOR só os blocos escolhidos (mantém a ordem da estrutura).
    const sel = a.blocos === '*' ? null : new Set(a.blocos);
    const campos: Campo[] = sel === null ? dados.campos : dados.campos.filter((c) => sel.has(c.id));
    const valores: Record<string, unknown> = {};
    for (const c of campos) {
      const v = dados.registro.valores[c.id];
      if (v !== undefined) valores[c.id] = v;
    }

    // Cache curto na borda ajuda quando o link é aberto por várias pessoas.
    void reply.header('cache-control', 'public, max-age=60');
    return reply.send({
      campos,
      valores,
      r2PublicBase: process.env.R2_PUBLIC_BASE ?? '',
    });
  });
}
