import { ImageOff } from 'lucide-react';
import type { Colecao, Registro } from '../../../shared/tipos';
import {
  capaDoRegistro,
  resumoDoRegistro,
  temCampoImagem,
  tituloDoRegistro,
} from './derivarResumo';
import { urlMini } from '../imagens/urls';
import './preencher.css';

interface Props {
  colecao: Colecao;
  registros: Registro[];
  solto: boolean;
  aoAbrir: (r: Registro) => void;
}

export function ListaDensa({ colecao, registros, solto, aoAbrir }: Props): JSX.Element {
  const comImagem = temCampoImagem(colecao.campos);
  const lado = solto ? 52 : 42;
  return (
    <div className={`lista${solto ? ' lista--solto' : ''}`}>
      {registros.map((r) => {
        const capa = capaDoRegistro(colecao.campos, r);
        const resumo = resumoDoRegistro(colecao.campos, r);
        return (
          <button key={r.id} type="button" className="lista-item" onClick={() => aoAbrir(r)}>
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
                  <ImageOff size={16} />
                </span>
              ))}
            <span className="lista-item__corpo">
              <span className="lista-item__titulo">{tituloDoRegistro(colecao.campos, r)}</span>
              {resumo !== '' && <span className="lista-item__resumo">{resumo}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
