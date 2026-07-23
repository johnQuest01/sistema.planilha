import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria, usuarioObrigatorio } from '../auth/exigeDono';
import {
  desbloquearColecao,
  definirSenhaOficina,
  verificarAcessoColecao,
} from '../auth/acessoColecao';
import { validaIdParam } from '../validacao/params';
import { criarColecaoSchema, renomearColecaoSchema } from '../validacao/colecao';
import {
  apagarColecao,
  criarColecao,
  duplicarColecao,
  listarColecoes,
  obterColecao,
  renomearColecao,
} from '../repositorios/colecoes';

const senhaPlanilhaSchema = z
  .object({
    senha: z.string().min(4, 'mínimo 4 caracteres').max(200),
  })
  .strict();

export async function rotasColecoes(app: FastifyInstance): Promise<void> {
  app.post('/api/colecoes', { preHandler: exigeDono }, async (req, reply) => {
    const { nome } = criarColecaoSchema.parse(req.body);
    const contaId = contaObrigatoria(req);
    const u = usuarioObrigatorio(req);
    const colecao = await comConta(contaId, (tx) =>
      criarColecao(tx, contaId, nome, u.id, { email: u.email, usuarioId: u.id }),
    );
    return reply.code(201).send(colecao);
  });

  app.get('/api/colecoes', { preHandler: exigeDono }, async (req, reply) => {
    const contaId = contaObrigatoria(req);
    const u = usuarioObrigatorio(req);
    const colecoes = await comConta(contaId, (tx) =>
      listarColecoes(tx, contaId, { email: u.email, usuarioId: u.id }),
    );
    return reply.send(colecoes);
  });

  app.get<{ Params: { id: string } }>(
    '/api/colecoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const colecao = await comConta(contaId, (tx) =>
        obterColecao(tx, req.params.id, { email: u.email, usuarioId: u.id }),
      );
      if (colecao === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      if (colecao.bloqueada) {
        return reply.code(403).send({
          erro: 'senha necessária',
          bloqueada: true,
          id: colecao.id,
          nome: colecao.nome,
        });
      }
      return reply.send(colecao);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/colecoes/:id/desbloquear',
    { preHandler: [exigeDono, validaIdParam], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { senha } = senhaPlanilhaSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const resultado = await comConta(contaId, (tx) =>
        desbloquearColecao(tx, req.params.id, u.id, senha),
      );
      if (resultado === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      if (resultado === 'sem-senha') {
        return reply.code(400).send({ erro: 'esta planilha não tem senha' });
      }
      if (resultado === 'senha-errada') {
        return reply.code(403).send({ erro: 'senha inválida' });
      }
      const colecao = await comConta(contaId, (tx) =>
        obterColecao(tx, req.params.id, { email: u.email, usuarioId: u.id }),
      );
      return reply.send(colecao);
    },
  );

  // Só o dono define/troca a senha da Oficina.
  app.patch<{ Params: { id: string } }>(
    '/api/colecoes/:id/senha',
    { preHandler: [exigeDono, validaIdParam], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const u = usuarioObrigatorio(req);
      if (u.papel !== 'dono') {
        return reply.code(403).send({ erro: 'só o dono pode definir a senha da Oficina' });
      }
      const { senha } = senhaPlanilhaSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const resultado = await comConta(contaId, (tx) =>
        definirSenhaOficina(tx, req.params.id, senha),
      );
      if (resultado === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      if (resultado === 'nao-oficina') {
        return reply.code(400).send({
          erro: 'só a planilha chamada Oficina pode ter senha',
        });
      }
      return reply.send({ ok: true });
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/colecoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { nome } = renomearColecaoSchema.parse(req.body);
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const acesso = await comConta(contaId, (tx) =>
        verificarAcessoColecao(tx, req.params.id, { id: u.id, email: u.email }),
      );
      if (acesso === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      if (acesso === 'bloqueado') {
        return reply.code(403).send({ erro: 'senha necessária', bloqueada: true });
      }
      const colecao = await comConta(contaId, (tx) =>
        renomearColecao(tx, req.params.id, nome, { email: u.email, usuarioId: u.id }),
      );
      if (colecao === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.send(colecao);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/colecoes/:id/duplicar',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const acesso = await comConta(contaId, (tx) =>
        verificarAcessoColecao(tx, req.params.id, { id: u.id, email: u.email }),
      );
      if (acesso === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      if (acesso === 'bloqueado') {
        return reply.code(403).send({ erro: 'senha necessária', bloqueada: true });
      }
      const copia = await comConta(contaId, (tx) =>
        duplicarColecao(tx, contaId, req.params.id, u.id, {
          email: u.email,
          usuarioId: u.id,
        }),
      );
      if (copia === null) return reply.code(404).send({ erro: 'coleção não encontrada' });
      return reply.code(201).send(copia);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/colecoes/:id',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const contaId = contaObrigatoria(req);
      const u = usuarioObrigatorio(req);
      const acesso = await comConta(contaId, (tx) =>
        verificarAcessoColecao(tx, req.params.id, { id: u.id, email: u.email }),
      );
      if (acesso === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      if (acesso === 'bloqueado') {
        return reply.code(403).send({ erro: 'senha necessária', bloqueada: true });
      }
      const resultado = await comConta(contaId, (tx) =>
        apagarColecao(tx, req.params.id, { id: u.id, nome: u.nome, papel: u.papel }),
      );
      if (resultado === 'nao-encontrado') {
        return reply.code(404).send({ erro: 'coleção não encontrada' });
      }
      if (resultado === 'proibido') {
        return reply.code(403).send({ erro: 'só quem criou (ou o dono) pode apagar esta planilha' });
      }
      return reply.code(204).send();
    },
  );
}
