import type { Tx } from '../db/comConta';
import type { Campo, Colecao, ConfigCampo, TipoCampo } from '../../../shared/tipos';
import {
  emailComAcessoLivre,
  limparSenhaSeNaoOficina,
  usuarioJaDesbloqueou,
} from '../auth/acessoColecao';
import { moverColecaoParaLixeira } from './lixeira';

export interface ColecaoResumo {
  id: string;
  nome: string;
  criadoPor: string | null;
  criadoEm: string;
  atualizadoEm: string;
  protegida: boolean;
  bloqueada: boolean;
}

interface LinhaColecao {
  id: string;
  nome: string;
  criado_por: string | null;
  criado_em: Date;
  atualizado_em: Date;
  senha_hash: string | null;
}

interface LinhaCampo {
  id: string;
  colecao_id: string;
  nome: string;
  tipo: string;
  ordem: number;
  config: ConfigCampo | null;
}

function mapColecao(
  r: LinhaColecao,
  acesso: { email: string; usuarioId: string; jaDesbloqueou: boolean },
): ColecaoResumo {
  const protegida = r.senha_hash !== null;
  const bloqueada =
    protegida && !emailComAcessoLivre(acesso.email) && !acesso.jaDesbloqueou;
  return {
    id: r.id,
    nome: r.nome,
    criadoPor: r.criado_por,
    criadoEm: r.criado_em.toISOString(),
    atualizadoEm: r.atualizado_em.toISOString(),
    protegida,
    bloqueada,
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

export async function criarColecao(
  tx: Tx,
  contaId: string,
  nome: string,
  criadoPor: string,
  acesso: { email: string; usuarioId: string },
): Promise<ColecaoResumo> {
  const linhas = await tx<LinhaColecao[]>`
    insert into colecoes (conta_id, nome, criado_por) values (${contaId}, ${nome}, ${criadoPor})
    returning id, nome, criado_por, criado_em, atualizado_em, senha_hash`;
  const linha = linhas[0];
  if (linha === undefined) throw new Error('insert de coleção não retornou linha');
  return mapColecao(linha, { ...acesso, jaDesbloqueou: false });
}

export async function listarColecoes(
  tx: Tx,
  contaId: string,
  acesso: { email: string; usuarioId: string },
): Promise<ColecaoResumo[]> {
  const linhas = await tx<LinhaColecao[]>`
    select id, nome, criado_por, criado_em, atualizado_em, senha_hash
    from colecoes where conta_id = ${contaId}
    order by criado_em desc`;

  const resultado: ColecaoResumo[] = [];
  for (const linha of linhas) {
    const jaDesbloqueou =
      linha.senha_hash === null
        ? false
        : await usuarioJaDesbloqueou(tx, linha.id, acesso.usuarioId);
    resultado.push(mapColecao(linha, { ...acesso, jaDesbloqueou }));
  }
  return resultado;
}

export async function obterColecao(
  tx: Tx,
  id: string,
  acesso: { email: string; usuarioId: string },
): Promise<Colecao | null> {
  const cols = await tx<
    { id: string; nome: string; criado_por: string | null; senha_hash: string | null }[]
  >`select id, nome, criado_por, senha_hash from colecoes where id = ${id}`;
  const col = cols[0];
  if (col === undefined) return null;

  const protegida = col.senha_hash !== null;
  const jaDesbloqueou =
    protegida ? await usuarioJaDesbloqueou(tx, id, acesso.usuarioId) : false;
  const bloqueada =
    protegida && !emailComAcessoLivre(acesso.email) && !jaDesbloqueou;

  if (bloqueada) {
    return {
      id: col.id,
      nome: col.nome,
      criadoPor: col.criado_por,
      campos: [],
      protegida: true,
      bloqueada: true,
    };
  }

  const campos = await tx<LinhaCampo[]>`
    select id, colecao_id, nome, tipo, ordem, config
    from campos where colecao_id = ${id}
    order by ordem, criado_em`;

  return {
    id: col.id,
    nome: col.nome,
    criadoPor: col.criado_por,
    campos: campos.map(mapCampo),
    protegida,
    bloqueada: false,
  };
}

export async function renomearColecao(
  tx: Tx,
  id: string,
  nome: string,
  acesso: { email: string; usuarioId: string },
): Promise<ColecaoResumo | null> {
  await limparSenhaSeNaoOficina(tx, id, nome);
  const linhas = await tx<LinhaColecao[]>`
    update colecoes set nome = ${nome}, atualizado_em = now()
    where id = ${id}
    returning id, nome, criado_por, criado_em, atualizado_em, senha_hash`;
  const linha = linhas[0];
  if (linha === undefined) return null;
  const jaDesbloqueou =
    linha.senha_hash === null
      ? false
      : await usuarioJaDesbloqueou(tx, id, acesso.usuarioId);
  return mapColecao(linha, { ...acesso, jaDesbloqueou });
}

// Soft-delete: planilha inteira vai para a lixeira (snapshot + fotos no R2).
export type ResultadoApagarColecao = 'ok' | 'nao-encontrado' | 'proibido';

export async function apagarColecao(
  tx: Tx,
  id: string,
  ator: { id: string; nome: string; papel: 'dono' | 'membro' },
): Promise<ResultadoApagarColecao> {
  return moverColecaoParaLixeira(tx, id, ator);
}

// Duplica o FORMATO de uma coleção: mesma configuração de blocos, planilha vazia.
// Copia nome/tipo/ordem/config de cada campo com id NOVO (id compartilhado entre
// coleções corromperia os `valores` de uma ao apagar campo da outra). Não copia
// registros (é o ponto do recurso) nem convites (escopados à coleção de origem).
// Retorna null quando a origem não é do dono (RLS) → 404.
export async function duplicarColecao(
  tx: Tx,
  contaId: string,
  origemId: string,
  criadoPor: string,
  acesso: { email: string; usuarioId: string },
): Promise<Colecao | null> {
  const origem = await obterColecao(tx, origemId, acesso);
  if (origem === null) return null;
  if (origem.bloqueada) return null;

  // Nome automático da cópia: "Corte <data> <hora>" no fuso do Brasil, definido no
  // momento em que a planilha é copiada (data/hora preenchidas automaticamente).
  const dataHora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date())
    .replace(',', '');
  const nomeCopia = `Corte ${dataHora}`;

  const novas = await tx<{ id: string; nome: string; criado_por: string | null }[]>`
    insert into colecoes (conta_id, nome, criado_por)
    values (${contaId}, ${nomeCopia}, ${criadoPor})
    returning id, nome, criado_por`;
  const nova = novas[0];
  if (nova === undefined) throw new Error('insert de coleção duplicada não retornou linha');

  const camposCopiados: Campo[] = [];
  for (const campo of origem.campos) {
    const linhas = await tx<LinhaCampo[]>`
      insert into campos (colecao_id, nome, tipo, ordem, config)
      values (${nova.id}, ${campo.nome}, ${campo.tipo}, ${campo.ordem}, ${tx.json(campo.config)})
      returning id, colecao_id, nome, tipo, ordem, config`;
    const linha = linhas[0];
    if (linha === undefined) throw new Error('insert de campo duplicado não retornou linha');
    camposCopiados.push(mapCampo(linha));
  }

  return {
    id: nova.id,
    nome: nova.nome,
    criadoPor,
    campos: camposCopiados,
    protegida: false,
    bloqueada: false,
  };
}
