import type { FastifyInstance } from 'fastify';
import { comConta } from '../db/comConta';
import { exigeDono, contaObrigatoria } from '../auth/exigeDono';
import { validaIdParam } from '../validacao/params';
import { uploadSchema } from '../validacao/upload';
import { obterColecaoIdDoRegistro } from '../repositorios/registros';
import { novaKey, keyMini, presignPut, extDoMime } from '../r2/r2';

// Equivalente do dono ao POST /p/:token/upload do convite (Fase 6). A key é gerada
// pelo servidor; o cliente sobe as duas derivadas e só então faz o PATCH do registro
// com a key (ver 6.1).
export async function rotasUpload(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/api/registros/:id/upload',
    { preHandler: [exigeDono, validaIdParam] },
    async (req, reply) => {
      const { mime, tamanhoCheia, tamanhoMini } = uploadSchema.parse(req.body);
      const contaId = contaObrigatoria(req);

      // RLS garante que o registro é do dono; senão vem null → 404.
      const colecaoId = await comConta(contaId, (tx) =>
        obterColecaoIdDoRegistro(tx, req.params.id),
      );
      if (colecaoId === null) return reply.code(404).send({ erro: 'registro não encontrado' });

      const ext = extDoMime(mime);
      if (ext === null) return reply.code(400).send({ erro: 'mime não suportado' });

      const key = novaKey(colecaoId, req.params.id, ext);
      const [urlCheia, urlMini] = await Promise.all([
        presignPut(key, mime, tamanhoCheia),
        presignPut(keyMini(key), mime, tamanhoMini),
      ]);

      return reply.send({ key, urlCheia, urlMini });
    },
  );
}
