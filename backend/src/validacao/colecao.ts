import { z } from 'zod';

export const criarColecaoSchema = z
  .object({ nome: z.string().trim().min(1).max(80) })
  .strict();

export const renomearColecaoSchema = criarColecaoSchema;
