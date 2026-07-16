import type {
  Campo,
  Colecao,
  ConfigCampo,
  Registro,
  TipoCampo,
  Usuario,
} from '../../../shared/tipos';

export type { Usuario } from '../../../shared/tipos';

// Resumo devolvido por GET /api/colecoes (sem campos). O detalhe (com campos) vem
// por GET /api/colecoes/:id como Colecao.
export interface ColecaoResumo {
  id: string;
  nome: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface RespostaUpload {
  key: string;
  urlCheia: string;
  urlMini: string;
}

export class ErroApi extends Error {
  readonly status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
  }
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(caminho, {
    ...init,
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
    throw new ErroApi(resp.status, msg);
  }

  return corpo as T;
}

function corpoJson(dados: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(dados) };
}

export const api = {
  // --- config / auth ---
  config: () => pedir<{ r2PublicBase: string }>('/api/config'),
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

  // --- coleções ---
  listarColecoes: () => pedir<ColecaoResumo[]>('/api/colecoes'),
  criarColecao: (nome: string) =>
    pedir<ColecaoResumo>('/api/colecoes', corpoJson({ nome })),
  obterColecao: (id: string) => pedir<Colecao>(`/api/colecoes/${id}`),
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
  criarRegistro: (colecaoId: string, valores: Record<string, unknown> = {}) =>
    pedir<Registro>(`/api/colecoes/${colecaoId}/registros`, corpoJson({ valores })),
  editarRegistro: (id: string, valores: Record<string, unknown>) =>
    pedir<Registro>(`/api/registros/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ valores }),
    }),
  apagarRegistro: (id: string) =>
    pedir<void>(`/api/registros/${id}`, { method: 'DELETE' }),

  // --- upload (Fase 5) ---
  presignUpload: (
    registroId: string,
    dados: { mime: string; tamanhoCheia: number; tamanhoMini: number },
  ) => pedir<RespostaUpload>(`/api/registros/${registroId}/upload`, corpoJson(dados)),
};
