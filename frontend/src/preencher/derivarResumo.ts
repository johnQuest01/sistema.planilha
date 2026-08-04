import type { Campo, Registro } from '../../../shared/tipos';

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

// Valor de um campo formatado para leitura (célula/resumo). Imagem não entra aqui.
export function formatarValor(campo: Campo, valor: unknown): string {
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

// Todos os blocos da "área de referência" (na ordem da planilha) que podem
// virar título. Pode haver mais de um ("Referência 1", "Referência 2"…).
export function camposReferencia(campos: Campo[]): Campo[] {
  return campos.filter((c) => TIPOS_TITULO.includes(c.tipo) && nomeEhReferencia(c.nome));
}

// Compat: o primeiro bloco de referência.
export function campoReferencia(campos: Campo[]): Campo | undefined {
  return camposReferencia(campos)[0];
}

// Campo renomeável na prévia/lista: o 1º bloco de referência textual (texto/
// parágrafo). Referências numéricas/seleção não abrem o "renomear" para não
// gravar texto num campo que espera número.
export function campoTituloDoRegistro(campos: Campo[]): Campo | undefined {
  return camposReferencia(campos).find((c) => c.tipo === 'texto' || c.tipo === 'paragrafo');
}

// Título = valores preenchidos dos blocos de referência, unidos por " | ".
// Ex.: dois blocos preenchidos -> "4578 | 4589". Sem nenhum -> "Sem nome".
export function tituloDoRegistro(campos: Campo[], registro: Registro): string {
  const partes = camposReferencia(campos)
    .map((c) => formatarValor(c, registro.valores[c.id]).trim())
    .filter((s) => s !== '');
  return partes.length === 0 ? 'Sem nome' : partes.join(' | ');
}

// Resumo = próximos até 3 campos de texto/número/data/seleção (fora os de
// referência), com valor preenchido.
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
