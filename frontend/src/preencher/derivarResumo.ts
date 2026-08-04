import type { Campo, ConfigCampo, Registro, TipoCampo } from '../../../shared/tipos';

const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function textoDe(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

// Corpo (blocos) VIGENTE de um registro: o próprio, quando o registro tem
// estrutura independente; senão o compartilhado da coleção. Tudo que deriva
// título/resumo/capa/edição deve usar ISTO (não colecao.campos direto).
export function camposDoRegistro(colecao: { campos: Campo[] }, registro: Registro): Campo[] {
  return Array.isArray(registro.campos) && registro.campos.length > 0
    ? registro.campos
    : colecao.campos;
}

// Valor de um campo formatado para leitura (célula/resumo). Imagem não entra aqui.
// Aceita Campo ou SubCampo (só precisa de tipo + config).
export function formatarValor(
  campo: { tipo: TipoCampo; config: ConfigCampo },
  valor: unknown,
): string {
  switch (campo.tipo) {
    case 'texto':
    case 'paragrafo':
    case 'selecao':
      return textoDe(valor);
    case 'numero': {
      if (typeof valor !== 'number') return '';
      const sufixo = campo.config.sufixo;
      return sufixo !== undefined && sufixo !== '' ? `${valor} ${sufixo}` : String(valor);
    }
    case 'data': {
      const s = textoDe(valor);
      if (s === '') return '';
      const d = new Date(`${s}T00:00:00`);
      return Number.isNaN(d.getTime()) ? s : fmtData.format(d);
    }
    case 'datahora': {
      const s = textoDe(valor);
      if (s === '') return '';
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? s : fmtDataHora.format(d);
    }
    case 'secao': {
      const n = Array.isArray(valor) ? valor.length : 0;
      return n === 0 ? '' : `${n} ${n === 1 ? 'linha' : 'linhas'}`;
    }
    case 'booleano':
      return valor === true ? 'Sim' : valor === false ? 'Não' : '';
    default:
      return '';
  }
}

function nomeNormalizado(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

// Só a "área de referência" define o título. Não usamos mais o nome do bloco
// "título"/"nome" nem caímos no 1º parágrafo/texto: o título do registro é
// exclusivamente o que estiver escrito nos blocos de referência.
function nomeEhReferencia(nome: string): boolean {
  const n = nomeNormalizado(nome);
  return n.includes('referencia') || n.includes('ref.');
}

// Tipos de bloco cujo valor pode compor o título (texto puro/legível).
const TIPOS_TITULO: Campo['tipo'][] = ['texto', 'paragrafo', 'numero', 'selecao'];

// Todos os blocos de topo da "área de referência" (na ordem da planilha).
export function camposReferencia(campos: Campo[]): Campo[] {
  return campos.filter((c) => TIPOS_TITULO.includes(c.tipo) && nomeEhReferencia(c.nome));
}

// Compat: o primeiro bloco de referência de topo.
export function campoReferencia(campos: Campo[]): Campo | undefined {
  return camposReferencia(campos)[0];
}

// Linhas de uma seção (array de objetos {subcampoId: valor}). Tolerante a lixo.
function linhasDeSecao(registro: Registro, campoId: string): Record<string, unknown>[] {
  const v = registro.valores[campoId];
  if (!Array.isArray(v)) return [];
  return v.filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null);
}

// Título = TUDO que estiver escrito na "área de referência", unido por " | ".
// A referência pode ser:
//  - um ou mais blocos de topo cujo nome é "Referência"/"ref.", e/ou
//  - um subcampo "Referência" dentro de uma seção (uma parte por LINHA da seção).
// Ex. com uma seção de 3 linhas -> "4578 | 5486 | 4458". Sem nada -> "Sem nome".
export function tituloDoRegistro(campos: Campo[], registro: Registro): string {
  const partes: string[] = [];
  for (const c of campos) {
    if (TIPOS_TITULO.includes(c.tipo) && nomeEhReferencia(c.nome)) {
      const v = formatarValor(c, registro.valores[c.id]).trim();
      if (v !== '') partes.push(v);
      continue;
    }
    if (c.tipo === 'secao') {
      const subsRef = (c.config.subcampos ?? []).filter((s) => nomeEhReferencia(s.nome));
      if (subsRef.length === 0) continue;
      for (const linha of linhasDeSecao(registro, c.id)) {
        for (const s of subsRef) {
          const v = formatarValor(s, linha[s.id]).trim();
          if (v !== '') partes.push(v);
        }
      }
    }
  }
  return partes.length === 0 ? 'Sem nome' : partes.join(' | ');
}

// ---- alvo editável do "Renomear" ----
// Pode ser um bloco de topo (texto/parágrafo) OU o subcampo "Referência" de uma
// seção (edita a 1ª linha). undefined = sem alvo (não mostra o botão renomear).
export interface AlvoTitulo {
  campoId: string;
  subcampoId?: string;
}

export function alvoTitulo(campos: Campo[]): AlvoTitulo | undefined {
  const topo = campos.find(
    (c) => (c.tipo === 'texto' || c.tipo === 'paragrafo') && nomeEhReferencia(c.nome),
  );
  if (topo !== undefined) return { campoId: topo.id };
  for (const c of campos) {
    if (c.tipo !== 'secao') continue;
    const sub = (c.config.subcampos ?? []).find(
      (s) => s.tipo === 'texto' && nomeEhReferencia(s.nome),
    );
    if (sub !== undefined) return { campoId: c.id, subcampoId: sub.id };
  }
  return undefined;
}

export function lerAlvoTitulo(registro: Registro, alvo: AlvoTitulo): string {
  if (alvo.subcampoId === undefined) return textoDe(registro.valores[alvo.campoId]);
  const linha0 = linhasDeSecao(registro, alvo.campoId)[0];
  return linha0 === undefined ? '' : textoDe(linha0[alvo.subcampoId]);
}

// Monta o PATCH mínimo para gravar o novo título. Para subcampo, reescreve a
// seção inteira preservando as demais linhas (só a 1ª linha muda; cria uma se
// não houver nenhuma).
export function patchAlvoTitulo(
  registro: Registro,
  alvo: AlvoTitulo,
  texto: string,
): Record<string, unknown> {
  if (alvo.subcampoId === undefined) return { [alvo.campoId]: texto };
  const brutas = registro.valores[alvo.campoId];
  const linhas = Array.isArray(brutas) ? [...(brutas as unknown[])] : [];
  const base = typeof linhas[0] === 'object' && linhas[0] !== null
    ? { ...(linhas[0] as Record<string, unknown>) }
    : {};
  base[alvo.subcampoId] = texto;
  linhas[0] = base;
  return { [alvo.campoId]: linhas };
}

// Resumo = próximos até 3 campos de texto/número/data/seleção (fora os de
// referência de topo), com valor preenchido.
export function resumoDoRegistro(campos: Campo[], registro: Registro): string {
  const refs = new Set(camposReferencia(campos).map((c) => c.id));
  const tiposResumo: Campo['tipo'][] = ['texto', 'numero', 'data', 'selecao'];
  const partes: string[] = [];
  for (const c of campos) {
    if (refs.has(c.id)) continue;
    if (!tiposResumo.includes(c.tipo)) continue;
    const txt = formatarValor(c, registro.valores[c.id]).trim();
    if (txt !== '') partes.push(txt);
    if (partes.length === 3) break;
  }
  return partes.join(' · ');
}

// Keys de imagem de um campo (array de keys da cheia). Tolerante a valor malformado.
export function keysDoCampo(registro: Registro, campoId: string): string[] {
  const v = registro.valores[campoId];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function nomeSugereFotoRef(nome: string): boolean {
  const n = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return (
    n.includes('referencia') ||
    n.includes('modelagem') ||
    n.includes('imagem') ||
    n.includes('foto')
  );
}

// Todas as keys de imagem de um campo (topo) ou, se for seção, de subcampos imagem.
export function keysDeImagensDoCampo(campo: Campo, registro: Registro): string[] {
  if (campo.tipo === 'imagem') return keysDoCampo(registro, campo.id);
  if (campo.tipo !== 'secao') return [];
  const linhas = Array.isArray(registro.valores[campo.id])
    ? (registro.valores[campo.id] as unknown[])
    : [];
  const subs = (campo.config.subcampos ?? []).filter((s) => s.tipo === 'imagem');
  const out: string[] = [];
  for (const linha of linhas) {
    if (typeof linha !== 'object' || linha === null) continue;
    const obj = linha as Record<string, unknown>;
    for (const s of subs) {
      const v = obj[s.id];
      if (!Array.isArray(v)) continue;
      for (const k of v) if (typeof k === 'string') out.push(k);
    }
  }
  return out;
}

// Capa = foto do bloco de referência/modelagem, senão 1ª imagem de qualquer campo/seção.
export function capaDoRegistro(campos: Campo[], registro: Registro): string | null {
  const preferidos = [
    ...campos.filter((c) => c.tipo === 'imagem' && nomeSugereFotoRef(c.nome)),
    ...campos.filter((c) => c.tipo === 'imagem'),
    ...campos.filter((c) => c.tipo === 'secao'),
  ];
  const vistos = new Set<string>();
  for (const c of preferidos) {
    if (vistos.has(c.id)) continue;
    vistos.add(c.id);
    const keys = keysDeImagensDoCampo(c, registro);
    if (keys.length > 0) return keys[0] ?? null;
  }
  return null;
}

export function temCampoImagem(campos: Campo[]): boolean {
  return campos.some(
    (c) =>
      c.tipo === 'imagem' ||
      (c.tipo === 'secao' && (c.config.subcampos ?? []).some((s) => s.tipo === 'imagem')),
  );
}
