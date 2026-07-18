import type { Tx } from '../db/comConta';
import type { Registro } from '../../../shared/tipos';
import { apagarObjeto, keyMini } from '../r2/r2';
import type { Ator } from './registros';
import { marcarLixoLimpo } from './lixo';

// Forma que o servidor gera (seção 7.2) — só keys reais entram na limpeza do R2.
const R2_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-]{21}\.(jpe?g|png|webp)$/;

export interface ItemLixeira {
  id: string;
  colecaoId: string;
  colecaoNome: string;
  registroId: string;
  valores: Record<string, unknown>;
  criadoPor: string | null;
  criadoPorId: string | null;
  criadoEm: string;
  atualizadoEm: string;
  apagadoEm: string;
  apagadoPorNome: string | null;
}

interface LinhaLixeira {
  id: string;
  conta_id: string;
  colecao_id: string;
  colecao_nome: string;
  registro_id: string;
  valores: Record<string, unknown> | null;
  criado_por: string | null;
  criado_por_id: string | null;
  criado_em: Date;
  atualizado_em: Date;
  apagado_em: Date;
  apagado_por_id: string | null;
  apagado_por_nome: string | null;
}

interface LinhaRegistro {
  id: string;
  colecao_id: string;
  valores: Record<string, unknown> | null;
  criado_por: string | null;
  criado_por_id: string | null;
  criado_em: Date;
  atualizado_em: Date;
}

function mapItem(r: LinhaLixeira): ItemLixeira {
  return {
    id: r.id,
    colecaoId: r.colecao_id,
    colecaoNome: r.colecao_nome,
    registroId: r.registro_id,
    valores: r.valores ?? {},
    criadoPor: r.criado_por,
    criadoPorId: r.criado_por_id,
    criadoEm: r.criado_em.toISOString(),
    atualizadoEm: r.atualizado_em.toISOString(),
    apagadoEm: r.apagado_em.toISOString(),
    apagadoPorNome: r.apagado_por_nome,
  };
}

export function coletarKeysR2DoJson(valor: unknown, out: string[] = []): string[] {
  if (typeof valor === 'string') {
    if (R2_KEY.test(valor)) out.push(valor);
    return out;
  }
  if (Array.isArray(valor)) {
    for (const item of valor) coletarKeysR2DoJson(item, out);
    return out;
  }
  if (valor !== null && typeof valor === 'object') {
    for (const v of Object.values(valor as Record<string, unknown>)) {
      coletarKeysR2DoJson(v, out);
    }
  }
  return out;
}

async function contaIdDaColecao(tx: Tx, colecaoId: string): Promise<string | null> {
  const rows = await tx<{ id: string }[]>`
    select conta_id::text as id from colecoes where id = ${colecaoId}`;
  return rows[0]?.id ?? null;
}

export type ResultadoMover = 'ok' | 'nao-encontrado' | 'proibido';

// Soft-delete: snapshot na lixeira + remove de `registros`. NÃO marca lixo_r2
// (fotos ficam no bucket para eventual restauração).
export async function moverRegistroParaLixeira(
  tx: Tx,
  registroId: string,
  ator: Ator,
): Promise<ResultadoMover> {
  const regs = await tx<LinhaRegistro[]>`
    select id, colecao_id, valores, criado_por, criado_por_id, criado_em, atualizado_em
    from registros where id = ${registroId}`;
  const atual = regs[0];
  if (atual === undefined) return 'nao-encontrado';

  const ehDono = ator.papel === 'dono';
  const ehCriador = atual.criado_por_id === ator.id;
  if (!ehDono && !ehCriador) return 'proibido';

  const contaId = await contaIdDaColecao(tx, atual.colecao_id);
  if (contaId === null) return 'nao-encontrado';

  const nomes = await tx<{ nome: string }[]>`
    select nome from colecoes where id = ${atual.colecao_id}`;
  const colecaoNome = nomes[0]?.nome ?? '';

  await tx`
    insert into lixeira_registros (
      conta_id, colecao_id, colecao_nome, registro_id, valores,
      criado_por, criado_por_id, criado_em, atualizado_em,
      apagado_por_id, apagado_por_nome
    ) values (
      ${contaId}::uuid, ${atual.colecao_id}, ${colecaoNome}, ${atual.id},
      ${tx.json((atual.valores ?? {}) as never)},
      ${atual.criado_por}, ${atual.criado_por_id}, ${atual.criado_em}, ${atual.atualizado_em},
      ${ator.id}::uuid, ${ator.nome}
    )`;

  await tx`delete from registros where id = ${registroId}`;
  return 'ok';
}

export async function listarLixeira(tx: Tx): Promise<ItemLixeira[]> {
  const linhas = await tx<LinhaLixeira[]>`
    select id, conta_id, colecao_id, colecao_nome, registro_id, valores,
           criado_por, criado_por_id, criado_em, atualizado_em,
           apagado_em, apagado_por_id, apagado_por_nome
    from lixeira_registros
    order by apagado_em desc
    limit 200`;
  return linhas.map(mapItem);
}

export type ResultadoRestaurar = 'ok' | 'nao-encontrado' | 'colecao-sumiu' | 'id-ocupado';

export async function restaurarDaLixeira(
  tx: Tx,
  lixeiraId: string,
): Promise<{ resultado: ResultadoRestaurar; registro?: Registro }> {
  const itens = await tx<LinhaLixeira[]>`
    select id, conta_id, colecao_id, colecao_nome, registro_id, valores,
           criado_por, criado_por_id, criado_em, atualizado_em,
           apagado_em, apagado_por_id, apagado_por_nome
    from lixeira_registros where id = ${lixeiraId}`;
  const item = itens[0];
  if (item === undefined) return { resultado: 'nao-encontrado' };

  const colecao = await tx<{ id: string }[]>`
    select id from colecoes where id = ${item.colecao_id}`;
  if (colecao[0] === undefined) return { resultado: 'colecao-sumiu' };

  const conflito = await tx<{ id: string }[]>`
    select id from registros where id = ${item.registro_id}`;
  if (conflito[0] !== undefined) return { resultado: 'id-ocupado' };

  const inseridos = await tx<LinhaRegistro[]>`
    insert into registros (
      id, colecao_id, valores, criado_por, criado_por_id, criado_em, atualizado_em
    ) values (
      ${item.registro_id}, ${item.colecao_id}, ${tx.json((item.valores ?? {}) as never)},
      ${item.criado_por}, ${item.criado_por_id}, ${item.criado_em}, now()
    )
    returning id, colecao_id, valores, criado_por, criado_por_id, criado_em, atualizado_em`;

  const reg = inseridos[0];
  if (reg === undefined) throw new Error('restore não retornou registro');

  await tx`delete from lixeira_registros where id = ${lixeiraId}`;

  return {
    resultado: 'ok',
    registro: {
      id: reg.id,
      colecaoId: reg.colecao_id,
      valores: reg.valores ?? {},
      criadoPor: reg.criado_por,
      criadoPorId: reg.criado_por_id,
      criadoEm: reg.criado_em.toISOString(),
      atualizadoEm: reg.atualizado_em.toISOString(),
    },
  };
}

export type ResultadoPermanente = 'ok' | 'nao-encontrado' | 'proibido';

// Apaga de TODOS os bancos: linha na lixeira (Neon) + objetos no R2 (cheia e mini).
export async function apagarLixeiraDefinitivo(
  tx: Tx,
  lixeiraId: string,
  ator: Ator,
): Promise<{ resultado: ResultadoPermanente; keys: string[] }> {
  const itens = await tx<LinhaLixeira[]>`
    select id, conta_id, colecao_id, colecao_nome, registro_id, valores,
           criado_por, criado_por_id, criado_em, atualizado_em,
           apagado_em, apagado_por_id, apagado_por_nome
    from lixeira_registros where id = ${lixeiraId}`;
  const item = itens[0];
  if (item === undefined) return { resultado: 'nao-encontrado', keys: [] };

  // Só dono ou quem jogou na lixeira (ou criador original) pode extinguir.
  const pode =
    ator.papel === 'dono' ||
    item.apagado_por_id === ator.id ||
    item.criado_por_id === ator.id;
  if (!pode) return { resultado: 'proibido', keys: [] };

  const keys = [...new Set(coletarKeysR2DoJson(item.valores ?? {}))];

  await tx`delete from lixeira_registros where id = ${lixeiraId}`;
  await marcarLixoLimpo(tx, keys, 'lixeira-permanente');

  return { resultado: 'ok', keys };
}

// Apaga cheia + mini no R2. Erros individuais não derrubam o resto.
export async function apagarKeysNoR2(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await apagarObjeto(key);
    } catch {
      /* objeto pode já ter sumido */
    }
    try {
      await apagarObjeto(keyMini(key));
    } catch {
      /* idem */
    }
  }
}
