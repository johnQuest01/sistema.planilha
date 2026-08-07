import type { Tx } from '../db/comConta';
import { config } from '../config';
import { conferirSenha, gerarHash } from './senha';

export type UsuarioAcesso = { id: string; email: string; papel?: 'dono' | 'membro' };

export function emailComAcessoLivre(email: string): boolean {
  return config.planilhaAcessoLivreEmails.includes(email.trim().toLowerCase());
}

/** Whitelist de e-mails ou papel dono: entram em planilha protegida sem digitar a senha. */
export function usuarioComAcessoLivre(usuario: { email: string; papel?: 'dono' | 'membro' }): boolean {
  if (usuario.papel === 'dono') return true;
  return emailComAcessoLivre(usuario.email);
}

/**
 * Dono DO WORKSPACE (só o Bruno, config.workspaceOwnerEmail). É o único que
 * arquiva/desarquiva e o único que enxerga planilhas arquivadas. Diferente de
 * `usuarioComAcessoLivre` (que inclui whitelist e papel 'dono' de qualquer conta).
 */
export function ehDonoWorkspace(email: string): boolean {
  return email.trim().toLowerCase() === config.workspaceOwnerEmail;
}

export type ResultadoAcesso = 'ok' | 'nao-encontrado' | 'bloqueado';

/** Planilha com senha_hash exige desbloqueio, exceto whitelist/dono. */
export async function verificarAcessoColecao(
  tx: Tx,
  colecaoId: string,
  usuario: UsuarioAcesso,
): Promise<ResultadoAcesso> {
  const linhas = await tx<{ senha_hash: string | null; arquivada: boolean }[]>`
    select senha_hash, arquivada from colecoes where id = ${colecaoId}`;
  const col = linhas[0];
  if (col === undefined) return 'nao-encontrado';
  // Arquivada é invisível para todos, menos o dono do workspace: some como se não
  // existisse (404), bloqueando registros/edição/busca por qualquer outro usuário.
  if (col.arquivada && !ehDonoWorkspace(usuario.email)) return 'nao-encontrado';
  if (col.senha_hash === null) return 'ok';
  if (usuarioComAcessoLivre(usuario)) return 'ok';

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

/**
 * Lê o hash fora do caminho crítico: o Argon2 verify NÃO pode rodar com a
 * transação aberta (segura conexão do pool e trava o resto do app).
 */
export async function lerHashSenhaColecao(
  tx: Tx,
  colecaoId: string,
): Promise<'nao-encontrado' | 'sem-senha' | { hash: string }> {
  const linhas = await tx<{ senha_hash: string | null }[]>`
    select senha_hash from colecoes where id = ${colecaoId}`;
  const col = linhas[0];
  if (col === undefined) return 'nao-encontrado';
  if (col.senha_hash === null) return 'sem-senha';
  return { hash: col.senha_hash };
}

export async function registrarDesbloqueio(
  tx: Tx,
  colecaoId: string,
  usuarioId: string,
): Promise<void> {
  await tx`
    insert into colecao_acessos (colecao_id, usuario_id)
    values (${colecaoId}, ${usuarioId})
    on conflict do nothing`;
}

/** Confere a senha (Argon2) fora de qualquer transação. */
export async function senhaColecaoConfere(hash: string, senha: string): Promise<boolean> {
  return conferirSenha(hash, senha);
}

/**
 * Confirma que a coleção existe (transação curta). O hash Argon2 é gerado
 * FORA de comConta — ver rota PATCH /senha.
 */
export async function colecaoExiste(
  tx: Tx,
  colecaoId: string,
): Promise<boolean> {
  const linhas = await tx<{ ok: number }[]>`
    select 1 as ok from colecoes where id = ${colecaoId} limit 1`;
  return linhas.length > 0;
}

/** Aplica hash já calculado e invalida desbloqueios anteriores. */
export async function aplicarSenhaColecao(
  tx: Tx,
  colecaoId: string,
  senhaHash: string,
): Promise<void> {
  await tx`update colecoes set senha_hash = ${senhaHash}, atualizado_em = now() where id = ${colecaoId}`;
  await tx`delete from colecao_acessos where colecao_id = ${colecaoId}`;
}

/** Hash Argon2 fora do banco — usar antes de aplicarSenhaColecao. */
export function gerarHashSenhaPlanilha(senha: string): Promise<string> {
  return gerarHash(senha);
}

/** Remove a senha da planilha e limpa desbloqueios. */
export async function removerSenhaColecao(tx: Tx, colecaoId: string): Promise<'ok' | 'nao-encontrado'> {
  const linhas = await tx<{ id: string }[]>`
    update colecoes set senha_hash = null, atualizado_em = now()
    where id = ${colecaoId}
    returning id`;
  if (linhas[0] === undefined) return 'nao-encontrado';
  await tx`delete from colecao_acessos where colecao_id = ${colecaoId}`;
  return 'ok';
}

export async function obterColecaoIdPorCampo(tx: Tx, campoId: string): Promise<string | null> {
  const linhas = await tx<{ colecao_id: string }[]>`
    select colecao_id from campos where id = ${campoId}`;
  return linhas[0]?.colecao_id ?? null;
}
