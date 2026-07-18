import { useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ImageOff } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Colecao, Registro } from '../../../shared/tipos';
import { CampoValor } from './CampoValor';
import {
  campoTituloDoRegistro,
  capaDoRegistro,
  formatarValor,
  textoDe,
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

export function Tabela({ colecao, registros, aoAtualizar, aoAbrirFicha }: Props): JSX.Element {
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [rascunho, setRascunho] = useState<unknown>(undefined);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [rascunhoTitulo, setRascunhoTitulo] = useState('');
  const [salvandoTitulo, setSalvandoTitulo] = useState(false);
  const [erroTitulo, setErroTitulo] = useState<string | null>(null);
  const temImagem = colecao.campos.some((c) => c.tipo === 'imagem');
  const campoTitulo = campoTituloDoRegistro(colecao.campos);

  function iniciar(r: Registro, c: Campo): void {
    setRenomeandoId(null);
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

  function iniciarRenomear(r: Registro): void {
    if (campoTitulo === undefined) return;
    setEdicao(null);
    setRenomeandoId(r.id);
    setRascunhoTitulo(textoDe(r.valores[campoTitulo.id]));
    setErroTitulo(null);
  }

  function cancelarRenomear(): void {
    setRenomeandoId(null);
    setErroTitulo(null);
  }

  async function salvarTitulo(r: Registro): Promise<void> {
    if (campoTitulo === undefined || renomeandoId !== r.id || salvandoTitulo) return;
    const atual = textoDe(r.valores[campoTitulo.id]);
    const novo = rascunhoTitulo.trim();
    if (novo === atual.trim()) {
      setRenomeandoId(null);
      return;
    }
    setSalvandoTitulo(true);
    setErroTitulo(null);
    try {
      const atualizado = await api.editarRegistro(r.id, { [campoTitulo.id]: novo });
      aoAtualizar(atualizado);
      setRenomeandoId(null);
    } catch (e) {
      setErroTitulo(e instanceof ErroApi ? e.message : 'não foi possível renomear');
    } finally {
      setSalvandoTitulo(false);
    }
  }

  function aoTeclarTitulo(e: ReactKeyboardEvent<HTMLInputElement>, r: Registro): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void salvarTitulo(r);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelarRenomear();
    }
  }

  return (
    <div className="tabela-envolto">
      <table className="tabela">
        <thead>
          <tr>
            {temImagem && <th aria-label="Foto" />}
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
            const renomeando = renomeandoId === r.id;
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
                          style={{ width: 72, height: 72 }}
                          src={urlMini(capa)}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className="capa capa--vazia" style={{ width: 72, height: 72 }}>
                          <ImageOff size={22} />
                        </span>
                      )}
                    </button>
                  </td>
                )}
                <td className="celula-titulo">
                  {renomeando ? (
                    <div className="tabela-renomear">
                      <input
                        className="campo__controle tabela-renomear__input"
                        value={rascunhoTitulo}
                        autoFocus
                        aria-label="Nome do registro"
                        placeholder="Nome do registro"
                        disabled={salvandoTitulo}
                        onChange={(e) => setRascunhoTitulo(e.target.value)}
                        onKeyDown={(e) => aoTeclarTitulo(e, r)}
                      />
                      <div className="tabela-renomear__acoes">
                        <button
                          type="button"
                          className="lista-item__salvar"
                          disabled={salvandoTitulo}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void salvarTitulo(r)}
                        >
                          {salvandoTitulo ? 'Salvando…' : 'Salvar'}
                        </button>
                        <button
                          type="button"
                          className="lista-item__cancelar"
                          disabled={salvandoTitulo}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={cancelarRenomear}
                        >
                          Cancelar
                        </button>
                      </div>
                      {erroTitulo !== null && <p className="aviso-erro">{erroTitulo}</p>}
                    </div>
                  ) : (
                    <div className="tabela-titulo-bloco">
                      <button
                        type="button"
                        className="tabela-titulo"
                        onClick={() => aoAbrirFicha(r)}
                      >
                        {titulo}
                      </button>
                      {campoTitulo !== undefined && (
                        <button
                          type="button"
                          className="tabela-renomear-btn"
                          onClick={() => iniciarRenomear(r)}
                        >
                          Renomear
                        </button>
                      )}
                    </div>
                  )}
                </td>
                {colecao.campos.map((c) => {
                  const editando = edicao?.rid === r.id && edicao.cid === c.id;
                  if (c.tipo === 'imagem') {
                    return (
                      <td key={c.id} className="celula-editavel" onClick={() => aoAbrirFicha(r)}>
                        <span className="etiqueta">
                          {`${(r.valores[c.id] as unknown[] | undefined)?.length ?? 0} foto(s)`}
                        </span>
                      </td>
                    );
                  }
                  if (c.tipo === 'secao') {
                    return (
                      <td key={c.id} className="celula-editavel" onClick={() => aoAbrirFicha(r)}>
                        <span className="etiqueta">
                          {formatarValor(c, r.valores[c.id]) || '— linhas'}
                        </span>
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
