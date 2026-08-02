import { z } from 'zod';

const MB = 1024 * 1024;

// O cliente gera duas derivadas JPEG (seção 6.1); informa mime e os dois
// tamanhos, e o presign assina o ContentLength exato — teto 4 MB cheia / 200 KB mini.
export const uploadSchema = z
  .object({
    mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    tamanhoCheia: z.number().int().positive().max(4 * MB),
    tamanhoMini: z.number().int().positive().max(200 * 1024),
  })
  .strict();
