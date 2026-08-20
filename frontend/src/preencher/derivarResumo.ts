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
// O `(^|[^a-z])` garante que a palavra comece de fato em "ref" — antes um bloco
// "Preferência" (normaliza p/ "preferencia") era confundido com "referência".
function nomeEhReferencia(nome: string): boolean {
  return /(?:^|[^a-z])(?:referencia|ref\.)/.test(nomeNormalizado(nome));
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
// Blocos de topo marcados como "título" pelo botão (config.ehTitulo). Quando existe
// ao menos um, ELE manda no título (em qualquer planilha) — o nome "Referência" vira
// só o padrão quando nada foi marcado.
export function camposTituloMarcados(campos: Campo[]): Campo[] {
  return campos.filter((c) => TIPOS_TITULO.includes(c.tipo) && c.config.ehTitulo === true);
}

export function tituloDoRegistro(campos: Campo[], registro: Registro): string {
  const marcados = camposTituloMarcados(campos);
  if (marcados.length > 0) {
    // Valor do bloco marcado; se vazio, o cabeçalho (config.titulo) ou o nome do bloco.
    const partesM = marcados.map((c) => {
      const v = formatarValor(c, registro.valores[c.id]).trim();
      return v !== '' ? v : (c.config.titulo?.trim() ?? '') || c.nome;
    });
    const juntos = partesM.filter((p) => p.trim() !== '').join(' | ');
    return juntos === '' ? 'Sem nome' : juntos;
  }
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
// Pode ser um bloco de topo (texto/parágrafo/número/seleção) OU o subcampo
// "Referência" de uma seção (edita a 1ª linha). undefined = sem alvo (não mostra
// o botão renomear). Guarda o `tipo` para ler/gravar o valor no formato certo —
// nas Oficinas a referência costuma ser NÚMERO, e sem isto o renomear sumia.
export interface AlvoTitulo {
  campoId: string;
  subcampoId?: string;
  tipo: TipoCampo;
}

// Tipos de bloco/subcampo cuja referência dá para renomear (texto legível ou número).
const TIPOS_RENOMEAR: TipoCampo[] = ['texto', 'paragrafo', 'numero', 'selecao'];

export function alvoTitulo(campos: Campo[]): AlvoTitulo | undefined {
  // Bloco marcado como título (botão Título) é o alvo do renomear, se houver.
  const marcado = campos.find((c) => TIPOS_RENOMEAR.includes(c.tipo) && c.config.ehTitulo === true);
  if (marcado !== undefined) return { campoId: marcado.id, tipo: marcado.tipo };
  const topo = campos.find((c) => TIPOS_RENOMEAR.includes(c.tipo) && nomeEhReferencia(c.nome));
  if (topo !== undefined) return { campoId: topo.id, tipo: topo.tipo };
  for (const c of campos) {
    if (c.tipo !== 'secao') continue;
    const sub = (c.config.subcampos ?? []).find(
      (s) => TIPOS_RENOMEAR.includes(s.tipo) && nomeEhReferencia(s.nome),
    );
    if (sub !== undefined) return { campoId: c.id, subcampoId: sub.id, tipo: sub.tipo };
  }
  return undefined;
}

// Converte o texto digitado no renomear para o formato do campo alvo. Número vazio
// vira null (limpa); número inválido volta como string para o servidor recusar e
// o usuário ver o aviso, em vez de gravar lixo.
function valorParaAlvo(tipo: TipoCampo, texto: string): unknown {
  const t = texto.trim();
  if (tipo === 'numero') {
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : t;
  }
  return t;
}

function indiceLinhaDoAlvo(registro: Registro, alvo: AlvoTitulo, codigo?: string): number {
  if (alvo.subcampoId === undefined) return 0;
  const linhas = linhasDeSecao(registro, alvo.campoId);
  const alvoCod = codigo !== undefined && /^\d{3,6}$/.test(codigo) ? codigo : '';
  if (alvoCod !== '') {
    const idx = linhas.findIndex((l) => {
      const v = l[alvo.subcampoId ?? ''];
      const s =
        typeof v === 'number' && Number.isFinite(v)
          ? String(Math.trunc(v))
          : typeof v === 'string'
            ? v
            : '';
      return s.match(/\d{3,6}/)?.[0] === alvoCod;
    });
    if (idx >= 0) return idx;
  }
  return 0;
}

export function lerAlvoTitulo(registro: Registro, alvo: AlvoTitulo, codigo?: string): string {
  const bruto =
    alvo.subcampoId === undefined
      ? registro.valores[alvo.campoId]
      : linhasDeSecao(registro, alvo.campoId)[indiceLinhaDoAlvo(registro, alvo, codigo)]?.[
          alvo.subcampoId
        ];
  if (alvo.tipo === 'numero') return typeof bruto === 'number' ? String(bruto) : '';
  return textoDe(bruto);
}

// Monta o PATCH mínimo para gravar o novo título. Para subcampo, reescreve a
// seção inteira preservando as demais linhas (só a linha da referência muda;
// cria uma se não houver nenhuma). `codigo` escolhe a linha quando o registro
// tem várias refs (Modelagem) — sem isto o renomear da planilha unida apagaria
// as outras referências.
export function patchAlvoTitulo(
  registro: Registro,
  alvo: AlvoTitulo,
  texto: string,
  codigo?: string,
): Record<string, unknown> {
  const valor = valorParaAlvo(alvo.tipo, texto);
  if (alvo.subcampoId === undefined) return { [alvo.campoId]: valor };
  const brutas = registro.valores[alvo.campoId];
  const linhas = Array.isArray(brutas) ? [...(brutas as unknown[])] : [];
  const i = indiceLinhaDoAlvo(registro, alvo, codigo);
  const atual = linhas[i];
  const base =
    typeof atual === 'object' && atual !== null ? { ...(atual as Record<string, unknown>) } : {};
  base[alvo.subcampoId] = valor;
  linhas[i] = base;
  return { [alvo.campoId]: linhas };
}

// Resumo = próximos até 3 campos de texto/número/data/seleção (fora os de
// referência de topo), com valor preenchido.
export function resumoDoRegistro(campos: Campo[], registro: Registro): string {
  const refs = new Set([...camposReferencia(campos), ...camposTituloMarcados(campos)].map((c) => c.id));
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
    /(?:^|[^a-z])referencia/.test(n) ||
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
export function capaDoRegistro(campos: Campo[], registro: Registro, codigo?: string): string | null {
  // Na planilha unida, um registro de Modelagem pode ter várias linhas em R:
  // a miniatura do cartão 4832 deve ser a foto DESSA linha, não a da primeira.
  const alvo = codigo !== undefined && /^\d{3,6}$/.test(codigo) ? codigo : '';
  if (alvo !== '') {
    for (const c of campos) {
      if (c.tipo !== 'secao') continue;
      const subs = c.config.subcampos ?? [];
      const subRef = subs.find((s) => nomeEhReferencia(s.nome));
      const subFoto = subs.find((s) => s.tipo === 'imagem');
      if (subRef === undefined || subFoto === undefined) continue;
      for (const linha of linhasDeSecao(registro, c.id)) {
        const bruto = linha[subRef.id];
        const s =
          typeof bruto === 'number' && Number.isFinite(bruto)
            ? String(Math.trunc(bruto))
            : typeof bruto === 'string'
              ? bruto
              : '';
        const m = s.match(/\d{3,6}/);
        if (m?.[0] !== alvo) continue;
        const v = linha[subFoto.id];
        if (!Array.isArray(v)) continue;
        const k = v.find((x): x is string => typeof x === 'string');
        if (k !== undefined) return k;
      }
    }
  }
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
