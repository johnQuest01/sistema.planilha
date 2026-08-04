import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { ImageOff } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Colecao, Registro } from '../../../shared/tipos';
import {
  alvoTitulo,
  capaDoRegistro,
  lerAlvoTitulo,
  patchAlvoTitulo,
  resumoDoRegistro,
  temCampoImagem,
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
  /** Chamado quando a rolagem se aproxima do fim — carrega a próxima página sozinho. */
  aoAproximarFim?: () => void;
}

interface ItemProps {
  r: Registro;
  colecao: Colecao;
  comImagem: boolean;
  lado: number;
  podeRenomear: boolean;
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
  podeRenomear,
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
      {podeRenomear && !editando && (
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
  aoAproximarFim,
}: Props): JSX.Element {
  const comImagem = temCampoImagem(colecao.campos);
  const alvo = alvoTitulo(colecao.campos);
  const lado = solto ? 72 : 56;
  const altura = alturaLinha(solto, lado);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // A lista rola JUNTO com a página (não tem rolagem interna própria): assim, no
  // celular, o botão "Ver mais" e o restante dos registros sempre aparecem ao rolar.
  // O virtualizer de janela precisa saber a que distância do topo do documento a
  // lista começa (scrollMargin) para posicionar os itens no lugar certo.
  const [margemScroll, setMargemScroll] = useState(0);
  const medir = useCallback((): void => {
    const el = listaRef.current;
    if (el === null) return;
    const nova = el.getBoundingClientRect().top + window.scrollY;
    // Durante a rolagem, top diminui e scrollY aumenta na mesma medida → soma constante,
    // então isso NÃO dispara re-render em cada scroll (só quando o layout acima muda).
    setMargemScroll((prev) => (Math.abs(prev - nova) > 0.5 ? nova : prev));
  }, []);
  // Remede a cada render (pega mudanças de altura do que está acima: form de campo,
  // resultados de busca, avisos) e também em resize da janela.
  useLayoutEffect(() => {
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  });

  const virtualizer = useWindowVirtualizer({
    count: registros.length,
    estimateSize: () => altura,
    overscan: 8,
    scrollMargin: margemScroll,
  });

  // Ao trocar compacto/solto, recalcula posições (senão a capa “vaza” com altura velha).
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [solto, altura, virtualizer]);

  const iniciarEdicao = useCallback(
    (r: Registro): void => {
      if (alvo === undefined) return;
      setEditandoId(r.id);
      setRascunho(lerAlvoTitulo(r, alvo));
      setErro(null);
    },
    [alvo],
  );

  const cancelarEdicao = useCallback((): void => {
    setEditandoId(null);
    setErro(null);
  }, []);

  const salvarNome = useCallback(
    async (r: Registro): Promise<void> => {
      if (alvo === undefined || editandoId !== r.id || salvando) return;
      const atual = lerAlvoTitulo(r, alvo);
      const novo = rascunho.trim();
      if (novo === atual.trim()) {
        setEditandoId(null);
        return;
      }
      setSalvando(true);
      setErro(null);
      try {
        const atualizado = await api.editarRegistro(r.id, patchAlvoTitulo(r, alvo, novo));
        aoAtualizar(atualizado);
        setEditandoId(null);
      } catch (e) {
        setErro(e instanceof ErroApi ? e.message : 'não foi possível salvar o nome');
      } finally {
        setSalvando(false);
      }
    },
    [alvo, editandoId, salvando, rascunho, aoAtualizar],
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
  const itens = virtualizer.getVirtualItems();
  const ultimoIndice = itens.length > 0 ? (itens[itens.length - 1]?.index ?? -1) : -1;

  // Carrega a próxima página automaticamente ao chegar perto do fim da lista, sem
  // depender de o usuário achar/tocar o botão "Ver mais".
  useEffect(() => {
    if (aoAproximarFim === undefined || registros.length === 0) return;
    if (ultimoIndice >= registros.length - 4) aoAproximarFim();
  }, [ultimoIndice, registros.length, aoAproximarFim]);

  return (
    <div ref={listaRef} className={`lista lista--virtual${solto ? ' lista--solto' : ''}`}>
      <div className="lista__virtual-inner" style={{ height: total }}>
        {itens.map((item) => {
          const r = registros[item.index];
          if (r === undefined) return null;
          return (
            <div
              key={r.id}
              className="lista__virtual-item"
              style={{
                transform: `translateY(${item.start - margemScroll}px)`,
                height: item.size,
              }}
            >
              <ItemLista
                r={r}
                colecao={colecao}
                comImagem={comImagem}
                lado={lado}
                podeRenomear={alvo !== undefined}
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
