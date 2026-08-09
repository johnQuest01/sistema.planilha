// Reimporta um .zip de BACKUP (gerado por exportarColecao/exportarIntegracao),
// recriando a(s) planilha(s) com os registros do mesmo jeito: corpo (blocos) próprio
// de cada registro, valores e imagens em ALTA definição (reenviadas ao R2).
//
// Como funciona o "round-trip": o dados.json guarda, por registro, o corpo, os valores
// crus e um MAPA key-antiga -> caminho-da-imagem-no-zip. Ao recriar, damos a cada
// registro seu próprio corpo (preservando os ids -> os valores continuam batendo),
// subimos as fotos de novo (ganhando keys novas) e trocamos as keys antigas pelas
// novas dentro dos valores.
import type JSZipTipo from 'jszip';
import type { JSZipObject } from 'jszip';
import type { Campo } from '../../../shared/tipos';
import { api } from '../api/cliente';
import { enviarFoto } from '../imagens/enviar';

// Lançado quando o .zip não é um backup (não tem dados.json nem integracao.json).
// O chamador cai para o importador de TEXTO nesse caso.
export class NaoEhBackup extends Error {
  constructor() {
    super('o arquivo não é um backup (sem dados.json)');
    this.name = 'NaoEhBackup';
  }
}

interface RegistroBackup {
  id: string;
  criadoEm?: string;
  atualizadoEm?: string;
  campos?: Campo[] | null;
  valores?: Record<string, unknown>;
  imagens?: Record<string, string>;
}

interface DadosBackup {
  colecao: { id?: string; nome: string; campos: Campo[] };
  registros: RegistroBackup[];
}

interface MetaIntegracao {
  nome: string;
  membros: { nome: string; id?: string; pasta: string }[];
}

export interface ProgressoImportBackup {
  fase: 'lendo' | 'criando' | 'registros' | 'imagens';
  feito: number;
  total: number;
  planilha?: string;
}

export interface ResultadoImportBackup {
  tipo: 'colecao' | 'integracao';
  colecaoId?: string;
  integracaoId?: string;
  nome: string;
  planilhas: number;
  registros: number;
  imagens: number;
  faltaram: number;
}

// Substitui (ou remove) as keys de imagem DENTRO dos valores. `mapa` cobre TODAS as
// keys originais do registro: valor = key nova (mantém) ou null (descarta do array).
// Strings de texto normais nunca entram no mapa, então passam intactas.
function remapValores(v: unknown, mapa: Record<string, string | null>): unknown {
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (const item of v) {
      if (typeof item === 'string' && Object.prototype.hasOwnProperty.call(mapa, item)) {
        const nova = mapa[item];
        if (nova !== null && nova !== undefined && nova !== '') out.push(nova);
      } else {
        out.push(remapValores(item, mapa));
      }
    }
    return out;
  }
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = remapValores(val, mapa);
    }
    return out;
  }
  return v;
}

function extDe(key: string): string {
  const m = /\.(\w+)$/.exec(key);
  return (m?.[1] ?? 'jpg').toLowerCase();
}
function mimeDe(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

// Cria UMA coleção a partir de um dados.json + as imagens do zip. `prefixo` é o caminho
// até a pasta que contém o dados.json (ex.: "backup-x/" ou "backup-unido-x/01 - Y/").
async function criarColecaoDeDados(
  zip: JSZipTipo,
  prefixo: string,
  dados: DadosBackup,
  aoProgredir?: (p: ProgressoImportBackup) => void,
): Promise<{ colecaoId: string; registros: number; imagens: number; faltaram: number }> {
  const nomeColecao = dados.colecao?.nome ?? 'Planilha importada';
  const camposColecao = Array.isArray(dados.colecao?.campos) ? dados.colecao.campos : [];
  const registros = Array.isArray(dados.registros) ? dados.registros : [];

  const nova = await api.criarColecao(nomeColecao);

  // Cria do mais ANTIGO para o mais NOVO: como a lista é por `ordem` desc (mais novo no
  // topo), assim a ordem final fica igual à do backup.
  const lista = [...registros].reverse();
  const total = lista.length;
  let feito = 0;
  let imagensOk = 0;
  let faltaram = 0;

  for (const r of lista) {
    try {
      const corpo =
        Array.isArray(r.campos) && r.campos.length > 0 ? r.campos : camposColecao;
      const imagens = r.imagens ?? {};
      const valoresBase = (r.valores ?? {}) as Record<string, unknown>;

      // 1) cria com as imagens ZERADAS (as keys antigas não valem no registro novo).
      const mapaZerado: Record<string, string | null> = {};
      for (const k of Object.keys(imagens)) mapaZerado[k] = null;
      const valoresVazio = remapValores(valoresBase, mapaZerado) as Record<string, unknown>;

      let novo;
      try {
        novo = await api.criarRegistro(
          nova.id,
          valoresVazio,
          corpo.length > 0 ? (corpo as Campo[]) : undefined,
        );
      } catch {
        // fallback: sem corpo próprio (ao menos cria o registro).
        novo = await api.criarRegistro(nova.id, {});
      }

      // 2) reenvia as fotos e monta o mapa key-antiga -> key-nova.
      const mapaReal: Record<string, string | null> = {};
      for (const [oldKey, rel] of Object.entries(imagens)) {
        if (rel === '' || rel === undefined) {
          mapaReal[oldKey] = null;
          faltaram += 1;
          continue;
        }
        const entry = zip.file(prefixo + rel) ?? zip.file(rel);
        if (entry === null) {
          mapaReal[oldKey] = null;
          faltaram += 1;
          continue;
        }
        try {
          const blob = await entry.async('blob');
          const ext = extDe(oldKey);
          const file = new File([blob], `foto.${ext}`, { type: blob.type || mimeDe(ext) });
          mapaReal[oldKey] = await enviarFoto(novo.id, file);
          imagensOk += 1;
          aoProgredir?.({ fase: 'imagens', feito: imagensOk, total: imagensOk, planilha: nomeColecao });
        } catch {
          mapaReal[oldKey] = null;
          faltaram += 1;
        }
      }

      // 3) aplica os valores finais (com as keys novas nas posições certas).
      if (Object.keys(imagens).length > 0) {
        const valoresFinais = remapValores(valoresBase, mapaReal) as Record<string, unknown>;
        try {
          await api.editarRegistro(novo.id, valoresFinais);
        } catch {
          /* mantém o registro com o que já subiu */
        }
      }
    } catch {
      /* pula registro problemático e segue com os demais */
    }
    feito += 1;
    aoProgredir?.({ fase: 'registros', feito, total, planilha: nomeColecao });
  }

  return { colecaoId: nova.id, registros: total, imagens: imagensOk, faltaram };
}

// Acha o dados.json mais raso do zip (o de uma coleção simples).
function acharDadosJson(zip: JSZipTipo): { entry: JSZipObject; prefixo: string } | null {
  let achado: { entry: JSZipObject; prefixo: string } | null = null;
  let menorProf = Infinity;
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    if (path === 'dados.json' || path.endsWith('/dados.json')) {
      const prof = path.split('/').length;
      if (prof < menorProf) {
        menorProf = prof;
        achado = { entry, prefixo: path.slice(0, path.length - 'dados.json'.length) };
      }
    }
  });
  return achado;
}

function acharIntegracaoJson(zip: JSZipTipo): { entry: JSZipObject; prefixo: string } | null {
  let achado: { entry: JSZipObject; prefixo: string } | null = null;
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    if (path === 'integracao.json' || path.endsWith('/integracao.json')) {
      achado = { entry, prefixo: path.slice(0, path.length - 'integracao.json'.length) };
    }
  });
  return achado;
}

// Detecta e importa um backup. Lança NaoEhBackup se não houver dados.json/integracao.json.
export async function importarArquivoBackup(
  arquivo: File,
  aoProgredir?: (p: ProgressoImportBackup) => void,
): Promise<ResultadoImportBackup> {
  const { default: JSZip } = await import('jszip');
  aoProgredir?.({ fase: 'lendo', feito: 0, total: 0 });
  const zip = await JSZip.loadAsync(arquivo);

  // Planilha UNIDA (integração)?
  const integ = acharIntegracaoJson(zip);
  if (integ !== null) {
    const meta = JSON.parse(await integ.entry.async('string')) as MetaIntegracao;
    const novasIds: string[] = [];
    let regs = 0;
    let imgs = 0;
    let falt = 0;
    for (const m of meta.membros ?? []) {
      const prefMembro = `${integ.prefixo}${m.pasta}/`;
      const dadosEntry = zip.file(`${prefMembro}dados.json`);
      if (dadosEntry === null) continue;
      const dados = JSON.parse(await dadosEntry.async('string')) as DadosBackup;
      aoProgredir?.({ fase: 'criando', feito: 0, total: 0, planilha: dados.colecao?.nome });
      const res = await criarColecaoDeDados(zip, prefMembro, dados, aoProgredir);
      novasIds.push(res.colecaoId);
      regs += res.registros;
      imgs += res.imagens;
      falt += res.faltaram;
    }
    let integracaoId: string | undefined;
    if (novasIds.length > 0) {
      try {
        const criada = await api.criarIntegracao({
          nome: meta.nome ?? 'Planilha unida',
          colecaoIds: novasIds,
          ativo: true,
        });
        integracaoId = criada.id;
      } catch {
        /* se a união falhar, ao menos as planilhas ficaram criadas */
      }
    }
    return {
      tipo: 'integracao',
      integracaoId,
      nome: meta.nome ?? 'Planilha unida',
      planilhas: novasIds.length,
      registros: regs,
      imagens: imgs,
      faltaram: falt,
    };
  }

  // Coleção simples.
  const loc = acharDadosJson(zip);
  if (loc === null) throw new NaoEhBackup();
  const dados = JSON.parse(await loc.entry.async('string')) as DadosBackup;
  aoProgredir?.({ fase: 'criando', feito: 0, total: 0, planilha: dados.colecao?.nome });
  const res = await criarColecaoDeDados(zip, loc.prefixo, dados, aoProgredir);
  return {
    tipo: 'colecao',
    colecaoId: res.colecaoId,
    nome: dados.colecao?.nome ?? 'Planilha importada',
    planilhas: 1,
    registros: res.registros,
    imagens: res.imagens,
    faltaram: res.faltaram,
  };
}
