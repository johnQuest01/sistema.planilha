import type { FastifyInstance } from 'fastify';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import { ehDonoWorkspace } from '../auth/acessoColecao';
import { validaIdParam } from '../validacao/params';
import { criarIntegracaoSchema, editarIntegracaoSchema } from '../validacao/integracao';
import {
  apagarIntegracao,
  criarIntegracao,
  definirIntegracaoArquivada,
  editarIntegracao,
  listarIntegracoes,
  obterIntegracao,
} from '../repositorios/integracoes';

export async function rotasIntegracoes(app: FastifyInstance): Promise<void> {
  app.get('/api/integracoes', { preHandler: exigeDono }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const u = usuarioObrigatorio(req);
    const integracoes = await comConta(contaId, (tx) => listarIntegracoes(tx, contaId, u.email));
    return reply.send(integracoes);
  });

  app.post('/api/integracoes', { preHandler: exigeDono }, async (req, reply) => {
    const dados = criarIntegracaoSchema.parse(req.body);
    const contaId = contaObrigatoria(req);
    const u = usuarioObrigatorio(req);
    const resultado = await comConta(contaId, (tx) =>
      criarIntegracao(tx, contaId, dados, u.id),
    );
    if ('erro' in resultado) {
      return reply.code(400).send({ erro: 'escolha ao menos duas planilhas válidas' });
    }
    return reply.code(201).send(resultado);
  });

  app.get<{ Params: { id: string } }>(
    '/api/integracoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const integracao = await comConta(contaId, (tx) => obterIntegracao(tx, req.params.id));
      if (integracao === null) return reply.code(404).send({ erro: 'integração não encontrada' });
      // Arquivada some (404) para quem não é o dono do workspace: bloqueia abrir por URL.
      if (integracao.arquivada && !ehDonoWorkspace(u.email)) {
        return reply.code(404).send({ erro: 'integração não encontrada' });
      }
      return reply.send(integracao);
    },
  );

  // Arquivar / desarquivar a planilha unida — só o dono do workspace.
  app.post<{ Params: { id: string } }>(
    '/api/integracoes/:id/arquivar',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const u = usuarioObrigatorio(req);
      if (!ehDonoWorkspace(u.email)) {
        return reply.code(403).send({ erro: 'só o dono do workspace pode arquivar planilhas unidas' });
      }
      const contaId = contaObrigatoria(req);
      const r = await comConta(contaId, (tx) => definirIntegracaoArquivada(tx, req.params.id, true));
      if (r === 'nao-encontrado') return reply.code(404).send({ erro: 'integração não encontrada' });
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/integracoes/:id/desarquivar',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const u = usuarioObrigatorio(req);
      if (!ehDonoWorkspace(u.email)) {
        return reply.code(403).send({ erro: 'só o dono do workspace pode desarquivar planilhas unidas' });
      }
      const contaId = contaObrigatoria(req);
      const r = await comConta(contaId, (tx) => definirIntegracaoArquivada(tx, req.params.id, false));
      if (r === 'nao-encontrado') return reply.code(404).send({ erro: 'integração não encontrada' });
      return reply.send({ ok: true });
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/integracoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const patch = editarIntegracaoSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const resultado = await comConta(contaId, (tx) => editarIntegracao(tx, req.params.id, patch));
      if (resultado === null) return reply.code(404).send({ erro: 'integração não encontrada' });
      if ('erro' in resultado) {
        return reply.code(400).send({ erro: 'escolha ao menos duas planilhas válidas' });
      }
      return reply.send(resultado);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/integracoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const apagou = await comConta(contaId, (tx) => apagarIntegracao(tx, req.params.id));
      if (!apagou) return reply.code(404).send({ erro: 'integração não encontrada' });
      return reply.code(204).send();
    },
  );
}
