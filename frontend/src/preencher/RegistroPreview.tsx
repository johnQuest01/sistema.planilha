import { useEffect, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { api } from '../api/cliente';
import type { Campo, Colecao, Registro, SubCampo } from '../../../shared/tipos';
import { urlMini } from '../imagens/urls';
import {
  campoTituloDoRegistro,
  formatarValor,
  keysDoCampo,
  textoDe,
  tituloDoRegistro,
} from './derivarResumo';
import { linhasDe } from './SecaoEditor';

interface Props {
  colecao: Colecao;
  registro: Registro;
  aoAbrir?: () => void;
  aoAtualizar?: (r: Registro) => void;
}

function formatarSub(sub: SubCampo, valor: unknown): string {
  if (sub.tipo === 'imagem') {
    const n = Array.isArray(valor) ? valor.length : 0;
    return n === 0 ? '' : `${n} ${n === 1 ? 'foto' : 'fotos'}`;
  }
  const fake: Campo = {
    id: sub.id,
    colecaoId: '',
    nome: sub.nome,
    tipo: sub.tipo,
    ordem: 0,
    config: sub.config,
  };
  return formatarValor(fake, valor).trim();
}

function ValorCampo({ campo, registro }: { campo: Campo; registro: Registro }): JSX.Element {
  const valor = registro.valores[campo.id];

  if (campo.tipo === 'imagem') {
    const keys = keysDoCampo(registro, campo.id);
    if (keys.length === 0) {
      return <span className="preview-valor preview-valor--vazio">—</span>;
    }
    return (
      <div className="preview-imagens">
        {keys.map((k) => (
          <img key={k} className="capa" src={urlMini(k)} alt="" loading="lazy" width={56} height={56} />
        ))}
      </div>
    );
  }

  if (campo.tipo === 'secao') {
    const linhas = linhasDe(valor);
    const subs = campo.config.subcampos ?? [];
    if (linhas.length === 0) {
      return <span className="preview-valor preview-valor--vazio">—</span>;
    }
    return (
      <div className="preview-secao">
        {linhas.map((linha, i) => (
          <div key={i} className="preview-secao__linha">
            <span className="preview-secao__num">{i + 1}</span>
            <div className="preview-secao__celulas">
              {subs.map((s) => {
                const txt = formatarSub(s, linha[s.id]);
                if (txt === '') return null;
                return (
                  <div key={s.id} className="preview-secao__celula">
                    <span className="preview-secao__subnome">{s.nome}</span>
                    <span className="preview-valor">{txt}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const txt = formatarValor(campo, valor).trim();
  if (txt === '') {
    return <span className="preview-valor preview-valor--vazio">—</span>;
  }
  return <span className="preview-valor">{txt}</span>;
}

export function RegistroPreview({
  colecao,
  registro,
  aoAbrir,
  aoAtualizar,
}: Props): JSX.Element {
  const campoTitulo = campoTituloDoRegistro(colecao.campos);
  const [local, setLocal] = useState(registro);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');

  useEffect(() => {
    setLocal(registro);
  }, [registro]);

  function iniciarEdicao(): void {
    if (campoTitulo === undefined || aoAtualizar === undefined) return;
    setEditando(true);
    setRascunho(textoDe(local.valores[campoTitulo.id]));
  }

  async function salvarNome(): Promise<void> {
    if (campoTitulo === undefined || aoAtualizar === undefined || !editando) return;
    setEditando(false);
    const atual = textoDe(local.valores[campoTitulo.id]);
    const novo = rascunho.trim();
    if (novo === atual.trim()) return;
    try {
      const atualizado = await api.editarRegistro(local.id, { [campoTitulo.id]: novo });
      setLocal(atualizado);
      aoAtualizar(atualizado);
    } catch {
      /* silencioso */
    }
  }

  function aoTeclar(e: ReactKeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void salvarNome();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditando(false);
    }
  }

  const tituloAtual = tituloDoRegistro(colecao.campos, local);

  const cabecalho = (
    <div className="preview-registro__cabecalho-linha">
      {editando ? (
        <input
          className="campo__controle preview-registro__nome-input"
          value={rascunho}
          autoFocus
          aria-label="Nome do registro"
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => void salvarNome()}
          onKeyDown={aoTeclar}
        />
      ) : (
        <h3 className="preview-registro__titulo">{tituloAtual}</h3>
      )}
      {campoTitulo !== undefined && aoAtualizar !== undefined && !editando && (
        <button
          type="button"
          className="preview-registro__renomear"
          onClick={iniciarEdicao}
        >
          Renomear
        </button>
      )}
    </div>
  );

  const conteudo = (
    <>
      <div className="preview-campos">
        {colecao.campos.map((campo) => (
          <div key={campo.id} className="preview-campo">
            {campo.config.titulo !== undefined && campo.config.titulo !== '' && (
              <span className="preview-campo__titulo-bloco">{campo.config.titulo}</span>
            )}
            <span className="preview-campo__nome">{campo.nome}</span>
            <ValorCampo campo={campo} registro={local} />
          </div>
        ))}
      </div>
      {local.criadoPor !== null && local.criadoPor !== '' && (
        <p className="preview-meta">Preenchido por {local.criadoPor}</p>
      )}
    </>
  );

  if (aoAbrir === undefined) {
    return (
      <article className="preview-registro">
        {cabecalho}
        {conteudo}
      </article>
    );
  }

  return (
    <article className="preview-registro">
      <div className="preview-registro__cabecalho">
        {cabecalho}
        <button type="button" className="preview-registro__acao" onClick={aoAbrir}>
          Abrir registro
        </button>
      </div>
      {conteudo}
    </article>
  );
}
