import type { FastifyInstance } from 'fastify';
import { sql } from '../db/client';
import { gerarHash, conferirSenha } from '../auth/senha';
import { NOME_COOKIE_SESSAO, opcoesLimpar, opcoesSessao } from '../auth/cookies';
import { exigeDono, usuarioObrigatorio, contaObrigatoria } from '../auth/exigeDono';
import { criarSessao, revogarSessao, revogarSessoesDoUsuario } from '../auth/sessoes';
import { registrarEntrada } from '../repositorios/presenca';
import { anunciarEntradaWs } from '../ws/presencaHub';
import { workspaceContaId, workspaceCodigoHash } from '../auth/workspace';
import {
  criarConviteConta,
  consumirConviteConta,
  listarConvitesConta,
  revogarConviteConta,
} from '../repositorios/convitesConta';
import {
  credenciaisSchema,
  registrarSchema,
  codigoConviteSchema,
  senhaUsuarioSchema,
  criarTokenConviteSchema,
} from '../validacao/credenciais';
import { paramsIdSchema } from '../validacao/params';

// `contas`/`usuarios`/`sessoes`/`convites_conta` não têm RLS de conta: a auth
// media o acesso aqui, então falamos direto com `sql`, fora do `comConta`.
const limiteAuth = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

/** Admin da conta = papel `dono` (cada workspace tem o seu). */
function ehAdminConta(papel: string): boolean {
  return papel === 'dono';
}

function corpoUsuario(u: {
  id: string;
  nome: string;
  email: string;
  papel: string;
}): { id: string; nome: string; email: string; papel: string; podeGerirSenhas: boolean } {
  const admin = ehAdminConta(u.papel);
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    // Antes era só o e-mail Bruno; agora todo dono da própria conta gerencia.
    podeGerirSenhas: admin,
  };
}

export async function rotasAuth(app: FastifyInstance): Promise<void> {
  // Cadastro dual:
  // - COM token/código → membro da conta do admin (ou código legado Bruno);
  // - SEM token → cria workspace novo e vira dono.
  app.post('/api/auth/registrar', limiteAuth, async (req, reply) => {
    const { nome, email, senha, token, nomeConta } = registrarSchema.parse(req.body);

    const existentes = await sql<{ id: string }[]>`select id from usuarios where email = ${email}`;
    if (existentes.length > 0) {
      return reply.code(409).send({ erro: 'e-mail já cadastrado' });
    }

    const senhaHash = await gerarHash(senha);
    let contaId: string;
    let papel: 'dono' | 'membro';

    if (token !== '') {
      // 1) Token novo (convites_conta).
      const viaToken = await consumirConviteConta(token);
      if (viaToken !== null) {
        contaId = viaToken;
        papel = 'membro';
      } else {
        // 2) Código legado da conta Bruno (codigo_convite_hash).
        const codigoHash = await workspaceCodigoHash();
        if (codigoHash === null || !(await conferirSenha(codigoHash, token))) {
          return reply.code(403).send({ erro: 'token ou código de convite inválido' });
        }
        contaId = await workspaceContaId();
        papel = 'membro';
      }

      const linhas = await sql<{ id: string }[]>`
        insert into usuarios (conta_id, nome, email, senha_hash, papel)
        values (${contaId}, ${nome}, ${email}, ${senhaHash}, ${papel})
        returning id`;
      const usuario = linhas[0];
      if (usuario === undefined) throw new Error('insert de usuario não retornou linha');

      const sessaoId = await criarSessao(usuario.id, contaId);
      reply.setCookie(NOME_COOKIE_SESSAO, sessaoId, opcoesSessao());
      const entrada = await registrarEntrada(usuario.id, contaId, nome);
      void anunciarEntradaWs(contaId, entrada);
      return reply.code(201).send(corpoUsuario({ id: usuario.id, nome, email, papel }));
    }

    // Sem token: cria CONTA NOVA (workspace isolado) + usuário dono.
    const nomeWs = (nomeConta ?? nome).slice(0, 80);
    // contas.email é unique — usamos o e-mail do criador (login real fica em usuarios).
    const contasEmail = await sql<{ id: string }[]>`select id from contas where email = ${email}`;
    if (contasEmail.length > 0) {
      return reply.code(409).send({ erro: 'já existe uma conta com este e-mail' });
    }

    const criadas = await sql<{ id: string }[]>`
      insert into contas (email, senha_hash, nome)
      values (${email}, ${senhaHash}, ${nomeWs})
      returning id`;
    const conta = criadas[0];
    if (conta === undefined) throw new Error('insert de conta não retornou linha');
    contaId = conta.id;
    papel = 'dono';

    const linhas = await sql<{ id: string }[]>`
      insert into usuarios (conta_id, nome, email, senha_hash, papel)
      values (${contaId}, ${nome}, ${email}, ${senhaHash}, ${papel})
      returning id`;
    const usuario = linhas[0];
    if (usuario === undefined) throw new Error('insert de usuario não retornou linha');

    const sessaoId = await criarSessao(usuario.id, contaId);
    reply.setCookie(NOME_COOKIE_SESSAO, sessaoId, opcoesSessao());
    const entrada = await registrarEntrada(usuario.id, contaId, nome);
    void anunciarEntradaWs(contaId, entrada);
    return reply.code(201).send(corpoUsuario({ id: usuario.id, nome, email, papel }));
  });

  app.post('/api/auth/entrar', limiteAuth, async (req, reply) => {
    const { email, senha } = credenciaisSchema.parse(req.body);

    const linhas = await sql<
      { id: string; conta_id: string; nome: string; senha_hash: string; papel: string }[]
    >`select id, conta_id, nome, senha_hash, papel from usuarios where email = ${email}`;
    const usuario = linhas[0];

    if (usuario === undefined || !(await conferirSenha(usuario.senha_hash, senha))) {
      return reply.code(401).send({ erro: 'credenciais inválidas' });
    }

    const sessaoId = await criarSessao(usuario.id, usuario.conta_id);
    reply.setCookie(NOME_COOKIE_SESSAO, sessaoId, opcoesSessao());
    const entrada = await registrarEntrada(usuario.id, usuario.conta_id, usuario.nome);
    void anunciarEntradaWs(usuario.conta_id, entrada);
    return reply.send(
      corpoUsuario({
        id: usuario.id,
        nome: usuario.nome,
        email,
        papel: usuario.papel,
      }),
    );
  });

  app.post('/api/auth/sair', async (req, reply) => {
    const assinado = req.cookies[NOME_COOKIE_SESSAO];
    if (assinado !== undefined) {
      const conferido = req.unsignCookie(assinado);
      if (conferido.valid && conferido.value !== null) {
        await revogarSessao(conferido.value);
      }
    }
    reply.clearCookie(NOME_COOKIE_SESSAO, opcoesLimpar());
    return reply.send({ ok: true });
  });

  app.get('/api/auth/eu', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    return reply.send(corpoUsuario(u));
  });

  // Lista usuários DA CONTA do admin logado.
  app.get('/api/auth/usuarios', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode listar usuários' });
    }
    const contaId = contaObrigatoria(req);
    const linhas = await sql<
      { id: string; nome: string; email: string; papel: string; criado_em: Date }[]
    >`
      select id, nome, email, papel, criado_em
      from usuarios
      where conta_id = ${contaId}
      order by lower(nome), email`;
    return reply.send(
      linhas.map((l) => ({
        id: l.id,
        nome: l.nome,
        email: l.email,
        papel: l.papel === 'dono' ? 'dono' : 'membro',
        criadoEm: l.criado_em.toISOString(),
      })),
    );
  });

  // Remove acesso de um membro (não remove o próprio admin se for o único dono).
  app.delete('/api/auth/usuarios/:id', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode remover usuários' });
    }
    const { id } = paramsIdSchema.parse(req.params);
    const contaId = contaObrigatoria(req);

    if (id === u.id) {
      return reply.code(400).send({ erro: 'você não pode remover a si mesmo' });
    }

    const alvos = await sql<{ id: string; papel: string }[]>`
      select id, papel from usuarios where id = ${id} and conta_id = ${contaId}`;
    const alvo = alvos[0];
    if (alvo === undefined) {
      return reply.code(404).send({ erro: 'usuário não encontrado' });
    }
    if (alvo.papel === 'dono') {
      const donos = await sql<{ n: string }[]>`
        select count(*)::text as n from usuarios
        where conta_id = ${contaId} and papel = 'dono'`;
      if (Number(donos[0]?.n ?? '0') <= 1) {
        return reply.code(400).send({ erro: 'não dá para remover o único admin da conta' });
      }
    }

    await revogarSessoesDoUsuario(alvo.id);
    await sql`delete from usuarios where id = ${alvo.id} and conta_id = ${contaId}`;
    return reply.send({ ok: true });
  });

  app.patch('/api/auth/usuarios/:id/senha', { preHandler: exigeDono, ...limiteAuth }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode definir senhas' });
    }
    const { id } = paramsIdSchema.parse(req.params);
    const { senha } = senhaUsuarioSchema.parse(req.body);
    const contaId = contaObrigatoria(req);

    const alvos = await sql<{ id: string; email: string }[]>`
      select id, email from usuarios where id = ${id} and conta_id = ${contaId}`;
    const alvo = alvos[0];
    if (alvo === undefined) {
      return reply.code(404).send({ erro: 'usuário não encontrado' });
    }

    const senhaHash = await gerarHash(senha);
    await sql`update usuarios set senha_hash = ${senhaHash} where id = ${alvo.id}`;
    if (alvo.id !== u.id) {
      await revogarSessoesDoUsuario(alvo.id);
    }
    return reply.send({ ok: true, email: alvo.email });
  });

  // Código permanente da conta (opcional). Qualquer dono da própria conta.
  app.patch('/api/auth/codigo-convite', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    const contaId = contaObrigatoria(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode trocar o código de convite' });
    }
    const { codigo } = codigoConviteSchema.parse(req.body);
    const hashCodigo = await gerarHash(codigo);
    await sql`update contas set codigo_convite_hash = ${hashCodigo} where id = ${contaId}`;
    return reply.send({ ok: true });
  });

  // --- Tokens de convite (caminho principal para convidar membros) ---

  app.get('/api/auth/tokens-convite', { preHandler: exigeDono }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode ver tokens' });
    }
    const lista = await listarConvitesConta(contaObrigatoria(req));
    return reply.send(lista);
  });

  app.post('/api/auth/tokens-convite', { preHandler: exigeDono, ...limiteAuth }, async (req, reply) => {
    const u = usuarioObrigatorio(req);
    if (!ehAdminConta(u.papel)) {
      return reply.code(403).send({ erro: 'só o admin da conta pode gerar tokens' });
    }
    const body = criarTokenConviteSchema.parse(req.body ?? {});
    const convite = await criarConviteConta(contaObrigatoria(req), u.id, {
      rotulo: body.rotulo,
      diasValidade: body.diasValidade,
      maxUsos: body.maxUsos,
    });
    return reply.code(201).send(convite);
  });

  app.delete<{ Params: { token: string } }>(
    '/api/auth/tokens-convite/:token',
    { preHandler: exigeDono },
    async (req, reply) => {
      const u = usuarioObrigatorio(req);
      if (!ehAdminConta(u.papel)) {
        return reply.code(403).send({ erro: 'só o admin da conta pode revogar tokens' });
      }
      const token = decodeURIComponent(req.params.token);
      const ok = await revogarConviteConta(contaObrigatoria(req), token);
      return reply.send({ revogado: ok });
    },
  );
}
