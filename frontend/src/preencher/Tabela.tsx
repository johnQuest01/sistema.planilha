import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { api } from '../api/cliente';
import type { Campo, Colecao, Registro } from '../../../shared/tipos';
import { CampoValor } from './CampoValor';
import { capaDoRegistro, formatarValor } from './derivarResumo';
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

export function Tabela({ colecao, registros, aoAtualizar, aoAbrirFicha }: Props): JSX.Element {
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [rascunho, setRascunho] = useState<unknown>(undefined);
  const temImagem = colecao.campos.some((c) => c.tipo === 'imagem');

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
            {temImagem && <th aria-label="Foto" />}
            {colecao.campos.map((c) => (
              <th key={c.id}>{c.nome}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => {
            const capa = capaDoRegistro(colecao.campos, r);
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
                          style={{ width: 52, height: 52 }}
                          src={urlMini(capa)}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className="capa capa--vazia" style={{ width: 52, height: 52 }}>
                          <ImageOff size={18} />
                        </span>
                      )}
                    </button>
                  </td>
                )}
                {colecao.campos.map((c) => {
                  const editando = edicao?.rid === r.id && edicao.cid === c.id;
                  if (c.tipo === 'imagem') {
                    return (
                      <td key={c.id} className="celula-editavel" onClick={() => aoAbrirFicha(r)}>
                        <span className="etiqueta">{`${(r.valores[c.id] as unknown[] | undefined)?.length ?? 0} foto(s)`}</span>
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
