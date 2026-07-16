import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ErroApi } from '../api/cliente';
import type { Colecao as TColecao } from '../../../shared/tipos';
import { Segmentado } from '../ui/Segmentado';
import { Carregando } from '../ui/Carregando';
import { TopoApp } from './TopoApp';
import { Criar } from './Criar';
import { Preencher } from './Preencher';
import './colecao.css';

type Modo = 'criar' | 'preencher';

export function Colecao(): JSX.Element {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const [colecao, setColecao] = useState<TColecao | null>(null);
  const [modo, setModo] = useState<Modo>('criar');
  const [nomeEdit, setNomeEdit] = useState('');
  const nomeSalvo = useRef('');

  const recarregar = useCallback(async () => {
    const col = await api.obterColecao(id);
    setColecao(col);
    setNomeEdit(col.nome);
    nomeSalvo.current = col.nome;
  }, [id]);

  useEffect(() => {
    let vivo = true;
    void api
      .obterColecao(id)
      .then((col) => {
        if (!vivo) return;
        setColecao(col);
        setNomeEdit(col.nome);
        nomeSalvo.current = col.nome;
        // planilha nova (sem campos) abre em Criar; já povoada abre em Preencher
        setModo(col.campos.length === 0 ? 'criar' : 'preencher');
      })
      .catch((e: unknown) => {
        if (e instanceof ErroApi && e.status === 404) navegar('/', { replace: true });
      });
    return () => {
      vivo = false;
    };
  }, [id, navegar]);

  async function salvarNome(): Promise<void> {
    const limpo = nomeEdit.trim();
    if (limpo === '' || limpo === nomeSalvo.current) {
      setNomeEdit(nomeSalvo.current);
      return;
    }
    try {
      await api.renomearColecao(id, limpo);
      nomeSalvo.current = limpo;
      setColecao((c) => (c === null ? c : { ...c, nome: limpo }));
    } catch {
      setNomeEdit(nomeSalvo.current);
    }
  }

  if (colecao === null) return <Carregando />;

  return (
    <div className="pagina">
      <TopoApp />
      <div className="faixa">
        <div className="colecao-barra">
          <input
            className="titulo-editavel"
            value={nomeEdit}
            aria-label="Nome da planilha"
            onChange={(e) => setNomeEdit(e.target.value)}
            onBlur={() => void salvarNome()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setNomeEdit(nomeSalvo.current);
                e.currentTarget.blur();
              }
            }}
          />
          <Segmentado
            rotuloAria="Modo da planilha"
            valor={modo}
            onMudar={setModo}
            opcoes={[
              { valor: 'criar', rotulo: 'Criar' },
              { valor: 'preencher', rotulo: 'Preencher' },
            ]}
          />
        </div>

        {modo === 'criar' ? (
          <Criar colecao={colecao} aoMudar={() => void recarregar()} />
        ) : (
          <Preencher colecao={colecao} />
        )}
      </div>
    </div>
  );
}
