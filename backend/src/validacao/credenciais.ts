import { z } from 'zod';

export const credenciaisSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    senha: z.string().min(8, 'mínimo 8 caracteres').max(200),
  })
  .strict();

export type Credenciais = z.infer<typeof credenciaisSchema>;
