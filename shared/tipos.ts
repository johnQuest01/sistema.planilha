export const TIPOS_CAMPO = [
  'texto', 'paragrafo', 'numero', 'imagem', 'selecao', 'data', 'booleano'
] as const;
export type TipoCampo = typeof TIPOS_CAMPO[number];

// Valor JSON puro. A index signature de ConfigCampo precisa ser estruturalmente
// serializável pro driver (postgres.js) aceitar `sql.json(config)` sem cast; `unknown`
// não satisfaz o JSONValue dele. O .strict() do Zod barra chave desconhecida na entrada.
export type ValorJson =
  | null
  | string
  | number
  | boolean
  | ValorJson[]
  | { [k: string]: ValorJson | undefined };

export interface ConfigCampo {
  opcoes?: string[];      // selecao
  sufixo?: string;        // numero — "kg", "R$", "g/m²"
  obrigatorio?: boolean;
  [k: string]: ValorJson | undefined;
}

export interface Campo {
  id: string;
  colecaoId: string;
  nome: string;
  tipo: TipoCampo;
  ordem: number;
  config: ConfigCampo;
}

export interface Registro {
  id: string;
  colecaoId: string;
  valores: Record<string, unknown>;   // chave = Campo.id
  criadoEm: string;
  atualizadoEm: string;
}

export interface Colecao {
  id: string;
  nome: string;
  campos: Campo[];
}
