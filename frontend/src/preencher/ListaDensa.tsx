import { useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ImageOff } from 'lucide-react';
import { api } from '../api/cliente';
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

  function iniciarEdicao(r: Registro): void {
    if (campoTitulo === undefined) return;
    setEditandoId(r.id);
    setRascunho(textoDe(r.valores[campoTitulo.id]));
  }

  async function salvarNome(r: Registro): Promise<void> {
    if (campoTitulo === undefined || editandoId !== r.id) return;
    setEditandoId(null);
    const atual = textoDe(r.valores[campoTitulo.id]);
    const novo = rascunho.trim();
    if (novo === atual.trim()) return;
    try {
      const atualizado = await api.editarRegistro(r.id, { [campoTitulo.id]: novo });
      aoAtualizar(atualizado);
    } catch {
      /* silencioso */
    }
  }

  function aoTeclarNome(e: ReactKeyboardEvent<HTMLInputElement>, r: Registro): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void salvarNome(r);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditandoId(null);
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
                <input
                  className="campo__controle lista-item__nome-input"
                  value={rascunho}
                  autoFocus
                  aria-label="Nome do registro"
                  onChange={(e) => setRascunho(e.target.value)}
                  onBlur={() => void salvarNome(r)}
                  onKeyDown={(e) => aoTeclarNome(e, r)}
                />
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
