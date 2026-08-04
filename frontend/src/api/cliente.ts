import type {
  Campo,
  Colecao,
  ConfigCampo,
  ItemLixeira,
  Registro,
  TipoCampo,
  Usuario,
  UsuarioResumo,
} from '../../../shared/tipos';

export type { Usuario, UsuarioResumo, ItemLixeira } from '../../../shared/tipos';

// Resumo devolvido por GET /api/colecoes (sem campos). O detalhe (com campos) vem
// por GET /api/colecoes/:id como Colecao.
export interface ColecaoResumo {
  id: string;
  nome: string;
  criadoPor: string | null;
  criadoEm: string;
  atualizadoEm: string;
  protegida: boolean;
  bloqueada: boolean;
}

export interface RespostaUpload {
  key: string;
  urlCheia: string;
  urlMini: string;
}

export class ErroApi extends Error {
  readonly status: number;
  readonly corpo: unknown;
  constructor(status: number, mensagem: string, corpo?: unknown) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.corpo = corpo;
  }
}

// Depois disso sem resposta, avisamos a UI que o servidor está "acordando" (cold start
// do Render/Neon no free tier) para o usuário não achar que a tela travou.
const LENTO_MS = 4_000;
// Rede de segurança: aborta requisições penduradas. Fica ACIMA do cold start típico
// (~30-50s) para não deslogar/errar por engano quando o servidor só está demorando.
const TIMEOUT_MS = 60_000;

type OuvinteLento = (lento: boolean) => void;
const ouvintesLento = new Set<OuvinteLento>();
let pendentesLentas = 0;

// A UI (tela Carregando) assina isto para mostrar "acordando o servidor…".
export function aoServidorLento(fn: OuvinteLento): () => void {
  ouvintesLento.add(fn);
  fn(pendentesLentas > 0);
  return () => {
    ouvintesLento.delete(fn);
  };
}

function marcarLento(lento: boolean): void {
  for (const fn of ouvintesLento) fn(lento);
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const tTimeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let contouLento = false;
  const tLento = setTimeout(() => {
    contouLento = true;
    pendentesLentas += 1;
    if (pendentesLentas === 1) marcarLento(true);
  }, LENTO_MS);

  try {
    const resp = await fetch(caminho, {
      ...init,
      signal: init?.signal ?? ctrl.signal,
      credentials: 'same-origin',
      headers:
        init?.body === undefined
          ? init?.headers
          : { 'content-type': 'application/json', ...init?.headers },
    });

    if (resp.status === 204) return undefined as T;

    const texto = await resp.text();
    const corpo: unknown = texto.length > 0 ? JSON.parse(texto) : undefined;

    if (!resp.ok) {
      const msg =
        corpo !== undefined &&
        typeof corpo === 'object' &&
        corpo !== null &&
        'erro' in corpo &&
        typeof (corpo as { erro: unknown }).erro === 'string'
          ? (corpo as { erro: string }).erro
          : `erro ${resp.status}`;
      throw new ErroApi(resp.status, msg, corpo);
    }

    return corpo as T;
  } finally {
    clearTimeout(tTimeout);
    clearTimeout(tLento);
    if (contouLento) {
      pendentesLentas -= 1;
      if (pendentesLentas === 0) marcarLento(false);
    }
  }
}

function corpoJson(dados: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(dados) };
}

export const api = {
  // --- config / auth ---
  config: () => pedir<{ r2PublicBase: string; wsBase?: string }>('/api/config'),
  eu: () => pedir<Usuario>('/api/auth/eu'),
  entrar: (email: string, senha: string) =>
    pedir<Usuario>('/api/auth/entrar', corpoJson({ email, senha })),
  registrar: (nome: string, email: string, senha: string, codigo: string) =>
    pedir<Usuario>('/api/auth/registrar', corpoJson({ nome, email, senha, codigo })),
  sair: () => pedir<{ ok: boolean }>('/api/auth/sair', { method: 'POST' }),
  definirCodigoConvite: (codigo: string) =>
    pedir<{ ok: boolean }>('/api/auth/codigo-convite', {
      method: 'PATCH',
      body: JSON.stringify({ codigo }),
    }),
  listarUsuarios: () => pedir<UsuarioResumo[]>('/api/auth/usuarios'),
  definirSenhaUsuario: (id: string, senha: string) =>
    pedir<{ ok: boolean; email: string }>(`/api/auth/usuarios/${id}/senha`, {
      method: 'PATCH',
      body: JSON.stringify({ senha }),
    }),

  // --- coleções ---
  listarColecoes: () => pedir<ColecaoResumo[]>('/api/colecoes'),
  criarColecao: (nome: string) =>
    pedir<ColecaoResumo>('/api/colecoes', corpoJson({ nome })),
  obterColecao: (id: string) => pedir<Colecao>(`/api/colecoes/${id}`),
  desbloquearColecao: (id: string, senha: string) =>
    pedir<Colecao>(`/api/colecoes/${id}/desbloquear`, corpoJson({ senha })),
  definirSenhaColecao: (id: string, senha: string) =>
    pedir<{ ok: boolean }>(`/api/colecoes/${id}/senha`, {
      method: 'PATCH',
      body: JSON.stringify({ senha }),
    }),
  removerSenhaColecao: (id: string) =>
    pedir<{ ok: boolean }>(`/api/colecoes/${id}/senha`, { method: 'DELETE' }),
  renomearColecao: (id: string, nome: string) =>
    pedir<ColecaoResumo>(`/api/colecoes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ nome }),
    }),
  duplicarColecao: (id: string) =>
    pedir<Colecao>(`/api/colecoes/${id}/duplicar`, { method: 'POST' }),
  apagarColecao: (id: string) =>
    pedir<void>(`/api/colecoes/${id}`, { method: 'DELETE' }),

  // --- campos ---
  criarCampo: (colecaoId: string, dados: { nome: string; tipo: TipoCampo; config?: ConfigCampo }) =>
    pedir<Campo>(`/api/colecoes/${colecaoId}/campos`, corpoJson(dados)),
  editarCampo: (
    id: string,
    patch: { nome?: string; tipo?: TipoCampo; config?: ConfigCampo },
  ) =>
    pedir<Campo>(`/api/campos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  reordenarCampos: (colecaoId: string, ids: string[]) =>
    pedir<Campo[]>(`/api/colecoes/${colecaoId}/campos/ordem`, {
      method: 'PATCH',
      body: JSON.stringify({ ids }),
    }),
  apagarCampo: (id: string) => pedir<void>(`/api/campos/${id}`, { method: 'DELETE' }),

  // --- registros ---
  listarRegistros: (colecaoId: string, before?: string) => {
    const q = before === undefined ? '' : `?before=${encodeURIComponent(before)}`;
    return pedir<Registro[]>(`/api/colecoes/${colecaoId}/registros${q}`);
  },
  buscarRegistros: (colecaoId: string, termo: string) =>
    pedir<Registro[]>(
      `/api/colecoes/${colecaoId}/registros/busca?q=${encodeURIComponent(termo)}`,
    ),
  // `campos` opcional: quando enviado (duplicar/novo-a-partir-de outro registro),
  // o novo registro nasce com CORPO próprio (estrutura independente da coleção).
  criarRegistro: (colecaoId: string, valores: Record<string, unknown> = {}, campos?: Campo[]) =>
    pedir<Registro>(
      `/api/colecoes/${colecaoId}/registros`,
      corpoJson(campos === undefined ? { valores } : { valores, campos }),
    ),
  editarRegistro: (id: string, valores: Record<string, unknown>) =>
    pedir<Registro>(`/api/registros/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ valores }),
    }),
  // Substitui o corpo (blocos) de UM registro, tornando-o independente da coleção.
  salvarCorpoRegistro: (id: string, campos: Campo[]) =>
    pedir<Registro>(`/api/registros/${id}/corpo`, {
      method: 'PUT',
      body: JSON.stringify({ campos }),
    }),
  apagarRegistro: (id: string) =>
    pedir<void>(`/api/registros/${id}`, { method: 'DELETE' }),

  // --- lixeira ---
  listarLixeira: () => pedir<ItemLixeira[]>('/api/lixeira'),
  restaurarLixeira: (id: string) =>
    pedir<Registro>(`/api/lixeira/${id}/restaurar`, { method: 'POST' }),
  apagarLixeiraDefinitivo: (id: string) =>
    pedir<void>(`/api/lixeira/${id}`, { method: 'DELETE' }),

  // --- alavanca de edição (por conta, salva no servidor) ---
  edicaoTrava: () => pedir<{ liberada: boolean }>('/api/conta/edicao-trava'),
  salvarEdicaoTrava: (liberada: boolean) =>
    pedir<{ liberada: boolean }>('/api/conta/edicao-trava', {
      method: 'PATCH',
      body: JSON.stringify({ liberada }),
    }),

  // --- presença ao vivo ---
  presenca: () =>
    pedir<{
      online: { id: string; nome: string }[];
      entradas: { id: string; usuarioId: string; nome: string; criadoEm: string }[];
    }>('/api/presenca'),
  ticketPresenca: () =>
    pedir<{ ticket: string; expiraEm: number }>('/api/presenca/ws-ticket'),

  // --- upload (Fase 5) ---
  presignUpload: (
    registroId: string,
    dados: { mime: string; tamanhoCheia: number; tamanhoMini: number },
  ) => pedir<RespostaUpload>(`/api/registros/${registroId}/upload`, corpoJson(dados)),
};
