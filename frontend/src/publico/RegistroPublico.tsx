import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Campo, Registro } from '../../../shared/tipos';
import { api, ErroApi } from '../api/cliente';
import { definirBaseR2, urlCheia } from '../imagens/urls';
import { formatarValor, keysDoCampo, tituloDoRegistro } from '../preencher/derivarResumo';
import { linhasDe } from '../preencher/SecaoEditor';
import './publico.css';

type Estado =
  | { fase: 'carregando' }
  | { fase: 'erro'; msg: string }
  | { fase: 'ok'; campos: Campo[]; registro: Registro };

// Página PÚBLICA (sem login) que mostra um registro pelo link /r/:token, só com os
// blocos que foram escolhidos ao compartilhar, na ORDEM da estrutura do registro.
export function RegistroPublico(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });

  useEffect(() => {
    let vivo = true;
    if (token === undefined || token === '') {
      setEstado({ fase: 'erro', msg: 'Link inválido.' });
      return;
    }
    void (async () => {
      try {
        const r = await api.registroPublico(token);
        if (!vivo) return;
        if (r.r2PublicBase !== '') definirBaseR2(r.r2PublicBase);
        const registro: Registro = {
          id: '',
          colecaoId: '',
          valores: r.valores,
          criadoPor: null,
          criadoPorId: null,
          criadoEm: '',
          atualizadoEm: '',
        };
        setEstado({ fase: 'ok', campos: r.campos, registro });
      } catch (e) {
        if (!vivo) return;
        const msg =
          e instanceof ErroApi && (e.status === 404 || e.status === 410)
            ? 'Este link é inválido ou expirou.'
            : 'Não foi possível abrir o link. Tente novamente.';
        setEstado({ fase: 'erro', msg });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token]);

  if (estado.fase === 'carregando') {
    return (
      <div className="pub-wrap">
        <p className="pub-msg">Abrindo…</p>
      </div>
    );
  }
  if (estado.fase === 'erro') {
    return (
      <div className="pub-wrap">
        <p className="pub-msg">{estado.msg}</p>
      </div>
    );
  }

  const { campos, registro } = estado;
  const titulo = tituloDoRegistro(campos, registro);

  return (
    <div className="pub-wrap">
      <article className="pub-card">
        {titulo !== 'Sem nome' && <h1 className="pub-titulo">{titulo}</h1>}
        {campos.map((campo) => (
          <BlocoPublico key={campo.id} campo={campo} registro={registro} />
        ))}
      </article>
      <p className="pub-rodape">Compartilhado por link · somente leitura</p>
    </div>
  );
}

function Fotos({ keys }: { keys: string[] }): JSX.Element | null {
  if (keys.length === 0) return null;
  return (
    <div className="pub-fotos">
      {keys.map((k) => (
        <a key={k} href={urlCheia(k)} target="_blank" rel="noreferrer" className="pub-foto">
          <img src={urlCheia(k)} alt="" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

function BlocoPublico({ campo, registro }: { campo: Campo; registro: Registro }): JSX.Element | null {
  const tituloBloco = campo.config.titulo;
  const cabecalho = (
    <>
      {tituloBloco !== undefined && tituloBloco !== '' && (
        <div className="pub-bloco-titulo">{tituloBloco}</div>
      )}
      <div className="pub-rotulo">{campo.nome}</div>
    </>
  );

  if (campo.tipo === 'imagem') {
    const keys = keysDoCampo(registro, campo.id);
    if (keys.length === 0) return null;
    return (
      <section className="pub-bloco">
        {cabecalho}
        <Fotos keys={keys} />
      </section>
    );
  }

  if (campo.tipo === 'secao') {
    const subs = campo.config.subcampos ?? [];
    const subsTxt = subs.filter((s) => s.tipo !== 'imagem');
    const subsImg = subs.filter((s) => s.tipo === 'imagem');
    const linhas = linhasDe(registro.valores[campo.id]);
    const render: JSX.Element[] = [];
    linhas.forEach((linha, i) => {
      const cel: JSX.Element[] = [];
      for (const s of subsTxt) {
        const v = formatarValor({ tipo: s.tipo, config: s.config }, linha[s.id]).trim();
        if (v !== '') {
          cel.push(
            <span key={s.id} className="pub-cel">
              <b>{s.nome}:</b> {v}
            </span>,
          );
        }
      }
      const fotos: string[] = [];
      for (const s of subsImg) {
        const v = linha[s.id];
        if (Array.isArray(v)) for (const k of v) if (typeof k === 'string') fotos.push(k);
      }
      if (cel.length === 0 && fotos.length === 0) return;
      render.push(
        <div key={`${campo.id}-${i}`} className="pub-linha">
          {cel.length > 0 && <div className="pub-linha-txt">{cel}</div>}
          <Fotos keys={fotos} />
        </div>,
      );
    });
    if (render.length === 0) return null;
    return (
      <section className="pub-bloco">
        {cabecalho}
        {render}
      </section>
    );
  }

  const v = formatarValor(campo, registro.valores[campo.id]).trim();
  if (v === '') return null;
  return (
    <section className="pub-bloco">
      {cabecalho}
      <div className="pub-valor">{v}</div>
    </section>
  );
}
