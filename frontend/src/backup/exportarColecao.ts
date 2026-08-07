// Backup local (só o dono usa): baixa TODOS os registros de uma planilha num .zip
// com as imagens em ALTA DEFINIÇÃO (a "cheia" do R2, sem reduzir), organizadas por
// registro e nomeadas com a referência + cor, além de um texto legível por registro
// e um dados.json estruturado — para que, se as imagens se perderem de novo, dê para
// reconstruir tudo a partir do arquivo baixado.

import type { Campo, Colecao, Registro } from '../../../shared/tipos';
import { api } from '../api/cliente';
import { urlCheia } from '../imagens/urls';
import {
  camposDoRegistro,
  formatarValor,
  keysDoCampo,
  tituloDoRegistro,
} from '../preencher/derivarResumo';
import { linhasDe } from '../preencher/SecaoEditor';

const PAGINA = 20;

export interface ProgressoExport {
  fase: 'carregando' | 'imagens' | 'compactando' | 'pronto';
  feito: number;
  total: number;
}

// Uma imagem a exportar, com o rótulo (bloco de origem) para nomear o arquivo.
interface ImagemItem {
  key: string;
  rotulo: string;
}

// Carrega TODOS os registros paginando por cursor (criado_em) até o fim.
async function carregarTodos(colecaoId: string): Promise<Registro[]> {
  const acc: Registro[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 1000; i += 1) {
    const pagina = await api.listarRegistros(colecaoId, cursor);
    acc.push(...pagina);
    if (pagina.length < PAGINA) break;
    const ultimo = pagina[pagina.length - 1];
    if (ultimo === undefined) break;
    cursor = ultimo.criadoEm;
  }
  return acc;
}

// Deixa o texto seguro para nome de pasta/arquivo em qualquer sistema.
function limparNome(s: string, max = 80): string {
  const limpo = s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (limpo === '' ? 'sem-nome' : limpo).slice(0, max);
}

// Extensão da key (jpg por padrão).
function extDe(key: string): string {
  const m = /\.(\w+)$/.exec(key);
  return m?.[1]?.toLowerCase() ?? 'jpg';
}

// Valor de um bloco de texto/número/etc. (imagem/seção tratados à parte).
function nomeSugereCor(nome: string): boolean {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .includes('cor');
}

// Tenta achar a "cor" do registro (1º bloco de texto/seleção cujo nome tem "cor").
function corDoRegistro(campos: Campo[], registro: Registro): string {
  for (const c of campos) {
    if ((c.tipo === 'texto' || c.tipo === 'selecao' || c.tipo === 'paragrafo') && nomeSugereCor(c.nome)) {
      const v = formatarValor(c, registro.valores[c.id]).trim();
      if (v !== '') return v;
    }
    if (c.tipo === 'secao') {
      const sub = (c.config.subcampos ?? []).find((s) => nomeSugereCor(s.nome) && s.tipo !== 'imagem');
      if (sub !== undefined) {
        for (const linha of linhasDe(registro.valores[c.id])) {
          const v = formatarValor({ tipo: sub.tipo, config: sub.config }, linha[sub.id]).trim();
          if (v !== '') return v;
        }
      }
    }
  }
  return '';
}

// Todas as imagens de um registro, com um rótulo do bloco de origem (para o nome
// do arquivo): blocos de imagem de topo e subcampos-imagem dentro de seções.
function imagensDoRegistro(campos: Campo[], registro: Registro): ImagemItem[] {
  const itens: ImagemItem[] = [];
  for (const c of campos) {
    if (c.tipo === 'imagem') {
      keysDoCampo(registro, c.id).forEach((key) => itens.push({ key, rotulo: c.nome }));
      continue;
    }
    if (c.tipo === 'secao') {
      const subsImg = (c.config.subcampos ?? []).filter((s) => s.tipo === 'imagem');
      linhasDe(registro.valores[c.id]).forEach((linha, li) => {
        for (const s of subsImg) {
          const v = linha[s.id];
          if (!Array.isArray(v)) continue;
          for (const k of v) {
            if (typeof k === 'string') itens.push({ key: k, rotulo: `${c.nome} L${li + 1} ${s.nome}` });
          }
        }
      });
    }
  }
  return itens;
}

// Texto legível de um registro (todas as informações, na ordem dos blocos).
function textoDoRegistro(colecao: Colecao, campos: Campo[], registro: Registro): string {
  const ref = tituloDoRegistro(campos, registro);
  const linhas: string[] = [];
  linhas.push(`Referência: ${ref}`);
  linhas.push(`Planilha: ${colecao.nome}`);
  linhas.push(`Registro ID: ${registro.id}`);
  linhas.push(`Criado em: ${registro.criadoEm}`);
  linhas.push('');

  for (const c of campos) {
    if (c.tipo === 'imagem') {
      const n = keysDoCampo(registro, c.id).length;
      linhas.push(`${c.nome}: ${n} foto(s) [ver imagens na pasta]`);
      continue;
    }
    if (c.tipo === 'secao') {
      const subsTxt = (c.config.subcampos ?? []).filter((s) => s.tipo !== 'imagem');
      const subsImg = (c.config.subcampos ?? []).filter((s) => s.tipo === 'imagem');
      const rows = linhasDe(registro.valores[c.id]);
      linhas.push(`${c.nome}:`);
      if (rows.length === 0) {
        linhas.push('  (vazio)');
      }
      rows.forEach((linha, i) => {
        const celTxt = subsTxt
          .map((s) => {
            const v = formatarValor({ tipo: s.tipo, config: s.config }, linha[s.id]).trim();
            return v === '' ? '' : `${s.nome}: ${v}`;
          })
          .filter((x) => x !== '');
        let fotos = 0;
        for (const s of subsImg) {
          const v = linha[s.id];
          if (Array.isArray(v)) fotos += v.filter((k) => typeof k === 'string').length;
        }
        const extras = [...celTxt];
        if (fotos > 0) extras.push(`${fotos} foto(s)`);
        linhas.push(`  #${i + 1} ${extras.join(' · ')}`);
      });
      continue;
    }
    const v = formatarValor(c, registro.valores[c.id]).trim();
    linhas.push(`${c.nome}: ${v}`);
  }
  return linhas.join('\r\n');
}

async function baixarImagem(key: string): Promise<Blob | null> {
  try {
    const resp = await fetch(urlCheia(key), { mode: 'cors' });
    if (!resp.ok) return null;
    return await resp.blob();
  } catch {
    return null;
  }
}

function dispararDownload(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoga depois de um tempo (Safari precisa do URL vivo durante o clique).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Exporta a planilha inteira num .zip. `aoProgredir` recebe o andamento para a UI.
export async function exportarColecao(
  colecao: Colecao,
  aoProgredir: (p: ProgressoExport) => void,
): Promise<{ registros: number; imagens: number; faltaram: number }> {
  // JSZip carregado sob demanda (só quando o dono clica) para não pesar o bundle.
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const raiz = zip.folder(`backup-${limparNome(colecao.nome, 40)}`) ?? zip;

  aoProgredir({ fase: 'carregando', feito: 0, total: 0 });
  const registros = await carregarTodos(colecao.id);

  // dados.json estruturado (para reimportação futura): estrutura + valores crus.
  raiz.file(
    'dados.json',
    JSON.stringify(
      {
        exportadoEm: new Date().toISOString(),
        colecao: { id: colecao.id, nome: colecao.nome, campos: colecao.campos },
        registros: registros.map((r) => ({
          id: r.id,
          criadoEm: r.criadoEm,
          atualizadoEm: r.atualizadoEm,
          campos: Array.isArray(r.campos) ? r.campos : null,
          valores: r.valores,
        })),
      },
      null,
      2,
    ),
  );

  // Planeja todas as imagens (para ter um total de progresso).
  interface Plano {
    registro: Registro;
    campos: Campo[];
    pasta: string;
    ref: string;
    imagens: ImagemItem[];
  }
  const planos: Plano[] = registros.map((r, i) => {
    const campos = camposDoRegistro(colecao, r);
    const ref = tituloDoRegistro(campos, r);
    const cor = corDoRegistro(campos, r);
    const nomePasta = `${String(i + 1).padStart(3, '0')} - ${limparNome(cor === '' ? ref : `${ref} - ${cor}`)}`;
    return { registro: r, campos, pasta: nomePasta, ref, imagens: imagensDoRegistro(campos, r) };
  });
  const totalImagens = planos.reduce((n, p) => n + p.imagens.length, 0);

  const faltaram: string[] = [];
  let feito = 0;
  aoProgredir({ fase: 'imagens', feito, total: totalImagens });

  for (const p of planos) {
    const pasta = raiz.folder(p.pasta) ?? raiz;
    // Texto legível com TODAS as informações do registro.
    pasta.file('informacoes.txt', textoDoRegistro(colecao, p.campos, p.registro));

    const cor = corDoRegistro(p.campos, p.registro);
    const baseNome = limparNome(cor === '' ? p.ref : `${p.ref} - ${cor}`, 60);
    let n = 0;
    for (const img of p.imagens) {
      n += 1;
      const blob = await baixarImagem(img.key);
      if (blob === null) {
        faltaram.push(`${p.pasta} :: ${img.rotulo} :: ${img.key}`);
      } else {
        const nome = `${String(n).padStart(2, '0')} - ${baseNome} - ${limparNome(img.rotulo, 40)}.${extDe(img.key)}`;
        pasta.file(nome, blob);
      }
      feito += 1;
      aoProgredir({ fase: 'imagens', feito, total: totalImagens });
    }
  }

  if (faltaram.length > 0) {
    raiz.file(
      '_imagens-que-faltaram.txt',
      [
        'Estas imagens não puderam ser baixadas (a foto não está mais no armazenamento).',
        'O texto/JSON do registro foi preservado mesmo assim.',
        '',
        ...faltaram,
      ].join('\r\n'),
    );
  }

  raiz.file(
    'LEIA-ME.txt',
    [
      `Backup da planilha "${colecao.nome}"`,
      `Gerado em ${new Date().toLocaleString('pt-BR')}`,
      '',
      `Registros: ${registros.length}`,
      `Imagens salvas: ${totalImagens - faltaram.length} de ${totalImagens}`,
      '',
      'Como está organizado:',
      '- Uma pasta por registro (numerada, com a referência e a cor no nome).',
      '- Dentro de cada pasta: as imagens em alta definição + "informacoes.txt" com todos os dados.',
      '- "dados.json" na raiz tem tudo estruturado, para reimportar no futuro.',
    ].join('\r\n'),
  );

  aoProgredir({ fase: 'compactando', feito: totalImagens, total: totalImagens });
  const blob = await zip.generateAsync({ type: 'blob' });
  const dia = new Date().toISOString().slice(0, 10);
  dispararDownload(blob, `backup-${limparNome(colecao.nome, 40)}-${dia}.zip`);

  aoProgredir({ fase: 'pronto', feito: totalImagens, total: totalImagens });
  return { registros: registros.length, imagens: totalImagens - faltaram.length, faltaram: faltaram.length };
}
