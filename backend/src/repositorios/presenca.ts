import { sql } from '../db/client';

// Presença: quem está online (visto nos últimos minutos) e as entradas (logins)
// recentes para anunciar "Fulano entrou". Escopo por conta (o workspace).

export interface UsuarioOnline {
  id: string;
  nome: string;
}

export interface Entrada {
  id: string;
  usuarioId: string;
  nome: string;
  criadoEm: string;
}

// Marca o usuario como visto agora (heartbeat). Chamado no login e a cada consulta.
export async function marcarVisto(usuarioId: string): Promise<void> {
  await sql`update usuarios set visto_em = now() where id = ${usuarioId}`;
}

// Registra uma entrada (login) e marca presença. Poda entradas com mais de 1 dia.
export async function registrarEntrada(
  usuarioId: string,
  contaId: string,
  nome: string,
): Promise<void> {
  await sql`update usuarios set visto_em = now() where id = ${usuarioId}`;
  await sql`
    insert into entradas (conta_id, usuario_id, nome)
    values (${contaId}, ${usuarioId}, ${nome})`;
  await sql`delete from entradas where criado_em < now() - interval '1 day'`;
}

// Usuários vistos nos últimos `minutos` (default 2), na conta dada.
export async function online(contaId: string, minutos = 2): Promise<UsuarioOnline[]> {
  const linhas = await sql<{ id: string; nome: string }[]>`
    select id, nome from usuarios
    where conta_id = ${contaId}
      and visto_em is not null
      and visto_em > now() - (${minutos} * interval '1 minute')
    order by nome`;
  return linhas.map((l) => ({ id: l.id, nome: l.nome }));
}

// Entradas recentes (para os avisos "entrou"), últimos `minutos` (default 10).
export async function entradasRecentes(contaId: string, minutos = 10): Promise<Entrada[]> {
  const linhas = await sql<
    { id: string; usuario_id: string; nome: string; criado_em: Date }[]
  >`
    select id, usuario_id, nome, criado_em from entradas
    where conta_id = ${contaId}
      and criado_em > now() - (${minutos} * interval '1 minute')
    order by criado_em desc
    limit 30`;
  return linhas.map((l) => ({
    id: l.id,
    usuarioId: l.usuario_id,
    nome: l.nome,
    criadoEm: l.criado_em.toISOString(),
  }));
}
