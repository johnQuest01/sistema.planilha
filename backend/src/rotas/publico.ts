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
  type ParteCompartilhada,
} from '../repositorios/compartilhamentos';
import { lerLinkToken } from '../publico/link';
import type { Campo } from '../../../shared/tipos';

// Corpo do "gerar link": ids dos blocos escolhidos na prévia (na ordem não importa,
// a ordem de exibição vem sempre da estrutura do registro).
const gerarLinkSchema = z
  .object({ campos: z.array(z.string().min(1)).min(1).max(300) })
  .strict();

// Link UNIDO: várias planilhas / registros num único código público.
const gerarLinkGrupoSchema = z
  .object({
    titulo: z.string().max(500).optional(),
    partes: z
      .array(
        z
          .object({
            registroId: z.string().min(1),
            fonte: z.string().max(200).default(''),
            campos: z.array(z.string().min(1)).min(1).max(300),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();

// Prazo (em dias, do config) até o link expirar. 0/negativo = nunca expira (null).
function calcularExpiraEmData(): Date | null {
  const dias = config.linkPublicoDias;
  return dias <= 0 ? null : new Date(Date.now() + dias * 86400 * 1000);
}

function filtrarCamposValores(
  dados: { campos: Campo[]; registro: { valores: Record<string, unknown> } },
  blocos: string[] | '*',
): { campos: Campo[]; valores: Record<string, unknown> } {
  const sel = blocos === '*' ? null : new Set(blocos);
  const campos: Campo[] = sel === null ? dados.campos : dados.campos.filter((c) => sel.has(c.id));
  const valores: Record<string, unknown> = {};
  for (const c of campos) {
    const v = dados.registro.valores[c.id];
    if (v !== undefined) valores[c.id] = v;
  }
  return { campos, valores };
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

  // --- Gerar link UNIDO (AUTENTICADO): várias planilhas num único /r/:codigo. ---
  app.post(
    '/api/compartilhamentos/grupo',
    { preHandler: [exigeDono] },
    async (req, reply) => {
      const body = gerarLinkGrupoSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);

      const partesOk: ParteCompartilhada[] = [];
      for (const p of body.partes) {
        const colecaoId = await comConta(contaId, (tx) => obterColecaoIdDoRegistro(tx, p.registroId));
        if (colecaoId === null) {
          return reply.code(404).send({ erro: `registro não encontrado (${p.fonte || p.registroId})` });
        }
        const acesso = await comConta(contaId, (tx) =>
          verificarAcessoColecao(tx, colecaoId, { id: u.id, email: u.email, papel: u.papel }),
        );
        if (acesso === 'nao-encontrado') {
          return reply.code(404).send({ erro: `registro não encontrado (${p.fonte || p.registroId})` });
        }
        if (acesso === 'bloqueado') {
          return reply.code(403).send({ erro: 'senha necessária', bloqueada: true });
        }
        partesOk.push({
          registroId: p.registroId,
          fonte: p.fonte,
          blocos: p.campos,
        });
      }

      const ancora = partesOk[0];
      if (ancora === undefined) {
        return reply.code(400).send({ erro: 'selecione ao menos um bloco' });
      }

      const codigo = await comConta(contaId, (tx) =>
        criarCompartilhamento(tx, contaId, {
          registroId: ancora.registroId,
          blocos: ancora.blocos,
          partes: partesOk,
          titulo: body.titulo ?? null,
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
      if (carga !== null) {
        alvo = {
          contaId: carga.c,
          registroId: carga.r,
          blocos: carga.s,
          partes: null,
          titulo: null,
        };
      }
    } else {
      // Formato novo: código curto guardado no banco.
      alvo = await lerCompartilhamento(chave);
    }
    if (alvo === null) return reply.code(404).send({ erro: 'link inválido ou expirado' });
    const a = alvo;

    // Link UNIDO: várias partes (planilhas) no mesmo código.
    if (a.partes !== null && a.partes.length > 0) {
      const partes: { fonte: string; campos: Campo[]; valores: Record<string, unknown> }[] = [];
      for (const p of a.partes) {
        const dados = await comConta(a.contaId, (tx) => lerRegistroComCampos(tx, p.registroId));
        if (dados === null) continue;
        const filtrado = filtrarCamposValores(dados, p.blocos);
        if (filtrado.campos.length === 0) continue;
        partes.push({ fonte: p.fonte, ...filtrado });
      }
      if (partes.length === 0) return reply.code(404).send({ erro: 'registro não encontrado' });
      void reply.header('cache-control', 'public, max-age=60');
      return reply.send({
        titulo: a.titulo,
        partes,
        r2PublicBase: process.env.R2_PUBLIC_BASE ?? '',
      });
    }

    const dados = await comConta(a.contaId, (tx) => lerRegistroComCampos(tx, a.registroId));
    if (dados === null) return reply.code(404).send({ erro: 'registro não encontrado' });

    const filtrado = filtrarCamposValores(dados, a.blocos);

    // Cache curto na borda ajuda quando o link é aberto por várias pessoas.
    void reply.header('cache-control', 'public, max-age=60');
    return reply.send({
      campos: filtrado.campos,
      valores: filtrado.valores,
      r2PublicBase: process.env.R2_PUBLIC_BASE ?? '',
    });
  });
}
