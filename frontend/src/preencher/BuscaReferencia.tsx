import { ImageOff, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ErroApi } from '../api/cliente';
import type { Colecao, Registro } from '../../../shared/tipos';
import { camposDoRegistro, capaDoRegistro, resumoDoRegistro, tituloDoRegistro } from './derivarResumo';
import { Miniatura } from './Miniatura';

const DEBOUNCE_MS = 300;

interface Props {
  colecao: Colecao;
  // Toque num resultado: abre a PRÉVIA COMPLETA (folha grande com X), igual à lista.
  aoAbrir: (r: Registro) => void;
}

// Busca por referência. Os resultados aparecem como CARDS COMPACTOS (miniatura +
// título + resumo); tocar abre a prévia completa (grande) para ver com precisão e,
// de lá, preencher/alterar/compartilhar.
export function BuscaReferencia({ colecao, aoAbrir }: Props): JSX.Element {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Registro[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const termo = q.trim();
    if (termo === '') {
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
  }, [q, colecao.id]);

  return (
    <div className="busca-ref">
      <label className="busca-ref__rotulo">
        <Search size={16} aria-hidden />
        <input
          type="search"
          className="busca-ref__input"
          placeholder="Buscar em todos os registros (mesmo sem carregar a lista)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar registro"
          autoComplete="off"
          enterKeyHint="search"
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
            <p className="busca-ref__status">Nenhum registro com esses dados.</p>
          )}
          {!buscando &&
            resultados !== null &&
            resultados.map((r) => {
              const campos = camposDoRegistro(colecao, r);
              const capa = capaDoRegistro(campos, r);
              const resumo = resumoDoRegistro(campos, r);
              return (
                <button
                  key={r.id}
                  type="button"
                  className="busca-ref__item"
                  onClick={() => aoAbrir(r)}
                >
                  <span className="busca-ref__item-capa" aria-hidden="true">
                    {capa !== null ? (
                      <Miniatura fotoKey={capa} tamanho={56} />
                    ) : (
                      <ImageOff size={20} />
                    )}
                  </span>
                  <span className="busca-ref__item-corpo">
                    <span className="busca-ref__item-titulo">{tituloDoRegistro(campos, r)}</span>
                    {resumo !== '' && <span className="busca-ref__item-resumo">{resumo}</span>}
                  </span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
