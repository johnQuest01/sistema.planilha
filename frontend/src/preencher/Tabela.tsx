import { memo, useCallback, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ImageOff, Trash2 } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Colecao, Registro } from '../../../shared/tipos';
import { useAuth } from '../contexto/Auth';
import { CampoValor } from './CampoValor';
import {
  alvoTitulo,
  camposDoRegistro,
  capaDoRegistro,
  formatarValor,
  lerAlvoTitulo,
  patchAlvoTitulo,
  tituloDoRegistro,
} from './derivarResumo';
import { Miniatura } from './Miniatura';
import './preencher.css';

interface Props {
  colecao: Colecao;
  registros: Registro[];
  aoAtualizar: (r: Registro) => void;
  aoAbrirFicha: (r: Registro) => void;
  aoApagar?: (id: string) => void;
  rodape?: ReactNode;
}

interface Edicao {
  rid: string;
  cid: string;
}

const ALTURA_LINHA = 96;

interface LinhaProps {
  r: Registro;
  colecao: Colecao;
  temImagem: boolean;
  edicao: Edicao | null;
  rascunho: unknown;
  renomeando: boolean;
  rascunhoTitulo: string;
  salvandoTitulo: boolean;
  erroTitulo: string | null;
  prioritaria: boolean;
  podeApagar: boolean;
  confirmandoApagar: boolean;
  apagando: boolean;
  aoAbrirFicha: (r: Registro) => void;
  iniciar: (r: Registro, c: Campo) => void;
  setRascunho: (v: unknown) => void;
  comitar: () => void;
  iniciarRenomear: (r: Registro) => void;
  setRascunhoTitulo: (v: string) => void;
  aoTeclarTitulo: (e: ReactKeyboardEvent<HTMLInputElement>, r: Registro) => void;
  salvarTitulo: (r: Registro) => void;
  cancelarRenomear: () => void;
  aoPedirApagar: (r: Registro) => void;
  aoConfirmarApagar: (r: Registro) => void;
  aoCancelarApagar: () => void;
}

const LinhaTabela = memo(function LinhaTabela({
  r,
  colecao,
  temImagem,
  edicao,
  rascunho,
  renomeando,
  rascunhoTitulo,
  salvandoTitulo,
  erroTitulo,
  prioritaria,
  podeApagar,
  confirmandoApagar,
  apagando,
  aoAbrirFicha,
  iniciar,
  setRascunho,
  comitar,
  iniciarRenomear,
  setRascunhoTitulo,
  aoTeclarTitulo,
  salvarTitulo,
  cancelarRenomear,
  aoPedirApagar,
  aoConfirmarApagar,
  aoCancelarApagar,
}: LinhaProps): JSX.Element {
  // Título/capa/renomear saem do corpo VIGENTE do registro (próprio ou da coleção).
  const camposReg = camposDoRegistro(colecao, r);
  const capa = capaDoRegistro(camposReg, r);
  const titulo = tituloDoRegistro(camposReg, r);
  const podeRenomear = alvoTitulo(camposReg) !== undefined;

  return (
    <tr>
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
              <Miniatura fotoKey={capa} tamanho={72} prioritaria={prioritaria} />
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
            <button type="button" className="tabela-titulo" onClick={() => aoAbrirFicha(r)}>
              {titulo}
            </button>
            {podeRenomear && (
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
              <span className="etiqueta">{formatarValor(c, r.valores[c.id]) || '— linhas'}</span>
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
                aoConfirmar={comitar}
                aoSairFoco={comitar}
                autoFoco
              />
            ) : (
              formatarValor(c, r.valores[c.id]) || '—'
            )}
          </td>
        );
      })}
      {podeApagar && (
        <td className="tabela__acoes">
          {confirmandoApagar ? (
            <div className="tabela-apagar-confirma">
              <button
                type="button"
                className="lista-item__salvar tabela-apagar-confirma__ok"
                disabled={apagando}
                onClick={() => aoConfirmarApagar(r)}
              >
                {apagando ? 'Apagando…' : 'Lixeira'}
              </button>
              <button
                type="button"
                className="lista-item__cancelar"
                disabled={apagando}
                onClick={aoCancelarApagar}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--icone tabela__apagar-btn"
              aria-label="Enviar para lixeira"
              title="Enviar para lixeira"
              onClick={() => aoPedirApagar(r)}
            >
              <Trash2 size={16} />
            </button>
          )}
        </td>
      )}
    </tr>
  );
});

export function Tabela({
  colecao,
  registros,
  aoAtualizar,
  aoAbrirFicha,
  aoApagar,
  rodape,
}: Props): JSX.Element {
  const { estado } = useAuth();
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [rascunho, setRascunho] = useState<unknown>(undefined);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [rascunhoTitulo, setRascunhoTitulo] = useState('');
  const [salvandoTitulo, setSalvandoTitulo] = useState(false);
  const [erroTitulo, setErroTitulo] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [apagandoId, setApagandoId] = useState<string | null>(null);
  const temImagem = colecao.campos.some((c) => c.tipo === 'imagem');
  const scrollRef = useRef<HTMLDivElement>(null);
  // Qualquer usuário logado pode enviar registros para a lixeira (soft-delete).
  const podeApagar = aoApagar !== undefined && estado.fase === 'logado';
  const colunas = (temImagem ? 1 : 0) + 1 + colecao.campos.length + (podeApagar ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: registros.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ALTURA_LINHA,
    overscan: 10,
  });

  const itens = virtualizer.getVirtualItems();
  const paddingTop = itens.length > 0 ? (itens[0]?.start ?? 0) : 0;
  const paddingBottom =
    itens.length > 0
      ? virtualizer.getTotalSize() - (itens[itens.length - 1]?.end ?? 0)
      : 0;

  const iniciar = useCallback((r: Registro, c: Campo): void => {
    setRenomeandoId(null);
    setEdicao({ rid: r.id, cid: c.id });
    setRascunho(r.valores[c.id]);
  }, []);

  const comitarValor = useCallback(async (): Promise<void> => {
    if (edicao === null) return;
    const { rid, cid } = edicao;
    const valor = rascunho;
    setEdicao(null);
    try {
      const atualizado = await api.editarRegistro(rid, { [cid]: valor });
      aoAtualizar(atualizado);
    } catch {
      /* silencioso */
    }
  }, [edicao, rascunho, aoAtualizar]);

  const iniciarRenomear = useCallback(
    (r: Registro): void => {
      const alvo = alvoTitulo(camposDoRegistro(colecao, r));
      if (alvo === undefined) return;
      setEdicao(null);
      setRenomeandoId(r.id);
      setRascunhoTitulo(lerAlvoTitulo(r, alvo));
      setErroTitulo(null);
    },
    [colecao],
  );

  const cancelarRenomear = useCallback((): void => {
    setRenomeandoId(null);
    setErroTitulo(null);
  }, []);

  const salvarTitulo = useCallback(
    async (r: Registro): Promise<void> => {
      const alvo = alvoTitulo(camposDoRegistro(colecao, r));
      if (alvo === undefined || renomeandoId !== r.id || salvandoTitulo) return;
      const atual = lerAlvoTitulo(r, alvo);
      const novo = rascunhoTitulo.trim();
      if (novo === atual.trim()) {
        setRenomeandoId(null);
        return;
      }
      setSalvandoTitulo(true);
      setErroTitulo(null);
      try {
        const atualizado = await api.editarRegistro(r.id, patchAlvoTitulo(r, alvo, novo));
        aoAtualizar(atualizado);
        setRenomeandoId(null);
      } catch (e) {
        setErroTitulo(e instanceof ErroApi ? e.message : 'não foi possível renomear');
      } finally {
        setSalvandoTitulo(false);
      }
    },
    [colecao, renomeandoId, salvandoTitulo, rascunhoTitulo, aoAtualizar],
  );

  const aoTeclarTitulo = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>, r: Registro): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void salvarTitulo(r);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelarRenomear();
      }
    },
    [salvarTitulo, cancelarRenomear],
  );

  const aoPedirApagar = useCallback((r: Registro): void => {
    setEdicao(null);
    setRenomeandoId(null);
    setConfirmandoId(r.id);
  }, []);

  const aoCancelarApagar = useCallback((): void => {
    setConfirmandoId(null);
  }, []);

  const aoConfirmarApagar = useCallback(
    async (r: Registro): Promise<void> => {
      if (apagandoId !== null) return;
      setApagandoId(r.id);
      try {
        await api.apagarRegistro(r.id);
        aoApagar?.(r.id);
        setConfirmandoId(null);
      } catch {
        /* mantém a linha; usuário pode tentar de novo */
      } finally {
        setApagandoId(null);
      }
    },
    [apagandoId, aoApagar],
  );

  return (
    <div className="tabela-envolto" ref={scrollRef}>
      <table className="tabela">
        <thead>
          <tr>
            {temImagem && <th aria-label="Foto" />}
            <th>Título</th>
            {colecao.campos.map((c) => (
              <th key={c.id}>{c.nome}</th>
            ))}
            {podeApagar && <th aria-label="Ações" />}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colunas} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {itens.map((item) => {
            const r = registros[item.index];
            if (r === undefined) return null;
            return (
              <LinhaTabela
                key={r.id}
                r={r}
                colecao={colecao}
                temImagem={temImagem}
                edicao={edicao}
                rascunho={rascunho}
                renomeando={renomeandoId === r.id}
                rascunhoTitulo={rascunhoTitulo}
                salvandoTitulo={salvandoTitulo}
                erroTitulo={renomeandoId === r.id ? erroTitulo : null}
                prioritaria={item.index < 8}
                podeApagar={podeApagar}
                confirmandoApagar={confirmandoId === r.id}
                apagando={apagandoId === r.id}
                aoAbrirFicha={aoAbrirFicha}
                iniciar={iniciar}
                setRascunho={setRascunho}
                comitar={() => void comitarValor()}
                iniciarRenomear={iniciarRenomear}
                setRascunhoTitulo={setRascunhoTitulo}
                aoTeclarTitulo={aoTeclarTitulo}
                salvarTitulo={(reg) => void salvarTitulo(reg)}
                cancelarRenomear={cancelarRenomear}
                aoPedirApagar={aoPedirApagar}
                aoConfirmarApagar={(reg) => void aoConfirmarApagar(reg)}
                aoCancelarApagar={aoCancelarApagar}
              />
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colunas} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      {rodape}
    </div>
  );
}
