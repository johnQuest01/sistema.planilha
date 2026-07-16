import { hash, verify } from '@node-rs/argon2';

// Util puro. Não conhece Fastify, banco ou o caminho de convite.
export function gerarHash(senha: string): Promise<string> {
  return hash(senha);
}

export async function conferirSenha(hashArmazenado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha);
  } catch {
    return false;
  }
}
