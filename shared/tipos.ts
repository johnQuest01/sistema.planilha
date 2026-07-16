export const TIPOS_CAMPO = [
  'texto', 'paragrafo', 'numero', 'imagem', 'selecao', 'data', 'datahora', 'booleano', 'secao'
] as const;
export type TipoCampo = typeof TIPOS_CAMPO[number];

// Tipos permitidos DENTRO de uma seção (sem imagem nem seção aninhada).
export const TIPOS_SUBCAMPO = [
  'texto', 'numero', 'selecao', 'data', 'datahora', 'booleano'
] as const;
export type TipoSubCampo = typeof TIPOS_SUBCAMPO[number];

// Subcampo é um "quadradinho" de uma seção. Usa `type` (não `interface`) de propósito:
// aliases de objeto ganham index signature implícita e satisfazem ConfigCampo/ValorJson.
export type SubCampo = {
  id: string;
  nome: string;
  tipo: TipoSubCampo;
  config: ConfigCampo;
};

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
  maxFotos?: number;      // só para tipo 'imagem'. 1..10, default 1.
  autoAgora?: boolean;    // data/datahora: já vem com a data/hora atual ao criar registro
  subcampos?: SubCampo[]; // secao: os "quadradinhos" que se repetem por linha
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
