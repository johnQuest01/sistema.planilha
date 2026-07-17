import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ErroApi } from '../api/cliente';
import type { Colecao, Registro } from '../../../shared/tipos';
import { campoReferencia } from './derivarResumo';
import { RegistroPreview } from './RegistroPreview';

const DEBOUNCE_MS = 300;

interface Props {
  colecao: Colecao;
  aoAbrir: (r: Registro) => void;
}

export function BuscaReferencia({ colecao, aoAbrir }: Props): JSX.Element {
  const ref = campoReferencia(colecao.campos);
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Registro[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const termo = q.trim();
    if (termo === '' || ref === undefined) {
      setResultados(null);
      setErro(null);
      setBuscando(false);
      return;
    }

    let vivo = true;
    setBuscando(true);
    setErro(null);
    const timer = setTimeout(() => {
      void api
        .buscarRegistros(colecao.id, termo)
        .then((rs) => {
          if (!vivo) return;
          setResultados(rs);
          setBuscando(false);
        })
        .catch((e: unknown) => {
          if (!vivo) return;
          setErro(e instanceof ErroApi ? e.message : 'falha na busca');
          setResultados([]);
          setBuscando(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [q, colecao.id, ref]);

  if (ref === undefined) return <></>;

  const placeholder =
    ref.nome.toLowerCase().includes('referencia') || ref.nome.toLowerCase().includes('referência')
      ? `Buscar por ${ref.nome.toLowerCase()}…`
      : 'Buscar por referência…';

  return (
    <div className="busca-ref">
      <label className="busca-ref__rotulo">
        <Search size={16} aria-hidden />
        <input
          type="search"
          className="busca-ref__input"
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar registro por referência"
        />
        {q !== '' && (
          <button
            type="button"
            className="btn btn--icone busca-ref__limpar"
            aria-label="Limpar busca"
            onClick={() => setQ('')}
          >
            <X size={16} />
          </button>
        )}
      </label>

      {q.trim() !== '' && (
        <div className="busca-ref__resultados" aria-live="polite">
          {buscando && <p className="busca-ref__status">Buscando…</p>}
          {!buscando && erro !== null && <p className="aviso-erro">{erro}</p>}
          {!buscando && erro === null && resultados !== null && resultados.length === 0 && (
            <p className="busca-ref__status">Nenhum registro com essa referência.</p>
          )}
          {!buscando &&
            resultados !== null &&
            resultados.map((r) => (
              <RegistroPreview key={r.id} colecao={colecao} registro={r} aoAbrir={() => aoAbrir(r)} />
            ))}
        </div>
      )}
    </div>
  );
}
