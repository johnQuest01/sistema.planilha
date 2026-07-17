import type { Campo, Colecao, Registro, SubCampo } from '../../../shared/tipos';
import { urlMini } from '../imagens/urls';
import { formatarValor, keysDoCampo, tituloDoRegistro } from './derivarResumo';
import { linhasDe } from './SecaoEditor';

interface Props {
  colecao: Colecao;
  registro: Registro;
  aoAbrir?: () => void;
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

export function RegistroPreview({ colecao, registro, aoAbrir }: Props): JSX.Element {
  const titulo = tituloDoRegistro(colecao.campos, registro);
  const conteudo = (
    <>
      <div className="preview-campos">
        {colecao.campos.map((campo) => (
          <div key={campo.id} className="preview-campo">
            {campo.config.titulo !== undefined && campo.config.titulo !== '' && (
              <span className="preview-campo__titulo-bloco">{campo.config.titulo}</span>
            )}
            <span className="preview-campo__nome">{campo.nome}</span>
            <ValorCampo campo={campo} registro={registro} />
          </div>
        ))}
      </div>
      {registro.criadoPor !== null && registro.criadoPor !== '' && (
        <p className="preview-meta">Preenchido por {registro.criadoPor}</p>
      )}
    </>
  );

  if (aoAbrir === undefined) {
    return (
      <article className="preview-registro">
        <h3 className="preview-registro__titulo">{titulo}</h3>
        {conteudo}
      </article>
    );
  }

  return (
    <article className="preview-registro">
      <button type="button" className="preview-registro__cabecalho" onClick={aoAbrir}>
        <h3 className="preview-registro__titulo">{titulo}</h3>
        <span className="preview-registro__acao">Abrir registro</span>
      </button>
      {conteudo}
    </article>
  );
}
