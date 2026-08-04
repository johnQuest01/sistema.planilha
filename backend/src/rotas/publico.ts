import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import { verificarAcessoColecao } from '../auth/acessoColecao';
import { validaIdParam } from '../validacao/params';
import { obterColecaoIdDoRegistro, lerRegistroComCampos } from '../repositorios/registros';
import { gerarLinkToken, lerLinkToken, calcularExpiraEm } from '../publico/link';
import type { Campo } from '../../../shared/tipos';

// Corpo do "gerar link": ids dos blocos escolhidos na prévia (na ordem não importa,
// a ordem de exibição vem sempre da estrutura do registro).
const gerarLinkSchema = z
  .object({ campos: z.array(z.string().min(1)).min(1).max(300) })
  .strict();

export async function rotasPublico(app: FastifyInstance): Promise<void> {
  // --- Gerar link (AUTENTICADO): só quem tem acesso ao registro gera o link. ---
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

      const token = gerarLinkToken({
        c: contaId,
        r: req.params.id,
        s: campos,
        e: calcularExpiraEm(),
      });
      return reply.send({ token });
    },
  );

  // --- Ver registro por link (PÚBLICO, sem login). Só os blocos selecionados. ---
  app.get<{ Params: { token: string } }>('/api/publico/r/:token', async (req, reply) => {
    const carga = lerLinkToken(req.params.token);
    if (carga === null) {
      return reply.code(404).send({ erro: 'link inválido ou expirado' });
    }

    const dados = await comConta(carga.c, (tx) => lerRegistroComCampos(tx, carga.r));
    if (dados === null) return reply.code(404).send({ erro: 'registro não encontrado' });

    // Filtra para EXPOR só os blocos escolhidos (mantém a ordem da estrutura).
    const sel = carga.s === '*' ? null : new Set(carga.s);
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
