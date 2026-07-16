import type { Tx } from '../db/comConta';
import type { Campo, ConfigCampo, TipoCampo } from '../../../shared/tipos';
import { ErroHttp } from '../erros';
import { marcarLixo } from './lixo';

interface LinhaCampo {
  id: string;
  colecao_id: string;
  nome: string;
  tipo: string;
  ordem: number;
  config: ConfigCampo | null;
}

const GAP = 100; // ordem em passos de 100; reordenar troca só os afetados (seção 4)

function mapCampo(r: LinhaCampo): Campo {
  return {
    id: r.id,
    colecaoId: r.colecao_id,
    nome: r.nome,
    tipo: r.tipo as TipoCampo,
    ordem: r.ordem,
    config: r.config ?? {},
  };
}

async function colecaoExiste(tx: Tx, colecaoId: string): Promise<boolean> {
  const linhas = await tx<{ id: string }[]>`select id from colecoes where id = ${colecaoId}`;
  return linhas.length > 0;
}

async function lerCampo(tx: Tx, id: string): Promise<LinhaCampo | null> {
  const linhas = await tx<LinhaCampo[]>`
    select id, colecao_id, nome, tipo, ordem, config from campos where id = ${id}`;
  return linhas[0] ?? null;
}

export interface DadosCampo {
  nome: string;
  tipo: TipoCampo;
  config: ConfigCampo;
}

// Retorna null quando a coleção não é do dono (RLS não deixou enxergar) → 404.
export async function criarCampo(
  tx: Tx,
  colecaoId: string,
  dados: DadosCampo,
): Promise<Campo | null> {
  if (!(await colecaoExiste(tx, colecaoId))) return null;

  const maxs = await tx<{ maxo: number }[]>`
    select coalesce(max(ordem), ${-GAP}) as maxo from campos where colecao_id = ${colecaoId}`;
  const proximaOrdem = (maxs[0]?.maxo ?? -GAP) + GAP;

  const linhas = await tx<LinhaCampo[]>`
    insert into campos (colecao_id, nome, tipo, ordem, config)
    values (${colecaoId}, ${dados.nome}, ${dados.tipo}, ${proximaOrdem}, ${tx.json(dados.config)})
    returning id, colecao_id, nome, tipo, ordem, config`;
  const linha = linhas[0];
  if (linha === undefined) throw new Error('insert de campo não retornou linha');
  return mapCampo(linha);
}

export interface PatchCampo {
  nome?: string;
  tipo?: TipoCampo;
  config?: ConfigCampo;
}

export async function editarCampo(tx: Tx, id: string, patch: PatchCampo): Promise<Campo | null> {
  const atual = await lerCampo(tx, id);
  if (atual === null) return null;

  const nome = patch.nome ?? atual.nome;
  const tipo = patch.tipo ?? (atual.tipo as TipoCampo);
  const config = patch.config ?? atual.config ?? {};

  // Trocar o tipo de um bloco que já tem dados corromperia os `valores` gravados
  // (ver 2.5.6): o valor antigo continuaria lá com a forma do tipo velho. Renomear
  // é livre; trocar tipo com registros é 409. Apagar o bloco (limpa os valores) e
  // recriar é o caminho consciente.
  if (tipo !== atual.tipo) {
    const cont = await tx<{ n: number }[]>`
      select count(*)::int as n from registros where colecao_id = ${atual.colecao_id}`;
    if ((cont[0]?.n ?? 0) > 0) {
      throw new ErroHttp(409, 'não dá pra trocar o tipo de um bloco que já tem dados preenchidos');
    }
  }

  // Invariante depende do estado final (tipo + config mesclados), por isso a
  // checagem mora aqui e não no Zod.
  if (tipo === 'selecao' && (config.opcoes === undefined || config.opcoes.length === 0)) {
    throw new ErroHttp(400, 'seleção exige ao menos uma opção');
  }

  // Espelho do superRefine da entrada: maxFotos só faz sentido em `imagem`
  // (ver seção 4.2). Vale também no estado final de um PATCH.
  if (tipo !== 'imagem' && config.maxFotos !== undefined) {
    throw new ErroHttp(400, 'maxFotos só se aplica a bloco de imagem');
  }

  // Reduzir maxFotos abaixo do que já existe apagaria fotos silenciosamente na
  // próxima gravação. Se algum registro já tem mais fotos que o novo teto, 409.
  if (tipo === 'imagem' && config.maxFotos !== undefined) {
    const maxExistente = await tx<{ maxo: number }[]>`
      select coalesce(max(jsonb_array_length(valores -> ${id})), 0) as maxo
      from registros
      where colecao_id = ${atual.colecao_id}
        and jsonb_typeof(valores -> ${id}) = 'array'`;
    const jaTem = maxExistente[0]?.maxo ?? 0;
    if (config.maxFotos < jaTem) {
      throw new ErroHttp(
        409,
        `há registro com ${jaTem} fotos neste bloco; não dá pra reduzir o máximo para ${config.maxFotos}`,
      );
    }
  }

  const linhas = await tx<LinhaCampo[]>`
    update campos set nome = ${nome}, tipo = ${tipo}, config = ${tx.json(config)}
    where id = ${id}
    returning id, colecao_id, nome, tipo, ordem, config`;
  const linha = linhas[0];
  return linha === undefined ? null : mapCampo(linha);
}

// Apaga o campo E remove a chave dos `valores` de todos os registros da coleção
// (critério de aceite). Tudo na mesma transação.
export async function apagarCampo(tx: Tx, id: string): Promise<boolean> {
  const atual = await lerCampo(tx, id);
  if (atual === null) return false;

  // Se for bloco de imagem, as fotos de todos os registros viram órfãs no R2 quando a
  // chave sai do jsonb (ver 6.4). Coleta as keys antes de removê-las.
  if (atual.tipo === 'imagem') {
    const linhas = await tx<{ vals: unknown }[]>`
      select valores -> ${id} as vals from registros
      where colecao_id = ${atual.colecao_id} and valores ? ${id}`;
    const orfas: string[] = [];
    for (const l of linhas) {
      if (Array.isArray(l.vals)) {
        for (const k of l.vals) if (typeof k === 'string') orfas.push(k);
      }
    }
    await marcarLixo(tx, orfas, 'campo-imagem-apagado');
  }

  await tx`delete from campos where id = ${id}`;
  await tx`
    update registros
    set valores = valores - ${id}, atualizado_em = now()
    where colecao_id = ${atual.colecao_id} and valores ? ${id}`;
  return true;
}

// Reordena a coleção INTEIRA a partir da ordem final recebida. Recebe a lista
// completa de ids (não um delta): resposta fora de ordem deixa de importar, pois
// cada requisição carrega a verdade inteira. Reescreve `ordem` com GAP=100.
// Retorna null quando a coleção não é do dono (RLS) → 404; lança 400 quando os ids
// divergem dos da coleção (faltando, sobrando ou repetido).
export async function reordenarCampos(
  tx: Tx,
  colecaoId: string,
  ids: string[],
): Promise<Campo[] | null> {
  if (!(await colecaoExiste(tx, colecaoId))) return null;

  const atuais = await tx<{ id: string }[]>`
    select id from campos where colecao_id = ${colecaoId}`;
  const idsBanco = new Set(atuais.map((r) => r.id));
  const idsPedido = new Set(ids);

  const semRepetidos = idsPedido.size === ids.length;
  const mesmaQtd = idsBanco.size === idsPedido.size;
  const todosPertencem = ids.every((id) => idsBanco.has(id));
  if (!semRepetidos || !mesmaQtd || !todosPertencem) {
    throw new ErroHttp(400, 'a ordem precisa conter exatamente os blocos desta coleção');
  }

  // Reescreve a ordem com GAP=100 (0, 100, 200…). São poucos blocos; cada update é
  // uma linha, tudo dentro da mesma transação — atômico.
  for (const [i, id] of ids.entries()) {
    await tx`update campos set ordem = ${i * GAP} where id = ${id} and colecao_id = ${colecaoId}`;
  }

  const linhas = await tx<LinhaCampo[]>`
    select id, colecao_id, nome, tipo, ordem, config
    from campos where colecao_id = ${colecaoId}
    order by ordem, criado_em`;
  return linhas.map(mapCampo);
}
