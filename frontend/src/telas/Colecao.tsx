import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Colecao as TColecao } from '../../../shared/tipos';
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
  const [duplicando, setDuplicando] = useState(false);
  const nomeSalvo = useRef('');

  const recarregar = useCallback(async () => {
    const col = await api.obterColecao(id);
    setColecao(col);
    setNomeEdit(col.nome);
    nomeSalvo.current = col.nome;
  }, [id]);

  // Atualização local dos blocos (UI otimista). Nenhum write refaz o GET da coleção:
  // quem escreve reflete a mudança aqui na hora, sem round-trip pra desenhar.
  const atualizarCampos = useCallback((fn: (campos: Campo[]) => Campo[]) => {
    setColecao((c) => (c === null ? c : { ...c, campos: fn(c.campos) }));
  }, []);

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

  // Nome da planilha também é o título da aba.
  useEffect(() => {
    if (colecao !== null) document.title = `${colecao.nome} · Mostruário`;
  }, [colecao]);

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

  async function duplicar(): Promise<void> {
    if (duplicando) return;
    setDuplicando(true);
    try {
      const copia = await api.duplicarColecao(id);
      navegar(`/c/${copia.id}`);
    } catch {
      setDuplicando(false);
    }
  }

  if (colecao === null) return <Carregando />;

  const ehPreencher = modo === 'preencher';

  return (
    <div className="pagina">
      <TopoApp />
      <div className="faixa">
        <div className="colecao-barra">
          <input
            className="titulo-editavel"
            value={nomeEdit}
            aria-label="Nome da planilha"
            disabled={ehPreencher}
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
          <button
            type="button"
            className="btn btn--icone"
            aria-label="Duplicar planilha (formato em branco)"
            title="Duplicar (formato em branco)"
            disabled={duplicando}
            onClick={() => void duplicar()}
          >
            <Copy size={18} />
          </button>
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
          <Criar colecao={colecao} aoMudarCampos={atualizarCampos} recarregar={() => void recarregar()} />
        ) : (
          <Preencher colecao={colecao} />
        )}
      </div>
    </div>
  );
}
