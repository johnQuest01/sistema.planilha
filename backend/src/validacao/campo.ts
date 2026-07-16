import { z } from 'zod';
import { TIPOS_CAMPO } from '../../../shared/tipos';

const configSchema = z
  .object({
    opcoes: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    sufixo: z.string().trim().max(16).optional(),
    obrigatorio: z.boolean().optional(),
  })
  .strict();

const tipoSchema = z.enum(TIPOS_CAMPO);

// `selecao` só faz sentido com pelo menos uma opção — falha explícita, não
// string livre (mesma regra do validador de valores, seção 6.2).
function exigeOpcoesSeSelecao(
  tipo: (typeof TIPOS_CAMPO)[number],
  opcoes: string[] | undefined,
  ctx: z.RefinementCtx,
): void {
  if (tipo === 'selecao' && (opcoes === undefined || opcoes.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'seleção exige ao menos uma opção',
      path: ['config', 'opcoes'],
    });
  }
}

export const criarCampoSchema = z
  .object({
    nome: z.string().trim().min(1).max(60),
    tipo: tipoSchema,
    config: configSchema.default({}),
  })
  .strict()
  .superRefine((val, ctx) => exigeOpcoesSeSelecao(val.tipo, val.config.opcoes, ctx));

export const editarCampoSchema = z
  .object({
    nome: z.string().trim().min(1).max(60).optional(),
    tipo: tipoSchema.optional(),
    config: configSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'nada para editar' });

export const moverCampoSchema = z
  .object({ direcao: z.enum(['cima', 'baixo']) })
  .strict();

export type CriarCampo = z.infer<typeof criarCampoSchema>;
export type EditarCampo = z.infer<typeof editarCampoSchema>;
