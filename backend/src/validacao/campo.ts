import { z } from 'zod';
import { TIPOS_CAMPO, TIPOS_SUBCAMPO } from '../../../shared/tipos';

// Config de um subcampo (quadradinho dentro de uma seção): não aninha outra seção.
const subConfigSchema = z
  .object({
    opcoes: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    sufixo: z.string().trim().max(16).optional(),
    obrigatorio: z.boolean().optional(),
    autoAgora: z.boolean().optional(),
    // maxFotos: só para subcampo de imagem. Mesmo teto do bloco de imagem (1..10).
    maxFotos: z.number().int().min(1).max(10).optional(),
  })
  .strict();

const subCampoSchema = z
  .object({
    id: z.string().uuid(),
    nome: z.string().trim().min(1).max(60),
    tipo: z.enum(TIPOS_SUBCAMPO),
    config: subConfigSchema.default({}),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.tipo === 'selecao' && (s.config.opcoes?.length ?? 0) === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'seleção exige ao menos uma opção',
        path: ['config', 'opcoes'],
      });
    }
    if (s.tipo !== 'imagem' && s.config.maxFotos !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'maxFotos só se aplica a subcampo de imagem',
        path: ['config', 'maxFotos'],
      });
    }
  });

const configSchema = z
  .object({
    opcoes: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    sufixo: z.string().trim().max(16).optional(),
    obrigatorio: z.boolean().optional(),
    // Teto de 10 não é estético: cada foto é uma key no jsonb, um objeto no R2 e um
    // PUT contra o rate limit do convite (ver seção 4.2). Só para tipo 'imagem'.
    maxFotos: z.number().int().min(1).max(10).optional(),
    // data/datahora: já vem com o momento atual ao criar registro.
    autoAgora: z.boolean().optional(),
    // secao: os quadradinhos que se repetem por linha (1..50).
    subcampos: z.array(subCampoSchema).min(1).max(50).optional(),
    // opcional: cabeçalho exibido acima do bloco (qualquer tipo).
    titulo: z.string().trim().max(80).optional(),
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

// `maxFotos` só faz sentido em bloco de imagem (ver seção 4.2). Mesma lógica do
// exigeOpcoesSeSelecao acima.
function proibeMaxFotosSeNaoImagem(
  tipo: (typeof TIPOS_CAMPO)[number],
  maxFotos: number | undefined,
  ctx: z.RefinementCtx,
): void {
  if (tipo !== 'imagem' && maxFotos !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'maxFotos só se aplica a bloco de imagem',
      path: ['config', 'maxFotos'],
    });
  }
}

// Seção precisa de ao menos um subcampo; e subcampos só existem em seção.
function exigeSubcamposSeSecao(
  tipo: (typeof TIPOS_CAMPO)[number],
  subcampos: unknown[] | undefined,
  ctx: z.RefinementCtx,
): void {
  if (tipo === 'secao' && (subcampos === undefined || subcampos.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'seção exige ao menos um campo',
      path: ['config', 'subcampos'],
    });
  }
  if (tipo !== 'secao' && subcampos !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'subcampos só se aplicam a seção',
      path: ['config', 'subcampos'],
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
  .superRefine((val, ctx) => {
    exigeOpcoesSeSelecao(val.tipo, val.config.opcoes, ctx);
    proibeMaxFotosSeNaoImagem(val.tipo, val.config.maxFotos, ctx);
    exigeSubcamposSeSecao(val.tipo, val.config.subcampos, ctx);
  });

export const editarCampoSchema = z
  .object({
    nome: z.string().trim().min(1).max(60).optional(),
    tipo: tipoSchema.optional(),
    config: configSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'nada para editar' });

// Reordenação em lote: o cliente manda a ORDEM COMPLETA (não um delta). Assim uma
// resposta fora de ordem deixa de importar — a última requisição carrega a verdade
// inteira. A conferência de que os ids batem exatamente com os da coleção mora no
// repositório (precisa do estado do banco); aqui só garantimos a forma.
export const reordenarCamposSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(200) })
  .strict();

// Um campo COMPLETO como o front o guarda (id/ordem inclusos). Usado quando o
// registro traz seu próprio corpo (independente do corpo da coleção). Reaproveita
// as mesmas regras de config/tipo dos blocos da coleção.
const campoCompletoSchema = z
  .object({
    id: z.string().uuid(),
    // colecaoId/ordem são carregados pelo front; aceitos mas não confiáveis aqui.
    colecaoId: z.string().uuid().optional(),
    ordem: z.number().finite().optional(),
    nome: z.string().trim().min(1).max(60),
    tipo: tipoSchema,
    config: configSchema.default({}),
  })
  .strict()
  .superRefine((val, ctx) => {
    exigeOpcoesSeSelecao(val.tipo, val.config.opcoes, ctx);
    proibeMaxFotosSeNaoImagem(val.tipo, val.config.maxFotos, ctx);
    exigeSubcamposSeSecao(val.tipo, val.config.subcampos, ctx);
  });

// Corpo próprio de um registro: lista de blocos (0..200) com ids únicos.
export const corpoRegistroSchema = z
  .array(campoCompletoSchema)
  .max(200)
  .superRefine((campos, ctx) => {
    const vistos = new Set<string>();
    for (const c of campos) {
      if (vistos.has(c.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ids de bloco repetidos no corpo' });
        return;
      }
      vistos.add(c.id);
    }
  });

export type CampoCompleto = z.infer<typeof campoCompletoSchema>;

export type CriarCampo = z.infer<typeof criarCampoSchema>;
export type EditarCampo = z.infer<typeof editarCampoSchema>;
export type ReordenarCampos = z.infer<typeof reordenarCamposSchema>;
