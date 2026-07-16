import { z } from 'zod';

const MB = 1024 * 1024;

// O servidor gera duas derivadas JPEG (seção 6.1); o cliente informa mime e os dois
// tamanhos, e o presign assina o ContentLength exato — teto 2 MB cheia / 200 KB mini.
export const uploadSchema = z
  .object({
    mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    tamanhoCheia: z.number().int().positive().max(2 * MB),
    tamanhoMini: z.number().int().positive().max(200 * 1024),
  })
  .strict();
