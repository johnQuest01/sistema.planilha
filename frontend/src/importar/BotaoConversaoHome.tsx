import { useMemo, useRef, useState } from 'react';
import { Camera, Images, Sparkles, Undo2 } from 'lucide-react';
import { api, ErroApi, type ColecaoResumo } from '../api/cliente';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import { FolhaInferior } from '../ui/FolhaInferior';
import {
  ehArquivoImagem,
  importarNaColecao,
  MAX_FOTOS_LOTE,
  resumoRelatorio,
  type ProgressoImport,
} from './importarFotos';
import './importar.css';

const MAX = MAX_FOTOS_LOTE;

interface FotoAtribuida {
  url: string;
  file: File; // já renomeado "<ref>.jpg"
  ref: string;
}

interface Props {
  colecoes: ColecaoResumo[];
  aoConcluir?: () => void;
}

/**
 * Na Home: mesma lógica da Conversão dentro da planilha (Modelagem etc.).
 * 1) escolhe planilha(s)
 * 2) cola títulos/referências na ordem
 * 3) tira/escolhe 1 foto por referência → renomeia automaticamente
 * 4) Aplicar → encaixa no campo certo
 */
export function BotaoConversaoHome({ colecoes, aoConcluir }: Props): JSX.Element {
  const [aberto, setAberto] = useState(false);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [refsTexto, setRefsTexto] = useState('');
  const [fotos, setFotos] = useState<FotoAtribuida[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoImport | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const ativas = colecoes.filter((c) => !c.arquivada && !c.bloqueada);
  const refs = useMemo(
    () => refsTexto.split(/[\s,;]+/).map((r) => r.trim()).filter((r) => r !== ''),
    [refsTexto],
  );
  const proxima = fotos.length < refs.length ? (refs[fotos.length] ?? null) : null;

  function toggle(id: string): void {
    setEscolhidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function limparFotos(lista: FotoAtribuida[]): void {
    lista.forEach((f) => URL.revokeObjectURL(f.url));
  }

  function fechar(): void {
    if (ocupado) return;
    limparFotos(fotos);
    setAberto(false);
    setEscolhidas(new Set());
    setRefsTexto('');
    setFotos([]);
    setResumo(null);
    setErro(null);
    setProgresso(null);
  }

  function extDe(nome: string): string {
    const ext = (nome.split('.').pop() ?? '').toLowerCase();
    return /^(jpe?g|png|webp)$/.test(ext) ? ext : 'jpg';
  }

  function adicionar(files: FileList | null): void {
    if (escolhidas.size === 0) {
      setErro('escolha ao menos uma planilha');
      return;
    }
    if (refs.length === 0) {
      setErro('coloque as referências (títulos) antes de fotografar');
      return;
    }
    const arr = Array.from(files ?? []).filter(ehArquivoImagem);
    if (arr.length === 0) return;
    setErro(null);
    setResumo(null);
    setFotos((atual) => {
      const out = [...atual];
      for (const orig of arr) {
        if (out.length >= refs.length || out.length >= MAX) break;
        const ref = refs[out.length];
        if (ref === undefined) break;
        const file = new File([orig], `${ref}.${extDe(orig.name)}`, {
          type: orig.type === '' ? 'image/jpeg' : orig.type,
        });
        out.push({ url: URL.createObjectURL(orig), file, ref });
      }
      return out;
    });
    if (cameraRef.current !== null) cameraRef.current.value = '';
    if (galeriaRef.current !== null) galeriaRef.current.value = '';
  }

  function desfazer(): void {
    setFotos((atual) => {
      const out = [...atual];
      const ultima = out.pop();
      if (ultima !== undefined) URL.revokeObjectURL(ultima.url);
      return out;
    });
  }

  async function aplicar(): Promise<void> {
    if (fotos.length === 0 || ocupado || escolhidas.size === 0) return;
    setOcupado(true);
    setResumo(null);
    setErro(null);
    const arquivos = fotos.map((f) => f.file);
    const total = arquivos.length * escolhidas.size;
    setProgresso({ feito: 0, total });
    const partes: string[] = [];
    let feitoGlobal = 0;
    try {
      for (const id of escolhidas) {
        const col = await api.obterColecao(id);
        const r = await importarNaColecao(col, arquivos, (p) => {
          setProgresso({ feito: feitoGlobal + p.feito, total });
        });
        feitoGlobal += arquivos.length;
        partes.push(`${col.nome}: ${resumoRelatorio(r.relatorio)}`);
      }
      setResumo(partes.join(' · '));
      limparFotos(fotos);
      setFotos([]);
      aoConcluir?.();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível aplicar as fotos.');
    } finally {
      setOcupado(false);
      setProgresso(null);
    }
  }

  return (
    <>
      <Botao
        variante="padrao"
        onClick={() => setAberto(true)}
        title="Converter fotos: referências + 1 foto por referência (como na planilha)"
      >
        <Sparkles size={18} />
        Converter fotos
      </Botao>

      {aberto && (
        <FolhaInferior titulo="Conversão — 1 foto por referência" onFechar={fechar}>
          <div className="importar-zip">
            <p className="importar-zip__ajuda">
              Igual à conversão dentro da planilha: escreva as <strong>referências</strong> na
              ordem, tire <strong>uma foto por referência</strong> (renomeia sozinho) e aplique —
              as fotos caem no campo certo.
            </p>

            <p className="importar-zip__ajuda">
              <strong>1. Planilha(s)</strong>
            </p>
            <ul className="importar-lista-colecoes">
              {ativas.map((c) => (
                <li key={c.id}>
                  <label className="importar-check">
                    <input
                      type="checkbox"
                      checked={escolhidas.has(c.id)}
                      onChange={() => toggle(c.id)}
                      disabled={ocupado || fotos.length > 0}
                    />
                    <span>{c.nome}</span>
                  </label>
                </li>
              ))}
            </ul>
            {ativas.length === 0 && (
              <p className="aviso-erro">Nenhuma planilha disponível.</p>
            )}

            <Campo
              multilinha
              rows={3}
              rotulo="2. Referências / títulos (na ordem)"
              placeholder="4043 4809 4808 4805 4814 4811 4813 4810"
              value={refsTexto}
              onChange={(e) => setRefsTexto(e.target.value)}
              disabled={ocupado || fotos.length > 0}
            />

            {refs.length > 0 && escolhidas.size > 0 && (
              <p className="conversao-status">
                {fotos.length}/{refs.length} fotos ·{' '}
                {proxima !== null ? (
                  <>
                    próxima: <strong className="conversao-proxima">{proxima}</strong>
                  </>
                ) : (
                  <strong>todas as referências têm foto ✓</strong>
                )}
              </p>
            )}

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => adicionar(e.target.files)}
            />
            <input
              ref={galeriaRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => adicionar(e.target.files)}
            />

            <div className="conversao-acoes">
              <Botao
                variante="primario"
                onClick={() => cameraRef.current?.click()}
                disabled={ocupado || proxima === null || escolhidas.size === 0}
              >
                <Camera size={18} />
                {proxima !== null ? `Tirar foto — ${proxima}` : 'Concluído'}
              </Botao>
              <Botao
                variante="padrao"
                onClick={() => galeriaRef.current?.click()}
                disabled={ocupado || proxima === null || escolhidas.size === 0}
              >
                <Images size={16} /> Escolher fotos
              </Botao>
              {fotos.length > 0 && (
                <Botao variante="fantasma" onClick={desfazer} disabled={ocupado}>
                  <Undo2 size={16} /> Desfazer
                </Botao>
              )}
            </div>

            {fotos.length > 0 && (
              <div className="conversao-grid">
                {fotos.map((f, i) => (
                  <div key={`${f.ref}:${i}`} className="conversao-item">
                    <img src={f.url} alt={f.ref} loading="lazy" />
                    <span className="conversao-item__ref">{f.ref}</span>
                  </div>
                ))}
              </div>
            )}

            {erro !== null && <p className="aviso-erro">{erro}</p>}
            {resumo !== null && <p className="importar-zip__ajuda">{resumo}</p>}

            <Botao
              variante="primario"
              onClick={() => void aplicar()}
              disabled={ocupado || fotos.length === 0 || escolhidas.size === 0}
            >
              <Sparkles size={18} />
              {ocupado && progresso !== null
                ? `Aplicando ${progresso.feito}/${progresso.total}…`
                : `Aplicar ${fotos.length} foto(s)`}
            </Botao>
          </div>
        </FolhaInferior>
      )}
    </>
  );
}
