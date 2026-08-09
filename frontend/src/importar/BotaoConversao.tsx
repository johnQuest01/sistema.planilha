import { useMemo, useRef, useState } from 'react';
import { Camera, Images, Sparkles, Undo2 } from 'lucide-react';
import type { Colecao, Registro } from '../../../shared/tipos';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import { FolhaInferior } from '../ui/FolhaInferior';
import { ehArquivoImagem, importarNaColecao, resumoRelatorio, type ProgressoImport } from './importarFotos';
import './importar.css';

const MAX = 200;

interface FotoAtribuida {
  url: string; // object URL (miniatura)
  file: File; // já renomeado como "<ref>.jpg"
  ref: string;
}

interface Props {
  colecao: Colecao;
  aoConcluir: (atualizados: Registro[]) => void;
}

// "Conversão": o usuário lista as referências (na ordem em que vai fotografar) e vai
// tirando 1 foto por referência. Cada foto é renomeada AUTOMATICAMENTE com a próxima
// referência ("4043.jpg", "4809.jpg", ...). Ao tocar em Aplicar, as fotos entram no
// bloco de referência do registro certo (mesma lógica do "Importar fotos").
export function BotaoConversao({ colecao, aoConcluir }: Props): JSX.Element {
  const [aberto, setAberto] = useState(false);
  const [refsTexto, setRefsTexto] = useState('');
  const [fotos, setFotos] = useState<FotoAtribuida[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoImport | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const refs = useMemo(
    () => refsTexto.split(/[\s,;]+/).map((r) => r.trim()).filter((r) => r !== ''),
    [refsTexto],
  );
  const proxima = fotos.length < refs.length ? (refs[fotos.length] ?? null) : null;

  function limparFotos(lista: FotoAtribuida[]): void {
    lista.forEach((f) => URL.revokeObjectURL(f.url));
  }

  function fechar(): void {
    if (ocupado) return;
    limparFotos(fotos);
    setAberto(false);
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
    if (fotos.length === 0 || ocupado) return;
    setOcupado(true);
    setResumo(null);
    setErro(null);
    setProgresso({ feito: 0, total: fotos.length });
    try {
      const r = await importarNaColecao(colecao, fotos.map((f) => f.file), setProgresso);
      aoConcluir(r.atualizados);
      setResumo(resumoRelatorio(r.relatorio));
      limparFotos(fotos);
      setFotos([]);
    } catch {
      setErro('Não foi possível aplicar as fotos. Tente novamente.');
    } finally {
      setOcupado(false);
      setProgresso(null);
    }
  }

  return (
    <>
      <Botao variante="padrao" onClick={() => setAberto(true)}>
        <Camera size={18} /> Conversão
      </Botao>
      {aberto && (
        <FolhaInferior titulo="Conversão — 1 foto por referência" onFechar={fechar}>
          <div className="importar-zip">
            <p className="importar-zip__ajuda">
              Escreva as <strong>referências existentes</strong> na ordem em que vai fotografar.
              Depois tire <strong>uma foto por referência</strong>: cada foto é renomeada
              automaticamente com a próxima referência. No fim, toque em <strong>Aplicar</strong> —
              as fotos entram no bloco de <strong>referência</strong> do registro certo.
            </p>

            <Campo
              multilinha
              rows={3}
              rotulo="Referências (na ordem)"
              placeholder="4043 4809 4808 4805 4814 4811 4813 4810 4816 4812 4817 4807 4815"
              value={refsTexto}
              onChange={(e) => setRefsTexto(e.target.value)}
              disabled={ocupado || fotos.length > 0}
            />

            {refs.length > 0 && (
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
                disabled={ocupado || proxima === null}
              >
                <Camera size={18} />
                {proxima !== null ? `Tirar foto — ${proxima}` : 'Concluído'}
              </Botao>
              <Botao
                variante="padrao"
                onClick={() => galeriaRef.current?.click()}
                disabled={ocupado || proxima === null}
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

            <Botao variante="primario" onClick={() => void aplicar()} disabled={ocupado || fotos.length === 0}>
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
