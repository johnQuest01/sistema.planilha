import type { Tx } from '../db/comConta';
import { config } from '../config';
import { conferirSenha, gerarHash } from './senha';

export const NOME_PLANILHA_PROTEGIDA = 'oficina';

export function emailComAcessoLivre(email: string): boolean {
  return config.planilhaAcessoLivreEmails.includes(email.trim().toLowerCase());
}

export function nomeEhOficina(nome: string): boolean {
  return nome.trim().toLowerCase() === NOME_PLANILHA_PROTEGIDA;
}

export type ResultadoAcesso = 'ok' | 'nao-encontrado' | 'bloqueado';

/** Planilha com senha_hash exige desbloqueio, exceto e-mails da whitelist. */
export async function verificarAcessoColecao(
  tx: Tx,
  colecaoId: string,
  usuario: { id: string; email: string },
): Promise<ResultadoAcesso> {
  const linhas = await tx<{ senha_hash: string | null }[]>`
    select senha_hash from colecoes where id = ${colecaoId}`;
  const col = linhas[0];
  if (col === undefined) return 'nao-encontrado';
  if (col.senha_hash === null) return 'ok';
  if (emailComAcessoLivre(usuario.email)) return 'ok';

  const acessos = await tx<{ ok: number }[]>`
    select 1 as ok from colecao_acessos
    where colecao_id = ${colecaoId} and usuario_id = ${usuario.id}
    limit 1`;
  return acessos.length > 0 ? 'ok' : 'bloqueado';
}

export async function colecaoTemSenha(tx: Tx, colecaoId: string): Promise<boolean | null> {
  const linhas = await tx<{ senha_hash: string | null }[]>`
    select senha_hash from colecoes where id = ${colecaoId}`;
  const col = linhas[0];
  if (col === undefined) return null;
  return col.senha_hash !== null;
}

export async function usuarioJaDesbloqueou(
  tx: Tx,
  colecaoId: string,
  usuarioId: string,
): Promise<boolean> {
  const acessos = await tx<{ ok: number }[]>`
    select 1 as ok from colecao_acessos
    where colecao_id = ${colecaoId} and usuario_id = ${usuarioId}
    limit 1`;
  return acessos.length > 0;
}

export async function desbloquearColecao(
  tx: Tx,
  colecaoId: string,
  usuarioId: string,
  senha: string,
): Promise<'ok' | 'nao-encontrado' | 'senha-errada' | 'sem-senha'> {
  const linhas = await tx<{ senha_hash: string | null }[]>`
    select senha_hash from colecoes where id = ${colecaoId}`;
  const col = linhas[0];
  if (col === undefined) return 'nao-encontrado';
  if (col.senha_hash === null) return 'sem-senha';
  if (!(await conferirSenha(col.senha_hash, senha))) return 'senha-errada';

  await tx`
    insert into colecao_acessos (colecao_id, usuario_id)
    values (${colecaoId}, ${usuarioId})
    on conflict do nothing`;
  return 'ok';
}

/** Só o dono define senha, e só na planilha chamada Oficina. */
export async function definirSenhaOficina(
  tx: Tx,
  colecaoId: string,
  senha: string,
): Promise<'ok' | 'nao-encontrado' | 'nao-oficina'> {
  const linhas = await tx<{ nome: string }[]>`
    select nome from colecoes where id = ${colecaoId}`;
  const col = linhas[0];
  if (col === undefined) return 'nao-encontrado';
  if (!nomeEhOficina(col.nome)) return 'nao-oficina';

  const hashCodigo = await gerarHash(senha);
  await tx`update colecoes set senha_hash = ${hashCodigo}, atualizado_em = now() where id = ${colecaoId}`;
  // Nova senha invalida desbloqueios anteriores (whitelist continua livre).
  await tx`delete from colecao_acessos where colecao_id = ${colecaoId}`;
  return 'ok';
}

export async function limparSenhaSeNaoOficina(tx: Tx, colecaoId: string, nomeNovo: string): Promise<void> {
  if (nomeEhOficina(nomeNovo)) return;
  await tx`update colecoes set senha_hash = null where id = ${colecaoId} and senha_hash is not null`;
  await tx`delete from colecao_acessos where colecao_id = ${colecaoId}`;
}

export async function obterColecaoIdPorCampo(tx: Tx, campoId: string): Promise<string | null> {
  const linhas = await tx<{ colecao_id: string }[]>`
    select colecao_id from campos where id = ${campoId}`;
  return linhas[0]?.colecao_id ?? null;
}
