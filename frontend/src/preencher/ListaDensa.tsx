import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ImageOff } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Colecao, Registro } from '../../../shared/tipos';
import {
  campoTituloDoRegistro,
  capaDoRegistro,
  resumoDoRegistro,
  temCampoImagem,
  textoDe,
  tituloDoRegistro,
} from './derivarResumo';
import { Miniatura } from './Miniatura';
import './preencher.css';

interface Props {
  colecao: Colecao;
  registros: Registro[];
  solto: boolean;
  aoAbrir: (r: Registro) => void;
  aoAtualizar: (r: Registro) => void;
  rodape?: ReactNode;
}

interface ItemProps {
  r: Registro;
  colecao: Colecao;
  comImagem: boolean;
  lado: number;
  campoTitulo: Campo | undefined;
  editando: boolean;
  rascunho: string;
  salvando: boolean;
  erro: string | null;
  prioritaria: boolean;
  aoAbrir: (r: Registro) => void;
  iniciarEdicao: (r: Registro) => void;
  setRascunho: (v: string) => void;
  aoTeclarNome: (e: ReactKeyboardEvent<HTMLInputElement>, r: Registro) => void;
  salvarNome: (r: Registro) => void;
  cancelarEdicao: () => void;
}

/** Gap entre cards (padding-bottom do slot virtual). */
const GAP = 8;
/** Folga no fim da lista — último registro não fica sob FAB/presença. */
const RODAPE_SCROLL = 24;

function alturaLinha(solto: boolean, lado: number): number {
  // capa + padding vertical do card + borda + gap entre itens
  const pad = solto ? 24 : 16; // e3*2 ou e2*2
  const borda = 2;
  return lado + pad + borda + GAP;
}

const ItemLista = memo(function ItemLista({
  r,
  colecao,
  comImagem,
  lado,
  campoTitulo,
  editando,
  rascunho,
  salvando,
  erro,
  prioritaria,
  aoAbrir,
  iniciarEdicao,
  setRascunho,
  aoTeclarNome,
  salvarNome,
  cancelarEdicao,
}: ItemProps): JSX.Element {
  const capa = capaDoRegistro(colecao.campos, r);
  const resumo = resumoDoRegistro(colecao.campos, r);
  const titulo = tituloDoRegistro(colecao.campos, r);

  return (
    <div className="lista-item">
      {comImagem && (
        <button
          type="button"
          className="lista-item__capa-btn"
          aria-label={`Ver prévia de ${titulo}`}
          onClick={() => aoAbrir(r)}
        >
          {capa !== null ? (
            <Miniatura fotoKey={capa} tamanho={lado} prioritaria={prioritaria} />
          ) : (
            <span className="capa capa--vazia" style={{ width: lado, height: lado }}>
              <ImageOff size={20} />
            </span>
          )}
        </button>
      )}
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
          <button type="button" className="lista-item__titulo-btn" onClick={() => aoAbrir(r)}>
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
});

export function ListaDensa({
  colecao,
  registros,
  solto,
  aoAbrir,
  aoAtualizar,
  rodape,
}: Props): JSX.Element {
  const comImagem = temCampoImagem(colecao.campos);
  const campoTitulo = campoTituloDoRegistro(colecao.campos);
  const lado = solto ? 72 : 56;
  const altura = alturaLinha(solto, lado);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: registros.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => altura,
    overscan: 8,
  });

  // Ao trocar compacto/solto, recalcula posições (senão a capa “vaza” com altura velha).
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [solto, altura, virtualizer]);

  const iniciarEdicao = useCallback(
    (r: Registro): void => {
      if (campoTitulo === undefined) return;
      setEditandoId(r.id);
      setRascunho(textoDe(r.valores[campoTitulo.id]));
      setErro(null);
    },
    [campoTitulo],
  );

  const cancelarEdicao = useCallback((): void => {
    setEditandoId(null);
    setErro(null);
  }, []);

  const salvarNome = useCallback(
    async (r: Registro): Promise<void> => {
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
    },
    [campoTitulo, editandoId, salvando, rascunho, aoAtualizar],
  );

  const aoTeclarNome = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>, r: Registro): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void salvarNome(r);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelarEdicao();
      }
    },
    [salvarNome, cancelarEdicao],
  );

  const total = virtualizer.getTotalSize();
  const extraFim = RODAPE_SCROLL;

  return (
    <div
      ref={scrollRef}
      className={`lista lista--virtual${solto ? ' lista--solto' : ''}`}
    >
      <div className="lista__virtual-inner" style={{ height: total + extraFim }}>
        {virtualizer.getVirtualItems().map((item) => {
          const r = registros[item.index];
          if (r === undefined) return null;
          return (
            <div
              key={r.id}
              className="lista__virtual-item"
              style={{
                transform: `translateY(${item.start}px)`,
                height: item.size,
              }}
            >
              <ItemLista
                r={r}
                colecao={colecao}
                comImagem={comImagem}
                lado={lado}
                campoTitulo={campoTitulo}
                editando={editandoId === r.id}
                rascunho={rascunho}
                salvando={salvando}
                erro={editandoId === r.id ? erro : null}
                prioritaria={item.index < 8}
                aoAbrir={aoAbrir}
                iniciarEdicao={iniciarEdicao}
                setRascunho={setRascunho}
                aoTeclarNome={aoTeclarNome}
                salvarNome={(reg) => void salvarNome(reg)}
                cancelarEdicao={cancelarEdicao}
              />
            </div>
          );
        })}
      </div>
      {rodape}
    </div>
  );
}
