import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { api } from '../api/cliente';
import type { Campo, Colecao, Registro } from '../../../shared/tipos';
import { CampoValor } from './CampoValor';
import {
  capaDoRegistro,
  formatarValor,
  keysDeImagensDoCampo,
  tituloDoRegistro,
} from './derivarResumo';
import { urlMini } from '../imagens/urls';
import './preencher.css';

interface Props {
  colecao: Colecao;
  registros: Registro[];
  aoAtualizar: (r: Registro) => void;
  aoAbrirFicha: (r: Registro) => void;
}

interface Edicao {
  rid: string;
  cid: string;
}

function MiniFotos({
  keys,
  aoAbrir,
}: {
  keys: string[];
  aoAbrir: () => void;
}): JSX.Element {
  if (keys.length === 0) {
    return (
      <button type="button" className="tabela-fotos tabela-fotos--vazia" onClick={aoAbrir}>
        <ImageOff size={18} />
        <span>sem foto</span>
      </button>
    );
  }
  return (
    <button type="button" className="tabela-fotos" onClick={aoAbrir} aria-label="Abrir registro">
      {keys.map((k) => (
        <img key={k} className="tabela-fotos__img" src={urlMini(k)} alt="" loading="lazy" />
      ))}
    </button>
  );
}

export function Tabela({ colecao, registros, aoAtualizar, aoAbrirFicha }: Props): JSX.Element {
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [rascunho, setRascunho] = useState<unknown>(undefined);
  const temImagem = colecao.campos.some(
    (c) =>
      c.tipo === 'imagem' ||
      (c.tipo === 'secao' && (c.config.subcampos ?? []).some((s) => s.tipo === 'imagem')),
  );

  function iniciar(r: Registro, c: Campo): void {
    setEdicao({ rid: r.id, cid: c.id });
    setRascunho(r.valores[c.id]);
  }

  async function comitar(): Promise<void> {
    if (edicao === null) return;
    const { rid, cid } = edicao;
    setEdicao(null);
    try {
      const atualizado = await api.editarRegistro(rid, { [cid]: rascunho });
      aoAtualizar(atualizado);
    } catch {
      /* silencioso */
    }
  }

  return (
    <div className="tabela-envolto">
      <table className="tabela">
        <thead>
          <tr>
            {temImagem && <th aria-label="Capa" />}
            <th>Título</th>
            {colecao.campos.map((c) => (
              <th key={c.id}>{c.nome}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => {
            const capa = capaDoRegistro(colecao.campos, r);
            const titulo = tituloDoRegistro(colecao.campos, r);
            return (
              <tr key={r.id}>
                {temImagem && (
                  <td>
                    <button
                      type="button"
                      className="btn btn--icone"
                      style={{ padding: 0 }}
                      aria-label="Abrir ficha"
                      onClick={() => aoAbrirFicha(r)}
                    >
                      {capa !== null ? (
                        <img
                          className="capa"
                          style={{ width: 56, height: 56 }}
                          src={urlMini(capa)}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className="capa capa--vazia" style={{ width: 56, height: 56 }}>
                          <ImageOff size={20} />
                        </span>
                      )}
                    </button>
                  </td>
                )}
                <td className="celula-titulo" onClick={() => aoAbrirFicha(r)}>
                  <button type="button" className="tabela-titulo">
                    {titulo}
                  </button>
                </td>
                {colecao.campos.map((c) => {
                  const editando = edicao?.rid === r.id && edicao.cid === c.id;
                  if (c.tipo === 'imagem') {
                    return (
                      <td key={c.id}>
                        <MiniFotos
                          keys={keysDeImagensDoCampo(c, r)}
                          aoAbrir={() => aoAbrirFicha(r)}
                        />
                      </td>
                    );
                  }
                  if (c.tipo === 'secao') {
                    const fotos = keysDeImagensDoCampo(c, r);
                    const resumo = formatarValor(c, r.valores[c.id]) || '— linhas';
                    return (
                      <td key={c.id}>
                        {fotos.length > 0 ? (
                          <div className="tabela-secao-celula">
                            <MiniFotos keys={fotos} aoAbrir={() => aoAbrirFicha(r)} />
                            <button
                              type="button"
                              className="etiqueta tabela-secao-celula__resumo"
                              onClick={() => aoAbrirFicha(r)}
                            >
                              {resumo}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="etiqueta tabela-secao-celula__resumo"
                            onClick={() => aoAbrirFicha(r)}
                          >
                            {resumo}
                          </button>
                        )}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={c.id}
                      className="celula-editavel"
                      onClick={() => {
                        if (!editando) iniciar(r, c);
                      }}
                    >
                      {editando ? (
                        <CampoValor
                          campo={c}
                          valor={rascunho}
                          aoMudar={setRascunho}
                          aoConfirmar={() => void comitar()}
                          aoSairFoco={() => void comitar()}
                          autoFoco
                        />
                      ) : (
                        formatarValor(c, r.valores[c.id]) || '—'
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
