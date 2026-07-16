import { z } from 'zod';
import type { Campo, ConfigCampo, TipoCampo } from '../../../shared/tipos';

// Enforça exatamente a forma que o SERVIDOR gera (seção 7.2): <uuid>/<uuid>/<nano21>.<ext>.
// Regex frouxa aqui vira chave aceita que o servidor nunca emitiu (ver seção 4.3).
const R2_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-]{21}\.(jpe?g|png|webp)$/;

// datetime-local: "YYYY-MM-DDTHH:mm" (segundos opcionais). Sem fuso — hora local do cliente.
const DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

// Validador de um valor a partir do tipo + config. Reutilizado pelos subcampos da seção.
function schemaPorTipo(tipo: TipoCampo, config: ConfigCampo): z.ZodTypeAny {
  switch (tipo) {
    case 'texto':
    case 'paragrafo':
      return z.string();
    case 'numero':
      return z.number().finite();
    case 'data':
      return z.string().date();
    case 'datahora':
      return z.string().regex(DATA_HORA);
    case 'booleano':
      return z.boolean();
    case 'imagem':
      return z.array(z.string().regex(R2_KEY)).max(config.maxFotos ?? 1);
    case 'selecao': {
      const opcoes = config.opcoes ?? [];
      const [primeira, ...resto] = opcoes;
      // selecao sem opções não aceita valor nenhum — falha explícita, não string livre.
      if (primeira === undefined) return z.never();
      return z.enum([primeira, ...resto]);
    }
    case 'secao': {
      // O valor é uma lista de linhas; cada linha é um objeto {subcampoId: valor}.
      const subs = config.subcampos ?? [];
      const linha: z.ZodRawShape = {};
      for (const s of subs) linha[s.id] = schemaPorTipo(s.tipo, s.config).optional();
      return z.array(z.object(linha).strict()).max(500);
    }
    default:
      return z.never();
  }
}

function schemaDoCampo(c: Campo): z.ZodTypeAny {
  return schemaPorTipo(c.tipo, c.config);
}

// Monta o schema dos `valores` a partir dos campos da coleção. `.strict()` derruba
// qualquer chave que não seja id de campo daquela coleção. Todos opcionais: registro
// sem um valor (ou sem foto) é válido, e o PATCH é merge (ver seção 5).
export function schemaDeValores(campos: Campo[]): z.ZodObject<z.ZodRawShape, 'strict'> {
  const shape: z.ZodRawShape = {};
  for (const c of campos) {
    shape[c.id] = schemaDoCampo(c).optional();
  }
  return z.object(shape).strict();
}
