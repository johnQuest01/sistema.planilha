import type { Tx } from '../db/comConta';
import type { ConfigCampo, Registro, TipoCampo } from '../../../shared/tipos';
import { apagarObjeto, keyMini } from '../r2/r2';
import type { Ator } from './registros';
import { marcarLixoLimpo } from './lixo';

// Forma que o servidor gera (seção 7.2) — só keys reais entram na limpeza do R2.
const R2_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-]{21}\.(jpe?g|png|webp)$/;

export interface ItemLixeira {
  id: string;
  tipo: 'registro' | 'colecao';
  colecaoId: string;
  colecaoNome: string;
  registroId: string | null;
  valores: Record<string, unknown>;
  fotosReferencia: string[];
  qtdRegistros: number;
  criadoPor: string | null;
  criadoPorId: string | null;
  criadoEm: string;
  atualizadoEm: string;
  apagadoEm: string;
  apagadoPorNome: string | null;
}

interface LinhaLixeiraReg {
  id: string;
  conta_id: string;
  colecao_id: string;
  colecao_nome: string;
  registro_id: string;
  valores: Record<string, unknown> | null;
  fotos_referencia: unknown;
  criado_por: string | null;
  criado_por_id: string | null;
  criado_em: Date;
  atualizado_em: Date;
  apagado_em: Date;
  apagado_por_id: string | null;
  apagado_por_nome: string | null;
}

interface LinhaLixeiraCol {
  id: string;
  conta_id: string;
  colecao_id: string;
  colecao_nome: string;
  snapshot: unknown;
  fotos_referencia: unknown;
  qtd_registros: number;
  criado_por: string | null;
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

interface LinhaCampo {
  id: string;
  nome: string;
  tipo: string;
  ordem?: number;
  config: ConfigCampo | null;
}

interface SnapshotCampo {
  id: string;
  nome: string;
  tipo: string;
  ordem: number;
  config: ConfigCampo;
}

interface SnapshotRegistro {
  id: string;
  valores: Record<string, unknown>;
  criado_por: string | null;
  criado_por_id: string | null;
  criado_em: string;
  atualizado_em: string;
}

interface SnapshotColecao {
  nome: string;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
  campos: SnapshotCampo[];
  registros: SnapshotRegistro[];
}

function nomeEhReferencia(nome: string): boolean {
  const n = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return n.includes('referencia');
}

function keysDeArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string' && R2_KEY.test(k)) : [];
}

// Só fotos do bloco cujo nome contém "referência" (imagem no topo ou subcampo imagem).
function fotosDoBlocoReferencia(
  campos: LinhaCampo[],
  valores: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  for (const c of campos) {
    if (!nomeEhReferencia(c.nome)) continue;
    if (c.tipo === 'imagem') {
      out.push(...keysDeArray(valores[c.id]));
      continue;
    }
    if (c.tipo !== 'secao') continue;
    const subs = (c.config?.subcampos ?? []).filter((s) => s.tipo === 'imagem');
    const linhas = Array.isArray(valores[c.id]) ? (valores[c.id] as unknown[]) : [];
    for (const linha of linhas) {
      if (typeof linha !== 'object' || linha === null) continue;
      const obj = linha as Record<string, unknown>;
      for (const s of subs) out.push(...keysDeArray(obj[s.id]));
    }
  }
  // Fallback: se nenhum bloco se chama referência, usa o 1º campo imagem.
  if (out.length === 0) {
    const img = campos.find((c) => c.tipo === 'imagem');
    if (img !== undefined) out.push(...keysDeArray(valores[img.id]));
  }
  return [...new Set(out)];
}

function mapFotos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
}

function mapItemReg(r: LinhaLixeiraReg): ItemLixeira {
  return {
    id: r.id,
    tipo: 'registro',
    colecaoId: r.colecao_id,
    colecaoNome: r.colecao_nome,
    registroId: r.registro_id,
    valores: r.valores ?? {},
    fotosReferencia: mapFotos(r.fotos_referencia),
    qtdRegistros: 1,
    criadoPor: r.criado_por,
    criadoPorId: r.criado_por_id,
    criadoEm: r.criado_em.toISOString(),
    atualizadoEm: r.atualizado_em.toISOString(),
    apagadoEm: r.apagado_em.toISOString(),
    apagadoPorNome: r.apagado_por_nome,
  };
}

function mapItemCol(r: LinhaLixeiraCol): ItemLixeira {
  return {
    id: r.id,
    tipo: 'colecao',
    colecaoId: r.colecao_id,
    colecaoNome: r.colecao_nome,
    registroId: null,
    valores: { nome: r.colecao_nome },
    fotosReferencia: mapFotos(r.fotos_referencia),
    qtdRegistros: r.qtd_registros,
    criadoPor: null,
    criadoPorId: r.criado_por,
    criadoEm: r.criado_em.toISOString(),
    atualizadoEm: r.atualizado_em.toISOString(),
    apagadoEm: r.apagado_em.toISOString(),
    apagadoPorNome: r.apagado_por_nome,
  };
}

function parseSnapshot(raw: unknown): SnapshotColecao | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.nome !== 'string') return null;
  if (!Array.isArray(o.campos) || !Array.isArray(o.registros)) return null;
  return {
    nome: o.nome,
    criado_por: typeof o.criado_por === 'string' ? o.criado_por : null,
    criado_em: typeof o.criado_em === 'string' ? o.criado_em : new Date().toISOString(),
    atualizado_em:
      typeof o.atualizado_em === 'string' ? o.atualizado_em : new Date().toISOString(),
    campos: o.campos as SnapshotCampo[],
    registros: o.registros as SnapshotRegistro[],
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

  const campos = await tx<LinhaCampo[]>`
    select id, nome, tipo, config from campos
    where colecao_id = ${atual.colecao_id}
    order by ordem asc`;
  const valores = atual.valores ?? {};
  const fotosReferencia = fotosDoBlocoReferencia(campos, valores);

  await tx`
    insert into lixeira_registros (
      conta_id, colecao_id, colecao_nome, registro_id, valores, fotos_referencia,
      criado_por, criado_por_id, criado_em, atualizado_em,
      apagado_por_id, apagado_por_nome
    ) values (
      ${contaId}::uuid, ${atual.colecao_id}, ${colecaoNome}, ${atual.id},
      ${tx.json(valores as never)}, ${tx.json(fotosReferencia as never)},
      ${atual.criado_por}, ${atual.criado_por_id}, ${atual.criado_em}, ${atual.atualizado_em},
      ${ator.id}::uuid, ${ator.nome}
    )`;

  await tx`delete from registros where id = ${registroId}`;
  return 'ok';
}

// Soft-delete de planilha inteira: snapshot (campos + registros) → lixeira_colecoes.
export async function moverColecaoParaLixeira(
  tx: Tx,
  colecaoId: string,
  ator: Ator,
): Promise<ResultadoMover> {
  const cols = await tx<
    {
      id: string;
      conta_id: string;
      nome: string;
      criado_por: string | null;
      criado_em: Date;
      atualizado_em: Date;
    }[]
  >`
    select id, conta_id::text as conta_id, nome, criado_por::text as criado_por,
           criado_em, atualizado_em
    from colecoes where id = ${colecaoId}`;
  const col = cols[0];
  if (col === undefined) return 'nao-encontrado';

  const ehDono = ator.papel === 'dono';
  const ehCriador = col.criado_por === ator.id;
  if (!ehDono && !ehCriador) return 'proibido';

  const campos = await tx<(LinhaCampo & { ordem: number })[]>`
    select id, nome, tipo, ordem, config from campos
    where colecao_id = ${colecaoId}
    order by ordem asc, criado_em asc`;

  const regs = await tx<LinhaRegistro[]>`
    select id, colecao_id, valores, criado_por, criado_por_id, criado_em, atualizado_em
    from registros where colecao_id = ${colecaoId}
    order by criado_em asc`;

  const snapshot: SnapshotColecao = {
    nome: col.nome,
    criado_por: col.criado_por,
    criado_em: col.criado_em.toISOString(),
    atualizado_em: col.atualizado_em.toISOString(),
    campos: campos.map((c) => ({
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      ordem: c.ordem,
      config: c.config ?? {},
    })),
    registros: regs.map((r) => ({
      id: r.id,
      valores: r.valores ?? {},
      criado_por: r.criado_por,
      criado_por_id: r.criado_por_id,
      criado_em: r.criado_em.toISOString(),
      atualizado_em: r.atualizado_em.toISOString(),
    })),
  };

  const fotos: string[] = [];
  for (const r of regs) {
    fotos.push(...fotosDoBlocoReferencia(campos, r.valores ?? {}));
    if (fotos.length >= 8) break;
  }
  const fotosReferencia = [...new Set(fotos)].slice(0, 4);

  await tx`
    insert into lixeira_colecoes (
      conta_id, colecao_id, colecao_nome, snapshot, fotos_referencia, qtd_registros,
      criado_por, criado_em, atualizado_em, apagado_por_id, apagado_por_nome
    ) values (
      ${col.conta_id}::uuid, ${col.id}, ${col.nome},
      ${tx.json(snapshot as never)}, ${tx.json(fotosReferencia as never)}, ${regs.length},
      ${col.criado_por}, ${col.criado_em}, ${col.atualizado_em},
      ${ator.id}::uuid, ${ator.nome}
    )`;

  // Cascade apaga campos, registros e convites — snapshot já está na lixeira.
  await tx`delete from colecoes where id = ${colecaoId}`;
  return 'ok';
}

export async function listarLixeira(tx: Tx): Promise<ItemLixeira[]> {
  const regs = await tx<LinhaLixeiraReg[]>`
    select id, conta_id, colecao_id, colecao_nome, registro_id, valores, fotos_referencia,
           criado_por, criado_por_id, criado_em, atualizado_em,
           apagado_em, apagado_por_id, apagado_por_nome
    from lixeira_registros
    order by apagado_em desc
    limit 200`;

  const cols = await tx<LinhaLixeiraCol[]>`
    select id, conta_id, colecao_id, colecao_nome, snapshot, fotos_referencia, qtd_registros,
           criado_por::text as criado_por, criado_em, atualizado_em,
           apagado_em, apagado_por_id, apagado_por_nome
    from lixeira_colecoes
    order by apagado_em desc
    limit 200`;

  const itens = [...regs.map(mapItemReg), ...cols.map(mapItemCol)];
  itens.sort((a, b) => (a.apagadoEm < b.apagadoEm ? 1 : a.apagadoEm > b.apagadoEm ? -1 : 0));
  return itens.slice(0, 200);
}

export type ResultadoRestaurar =
  | 'ok'
  | 'nao-encontrado'
  | 'colecao-sumiu'
  | 'id-ocupado'
  | 'colecao-ocupada';

export async function restaurarDaLixeira(
  tx: Tx,
  lixeiraId: string,
): Promise<{ resultado: ResultadoRestaurar; registro?: Registro }> {
  const regs = await tx<LinhaLixeiraReg[]>`
    select id, conta_id, colecao_id, colecao_nome, registro_id, valores, fotos_referencia,
           criado_por, criado_por_id, criado_em, atualizado_em,
           apagado_em, apagado_por_id, apagado_por_nome
    from lixeira_registros where id = ${lixeiraId}`;
  const item = regs[0];
  if (item !== undefined) {
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

  return restaurarColecaoDaLixeira(tx, lixeiraId);
}

async function restaurarColecaoDaLixeira(
  tx: Tx,
  lixeiraId: string,
): Promise<{ resultado: ResultadoRestaurar }> {
  const cols = await tx<LinhaLixeiraCol[]>`
    select id, conta_id, colecao_id, colecao_nome, snapshot, fotos_referencia, qtd_registros,
           criado_por::text as criado_por, criado_em, atualizado_em,
           apagado_em, apagado_por_id, apagado_por_nome
    from lixeira_colecoes where id = ${lixeiraId}`;
  const item = cols[0];
  if (item === undefined) return { resultado: 'nao-encontrado' };

  const snap = parseSnapshot(item.snapshot);
  if (snap === null) return { resultado: 'nao-encontrado' };

  const existe = await tx<{ id: string }[]>`
    select id from colecoes where id = ${item.colecao_id}`;
  if (existe[0] !== undefined) return { resultado: 'colecao-ocupada' };

  await tx`
    insert into colecoes (id, conta_id, nome, criado_por, criado_em, atualizado_em)
    values (
      ${item.colecao_id}, ${item.conta_id}::uuid, ${snap.nome},
      ${snap.criado_por}, ${snap.criado_em}::timestamptz, now()
    )`;

  for (const c of snap.campos) {
    await tx`
      insert into campos (id, colecao_id, nome, tipo, ordem, config)
      values (
        ${c.id}, ${item.colecao_id}, ${c.nome}, ${c.tipo as TipoCampo},
        ${c.ordem}, ${tx.json((c.config ?? {}) as never)}
      )`;
  }

  for (const r of snap.registros) {
    await tx`
      insert into registros (
        id, colecao_id, valores, criado_por, criado_por_id, criado_em, atualizado_em
      ) values (
        ${r.id}, ${item.colecao_id}, ${tx.json((r.valores ?? {}) as never)},
        ${r.criado_por}, ${r.criado_por_id},
        ${r.criado_em}::timestamptz, ${r.atualizado_em}::timestamptz
      )`;
  }

  await tx`delete from lixeira_colecoes where id = ${lixeiraId}`;
  return { resultado: 'ok' };
}

export type ResultadoPermanente = 'ok' | 'nao-encontrado';

// Qualquer usuário da conta (RLS) pode apagar definitivo / restaurar.
export async function apagarLixeiraDefinitivo(
  tx: Tx,
  lixeiraId: string,
  _ator: Ator,
): Promise<{ resultado: ResultadoPermanente; keys: string[] }> {
  const regs = await tx<LinhaLixeiraReg[]>`
    select id, conta_id, colecao_id, colecao_nome, registro_id, valores, fotos_referencia,
           criado_por, criado_por_id, criado_em, atualizado_em,
           apagado_em, apagado_por_id, apagado_por_nome
    from lixeira_registros where id = ${lixeiraId}`;
  const reg = regs[0];
  if (reg !== undefined) {
    const keys = [...new Set(coletarKeysR2DoJson(reg.valores ?? {}))];
    await tx`delete from lixeira_registros where id = ${lixeiraId}`;
    await marcarLixoLimpo(tx, keys, 'lixeira-permanente');
    return { resultado: 'ok', keys };
  }

  const cols = await tx<LinhaLixeiraCol[]>`
    select id, conta_id, colecao_id, colecao_nome, snapshot, fotos_referencia, qtd_registros,
           criado_por::text as criado_por, criado_em, atualizado_em,
           apagado_em, apagado_por_id, apagado_por_nome
    from lixeira_colecoes where id = ${lixeiraId}`;
  const col = cols[0];
  if (col === undefined) return { resultado: 'nao-encontrado', keys: [] };

  const snap = parseSnapshot(col.snapshot);
  const keys = [...new Set(coletarKeysR2DoJson(snap?.registros ?? []))];
  await tx`delete from lixeira_colecoes where id = ${lixeiraId}`;
  await marcarLixoLimpo(tx, keys, 'lixeira-permanente');
  return { resultado: 'ok', keys };
}

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
