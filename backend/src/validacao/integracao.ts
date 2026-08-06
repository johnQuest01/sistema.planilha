import { z } from 'zod';

// Uma integração precisa de pelo menos 2 coleções para fazer sentido (unir uma na
// outra). A ordem do array define a ordem dos blocos no corpo unificado. Sem limite
// alto: o teto de 10 evita payload absurdo e loop de fetch no cliente.
const colecaoIdsSchema = z
  .array(z.string().uuid())
  .min(2, 'escolha ao menos duas planilhas')
  .max(10, 'no máximo 10 planilhas por integração');

export const criarIntegracaoSchema = z
  .object({
    nome: z.string().trim().min(1).max(80),
    colecaoIds: colecaoIdsSchema,
    ativo: z.boolean().optional(),
  })
  .strict();

// PATCH parcial: qualquer combinação de nome/colecaoIds/ativo. Ao menos um campo.
export const editarIntegracaoSchema = z
  .object({
    nome: z.string().trim().min(1).max(80).optional(),
    colecaoIds: colecaoIdsSchema.optional(),
    ativo: z.boolean().optional(),
  })
  .strict()
  .refine((o) => o.nome !== undefined || o.colecaoIds !== undefined || o.ativo !== undefined, {
    message: 'nada para atualizar',
  });
