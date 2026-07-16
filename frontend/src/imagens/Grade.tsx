import { useRef, useState, type ChangeEvent } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react';
import type { Campo } from '../../../shared/tipos';
import { enviarFoto } from './enviar';
import { urlMini } from './urls';
import { Visor } from './Visor';
import './imagens.css';

interface Props {
  registroId: string;
  campo: Campo;
  keys: string[];
  aoMudar: (keys: string[]) => void;
}

export function Grade({ registroId, campo, keys, aoMudar }: Props): JSX.Element {
  const max = campo.config.maxFotos ?? 1;
  const unica = max === 1;
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [visorEm, setVisorEm] = useState<number | null>(null);

  async function aoEscolher(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const escolhidos = Array.from(e.target.files ?? []);
    e.target.value = ''; // permite reescolher o mesmo arquivo
    if (escolhidos.length === 0) return;
    const vagas = max - keys.length;
    const lote = escolhidos.slice(0, Math.max(0, vagas));
    if (lote.length === 0) return;

    setEnviando(true);
    setErro(null);
    const novas: string[] = [];
    try {
      for (const file of lote) {
        novas.push(await enviarFoto(registroId, file));
      }
      aoMudar([...keys, ...novas]);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'falha no envio');
      if (novas.length > 0) aoMudar([...keys, ...novas]);
    } finally {
      setEnviando(false);
    }
  }

  function remover(i: number): void {
    aoMudar(keys.filter((_, idx) => idx !== i));
  }

  function mover(i: number, dir: -1 | 1): void {
    const j = i + dir;
    if (j < 0 || j >= keys.length) return;
    const copia = [...keys];
    const a = copia[i];
    const b = copia[j];
    if (a === undefined || b === undefined) return;
    copia[i] = b;
    copia[j] = a;
    aoMudar(copia);
  }

  const podeAdicionar = keys.length < max;

  return (
    <>
      <div className="grade-fotos">
        {keys.map((k, i) => (
          <div key={k} className={`grade-foto${unica ? ' grade-foto--unica' : ''}`}>
            <img
              className="grade-foto__img"
              src={urlMini(k)}
              alt={`Foto ${i + 1}`}
              loading="lazy"
              onClick={() => setVisorEm(i)}
            />
            <button
              type="button"
              className="grade-foto__x"
              aria-label={`Remover foto ${i + 1}`}
              onClick={() => remover(i)}
            >
              <X size={14} />
            </button>
            {!unica && keys.length > 1 && (
              <div className="grade-foto__mover">
                <button
                  type="button"
                  aria-label="Mover para a esquerda"
                  disabled={i === 0}
                  onClick={() => mover(i, -1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Mover para a direita"
                  disabled={i === keys.length - 1}
                  onClick={() => mover(i, 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        ))}

        {podeAdicionar && (
          <button
            type="button"
            className={`grade-add${unica ? ' grade-add--unica' : ''}`}
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
          >
            {enviando ? (
              <span className="carregando__giro" style={{ borderTopColor: 'var(--fita)' }} />
            ) : (
              <>
                <ImagePlus size={22} />
                <span>Adicionar</span>
              </>
            )}
          </button>
        )}
      </div>

      {erro !== null && <p className="aviso-erro">{erro}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={!unica}
        hidden
        onChange={(e) => void aoEscolher(e)}
      />

      {visorEm !== null && (
        <Visor keys={keys} indiceInicial={visorEm} aoFechar={() => setVisorEm(null)} />
      )}
    </>
  );
}
