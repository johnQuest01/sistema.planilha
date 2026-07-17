import { useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ImageOff } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Colecao, Registro } from '../../../shared/tipos';
import {
  campoTituloDoRegistro,
  capaDoRegistro,
  resumoDoRegistro,
  temCampoImagem,
  textoDe,
  tituloDoRegistro,
} from './derivarResumo';
import { urlMini } from '../imagens/urls';
import './preencher.css';

interface Props {
  colecao: Colecao;
  registros: Registro[];
  solto: boolean;
  aoAbrir: (r: Registro) => void;
  aoAtualizar: (r: Registro) => void;
}

export function ListaDensa({ colecao, registros, solto, aoAbrir, aoAtualizar }: Props): JSX.Element {
  const comImagem = temCampoImagem(colecao.campos);
  const campoTitulo = campoTituloDoRegistro(colecao.campos);
  const lado = solto ? 72 : 56;
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function iniciarEdicao(r: Registro): void {
    if (campoTitulo === undefined) return;
    setEditandoId(r.id);
    setRascunho(textoDe(r.valores[campoTitulo.id]));
    setErro(null);
  }

  function cancelarEdicao(): void {
    setEditandoId(null);
    setErro(null);
  }

  async function salvarNome(r: Registro): Promise<void> {
    if (campoTitulo === undefined || editandoId !== r.id || salvando) return;
    const atual = textoDe(r.valores[campoTitulo.id]);
    const novo = rascunho.trim();
    if (novo === atual.trim()) {
      setEditandoId(null);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await api.editarRegistro(r.id, { [campoTitulo.id]: novo });
      aoAtualizar(atualizado);
      setEditandoId(null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível salvar o nome');
    } finally {
      setSalvando(false);
    }
  }

  function aoTeclarNome(e: ReactKeyboardEvent<HTMLInputElement>, r: Registro): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void salvarNome(r);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelarEdicao();
    }
  }

  return (
    <div className={`lista${solto ? ' lista--solto' : ''}`}>
      {registros.map((r) => {
        const capa = capaDoRegistro(colecao.campos, r);
        const resumo = resumoDoRegistro(colecao.campos, r);
        const editando = editandoId === r.id;
        const titulo = tituloDoRegistro(colecao.campos, r);
        return (
          <div key={r.id} className="lista-item">
            {comImagem &&
              (capa !== null ? (
                <img
                  className="capa"
                  style={{ width: lado, height: lado }}
                  src={urlMini(capa)}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="capa capa--vazia" style={{ width: lado, height: lado }}>
                  <ImageOff size={20} />
                </span>
              ))}
            <div className="lista-item__corpo">
              {editando ? (
                <div className="lista-item__renomear-box">
                  <input
                    className="campo__controle lista-item__nome-input"
                    value={rascunho}
                    autoFocus
                    aria-label="Nome do registro"
                    disabled={salvando}
                    onChange={(e) => setRascunho(e.target.value)}
                    onKeyDown={(e) => aoTeclarNome(e, r)}
                  />
                  <div className="lista-item__renomear-acoes">
                    <button
                      type="button"
                      className="lista-item__salvar"
                      disabled={salvando}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void salvarNome(r)}
                    >
                      {salvando ? 'Salvando…' : 'Salvar'}
                    </button>
                    <button
                      type="button"
                      className="lista-item__cancelar"
                      disabled={salvando}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={cancelarEdicao}
                    >
                      Cancelar
                    </button>
                  </div>
                  {erro !== null && <p className="aviso-erro">{erro}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  className="lista-item__titulo-btn"
                  onClick={() => aoAbrir(r)}
                >
                  <span className="lista-item__titulo">{titulo}</span>
                  {resumo !== '' && <span className="lista-item__resumo">{resumo}</span>}
                </button>
              )}
            </div>
            {campoTitulo !== undefined && !editando && (
              <button
                type="button"
                className="lista-item__renomear"
                aria-label={`Renomear ${titulo}`}
                title="Renomear"
                onClick={() => iniciarEdicao(r)}
              >
                Renomear
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
