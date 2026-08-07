import type { Tx } from '../db/comConta';
import type { Campo, ConfigCampo, Registro, TipoCampo } from '../../../shared/tipos';
import { schemaDeValores, schemaDoCampo } from '../validacao/valores';
import { marcarLixo } from './lixo';
import { moverRegistroParaLixeira } from './lixeira';

interface LinhaRegistro {
  id: string;
  colecao_id: string;
  valores: Record<string, unknown> | null;
  // Corpo próprio do registro (jsonb). null = herda o corpo da coleção.
  campos: Campo[] | null;
  criado_por: string | null;
  criado_por_id: string | null;
  criado_em: Date;
  atualizado_em: Date;
}

// Quem está agindo, para atribuição e permissão.
export interface Ator {
  id: string;
  nome: string;
  papel: 'dono' | 'membro';
}

interface LinhaCampo {
  id: string;
  colecao_id: string;
  nome: string;
  tipo: string;
  ordem: number;
  config: ConfigCampo | null;
}

const LIMITE = 20; // 1ª página leve; "Ver mais" completa
/** Teto só da resposta da busca (independente da lista paginada). */
const LIMITE_BUSCA = 200;

function mapRegistro(r: LinhaRegistro): Registro {
  return {
    id: r.id,
    colecaoId: r.colecao_id,
    valores: r.valores ?? {},
    campos: Array.isArray(r.campos) ? r.campos : null,
    criadoPor: r.criado_por,
    criadoPorId: r.criado_por_id,
    criadoEm: r.criado_em.toISOString(),
    atualizadoEm: r.atualizado_em.toISOString(),
  };
}

function mapCampo(r: LinhaCampo): Campo {
  return {
    id: r.id,
    colecaoId: r.colecao_id,
    nome: r.nome,
    tipo: r.tipo as TipoCampo, // validado pelo CHECK da tabela
    ordem: r.ordem,
    config: r.config ?? {},
  };
}

async function colecaoExiste(tx: Tx, colecaoId: string): Promise<boolean> {
  const linhas = await tx<{ id: string }[]>`select id from colecoes where id = ${colecaoId}`;
  return linhas.length > 0;
}

// Campos da coleção, carregados na MESMA transação em que os valores são validados
// e gravados (ver seção 5): o schema tem que refletir a estrutura vigente.
async function camposDaColecao(tx: Tx, colecaoId: string): Promise<Campo[]> {
  const linhas = await tx<LinhaCampo[]>`
    select id, colecao_id, nome, tipo, ordem, config
    from campos where colecao_id = ${colecaoId}
    order by ordem, criado_em`;
  return linhas.map(mapCampo);
}

async function lerRegistro(tx: Tx, id: string): Promise<LinhaRegistro | null> {
  const linhas = await tx<LinhaRegistro[]>`
    select id, colecao_id, valores, campos, criado_por, criado_por_id, criado_em, atualizado_em
    from registros where id = ${id}`;
  return linhas[0] ?? null;
}

// Corpo VIGENTE do registro: o próprio (se tiver) ou o compartilhado da coleção.
async function camposEfetivos(tx: Tx, linha: LinhaRegistro): Promise<Campo[]> {
  if (Array.isArray(linha.campos) && linha.campos.length > 0) return linha.campos;
  return camposDaColecao(tx, linha.colecao_id);
}

// Keys de imagem de TODOS os blocos (topo imagem + subcampos imagem de seção).
// Usada para detectar fotos que ficaram órfãs ao mudar o corpo/valores.
function todasKeysImagem(campos: Campo[], valores: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const c of campos) {
    if (c.tipo === 'imagem') {
      out.push(...keysDeImagem(valores, c.id));
      continue;
    }
    if (c.tipo !== 'secao') continue;
    const subsImg = (c.config.subcampos ?? []).filter((s) => s.tipo === 'imagem');
    if (subsImg.length === 0) continue;
    const linhas = valores[c.id];
    if (!Array.isArray(linhas)) continue;
    for (const l of linhas) {
      if (typeof l !== 'object' || l === null) continue;
      const obj = l as Record<string, unknown>;
      for (const s of subsImg) {
        const v = obj[s.id];
        if (Array.isArray(v)) for (const k of v) if (typeof k === 'string') out.push(k);
      }
    }
  }
  return out;
}

// Reaproveita os valores antigos sob um corpo NOVO: mantém só o que ainda existe
// e continua válido. Blocos removidos somem; seção perde subcampos removidos;
// valor que não bate mais com o tipo é descartado (sem quebrar o registro).
function podarValores(campos: Campo[], valores: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of campos) {
    let v = valores[c.id];
    if (v === undefined) continue;
    if (c.tipo === 'secao' && Array.isArray(v)) {
      const subIds = new Set((c.config.subcampos ?? []).map((s) => s.id));
      v = v.map((l) => {
        if (typeof l !== 'object' || l === null) return {};
        const o: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(l as Record<string, unknown>)) {
          if (subIds.has(k)) o[k] = val;
        }
        return o;
      });
    }
    const res = schemaDoCampo(c).safeParse(v);
    if (res.success) out[c.id] = res.data as unknown;
  }
  return out;
}

// Só o colecao_id do registro (respeitando RLS). Usado pela rota de upload pra montar
// a key <colecao>/<registro>/<nano>. Null quando não é do dono → 404.
export async function obterColecaoIdDoRegistro(tx: Tx, id: string): Promise<string | null> {
  const linha = await lerRegistro(tx, id);
  return linha?.colecao_id ?? null;
}

// Registro + a estrutura VIGENTE de blocos (própria ou herdada da coleção).
// Usada pelo link público para renderizar um registro isolado. Null → 404.
export async function lerRegistroComCampos(
  tx: Tx,
  id: string,
): Promise<{ registro: Registro; campos: Campo[]; colecaoId: string } | null> {
  const linha = await lerRegistro(tx, id);
  if (linha === null) return null;
  const campos = await camposEfetivos(tx, linha);
  return { registro: mapRegistro(linha), campos, colecaoId: linha.colecao_id };
}

// Keys de imagem guardadas em `valores` para um campo. Robusto a valor ausente/torto.
function keysDeImagem(valores: Record<string, unknown>, campoId: string): string[] {
  const v = valores[campoId];
  if (!Array.isArray(v)) return [];
  return v.filter((k): k is string => typeof k === 'string');
}

// Retorna null quando a coleção não é do dono (RLS não deixou enxergar) → 404.
// Paginação por cursor: `before` é o criado_em do último item da página anterior.
export async function listarRegistros(
  tx: Tx,
  colecaoId: string,
  before: string | undefined,
): Promise<Registro[] | null> {
  // Otimização de latência: o banco costuma ficar longe do servidor, então cada
  // ida custa caro. Consultamos os registros DIRETO; se vier pelo menos 1, a
  // coleção existe e é da conta (a RLS já filtra) — não gastamos a ida extra do
  // `colecaoExiste`. Só quando volta VAZIO precisamos distinguir "coleção
  // inexistente/sem acesso" (→ null/404) de "coleção realmente vazia" (→ []).
  const linhas =
    before === undefined
      ? await tx<LinhaRegistro[]>`
          select id, colecao_id, valores, campos, criado_por, criado_por_id, criado_em, atualizado_em
          from registros where colecao_id = ${colecaoId}
          order by criado_em desc limit ${LIMITE}`
      : await tx<LinhaRegistro[]>`
          select id, colecao_id, valores, campos, criado_por, criado_por_id, criado_em, atualizado_em
          from registros where colecao_id = ${colecaoId} and criado_em < ${before}
          order by criado_em desc limit ${LIMITE}`;

  if (linhas.length > 0) return linhas.map(mapRegistro);
  if (!(await colecaoExiste(tx, colecaoId))) return null;
  return [];
}

// Busca em TODOS os registros da coleção no Neon — não depende do "Ver mais"
// nem do que já foi carregado na lista. Vários termos = AND (ex.: "botão 4647").
export async function buscarRegistros(
  tx: Tx,
  colecaoId: string,
  termo: string,
): Promise<Registro[] | null> {
  if (!(await colecaoExiste(tx, colecaoId))) return null;

  const termos = termo
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (termos.length === 0) return [];

  // Todos os termos no SQL (AND). Antes o 2º+ termo filtrava só os 100 primeiros
  // do 1º termo e podia esconder registros ainda não paginados na lista.
  const condicoes = termos.map(
    (t) =>
      tx`
        position(${t} in lower(valores::text || ' ' || coalesce(criado_por, ''))) > 0
      `,
  );
  const filtroAnd = condicoes.reduce((acc, c) => tx`${acc} and ${c}`);

  const linhas = await tx<LinhaRegistro[]>`
    select id, colecao_id, valores, campos, criado_por, criado_por_id, criado_em, atualizado_em
    from registros
    where colecao_id = ${colecaoId}
      and ${filtroAnd}
    order by criado_em desc
    limit ${LIMITE_BUSCA}`;

  return linhas.map(mapRegistro);
}

export async function criarRegistro(
  tx: Tx,
  colecaoId: string,
  valoresBrutos: Record<string, unknown>,
  ator: Ator,
  // Corpo PRÓPRIO opcional: quando vem (duplicar/novo-a-partir-de outro registro),
  // o novo registro nasce com estrutura independente. Sem ele, herda o da coleção.
  camposProprios?: Campo[],
): Promise<Registro | null> {
  if (!(await colecaoExiste(tx, colecaoId))) return null;

  const usaProprio = camposProprios !== undefined && camposProprios.length > 0;
  const campos = usaProprio ? camposProprios : await camposDaColecao(tx, colecaoId);
  const valores = schemaDeValores(campos).parse(valoresBrutos);
  const corpo = usaProprio ? tx.json(campos as never) : null;

  const linhas = await tx<LinhaRegistro[]>`
    insert into registros (colecao_id, valores, campos, criado_por, criado_por_id)
    values (${colecaoId}, ${tx.json(valores)}, ${corpo}, ${ator.nome}, ${ator.id})
    returning id, colecao_id, valores, campos, criado_por, criado_por_id, criado_em, atualizado_em`;
  const linha = linhas[0];
  if (linha === undefined) throw new Error('insert de registro não retornou linha');
  return mapRegistro(linha);
}

// Substitui o CORPO (blocos) de UM registro, tornando-o independente da coleção.
// Poda os valores para o novo corpo (mantém o que ainda existe/casa) e envia as
// fotos que ficaram órfãs para o lixo do R2. Não toca em nenhum outro registro.
export async function editarCorpoRegistro(
  tx: Tx,
  id: string,
  novosCampos: Campo[],
): Promise<Registro | null> {
  const atual = await lerRegistro(tx, id);
  if (atual === null) return null;

  const camposAntes = await camposEfetivos(tx, atual);
  const valoresAntes = atual.valores ?? {};
  const valoresDepois = podarValores(novosCampos, valoresAntes);

  // Fotos que existiam e não sobraram no novo corpo/valores viram órfãs no R2.
  const antes = new Set(todasKeysImagem(camposAntes, valoresAntes));
  const depois = new Set(todasKeysImagem(novosCampos, valoresDepois));
  const removidas = [...antes].filter((k) => !depois.has(k));

  const linhas = await tx<LinhaRegistro[]>`
    update registros
    set campos = ${tx.json(novosCampos as never)},
        valores = ${tx.json(valoresDepois as never)},
        atualizado_em = now()
    where id = ${id}
    returning id, colecao_id, valores, campos, criado_por, criado_por_id, criado_em, atualizado_em`;
  const linha = linhas[0];
  if (linha === undefined) return null;

  await marcarLixo(tx, removidas, 'corpo-registro-alterado');
  return mapRegistro(linha);
}

// PATCH é MERGE (`valores || $novo`), não replace: preencher um campo não apaga os
// outros (ver seção 5). Retorna null quando o registro não é do dono → 404.
export async function editarRegistro(
  tx: Tx,
  id: string,
  patchBrutos: Record<string, unknown>,
): Promise<Registro | null> {
  const atual = await lerRegistro(tx, id);
  if (atual === null) return null;

  // Valida contra o corpo VIGENTE do registro (próprio, se houver; senão o da coleção).
  const campos = await camposEfetivos(tx, atual);
  const patch = schemaDeValores(campos).parse(patchBrutos);
  const antes = atual.valores ?? {};

  // Toda key de imagem que o patch tira do array vira órfã no R2 (ver 6.4). Grava-se
  // a intenção em lixo_r2 na MESMA transação; a limpeza do bucket é o limpar-r2.
  const removidas: string[] = [];
  for (const c of campos) {
    if (c.tipo !== 'imagem' || !(c.id in patchBrutos)) continue;
    const novas = keysDeImagem(patchBrutos, c.id);
    for (const k of keysDeImagem(antes, c.id)) {
      if (!novas.includes(k)) removidas.push(k);
    }
  }

  const linhas = await tx<LinhaRegistro[]>`
    update registros set valores = valores || ${tx.json(patch)}, atualizado_em = now()
    where id = ${id}
    returning id, colecao_id, valores, campos, criado_por, criado_por_id, criado_em, atualizado_em`;
  const linha = linhas[0];
  if (linha === undefined) return null;

  await marcarLixo(tx, removidas, 'patch-removeu-foto');
  return mapRegistro(linha);
}

// Soft-delete: vai pra lixeira (snapshot + fotos preservadas no R2).
// Apagar definitivo (Neon + R2) é na rota da lixeira.
export type ResultadoApagar = 'ok' | 'nao-encontrado' | 'proibido';

export async function apagarRegistro(tx: Tx, id: string, ator: Ator): Promise<ResultadoApagar> {
  return moverRegistroParaLixeira(tx, id, ator);
}
