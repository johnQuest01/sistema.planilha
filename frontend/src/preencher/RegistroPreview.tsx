import { useEffect, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ExternalLink, Image as ImageIcon, Link as LinkIcon, Lock, Pencil, Share2, Trash2 } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Colecao, Registro, SubCampo } from '../../../shared/tipos';
import { useAuth } from '../contexto/Auth';
import { Visor } from '../imagens/Visor';
import { urlMini } from '../imagens/urls';
import { Botao } from '../ui/Botao';
import {
  alvoTitulo,
  camposDoRegistro,
  formatarValor,
  keysDoCampo,
  lerAlvoTitulo,
  patchAlvoTitulo,
  tituloDoRegistro,
} from './derivarResumo';
import { linhasDe } from './SecaoEditor';
import { campoTemConteudo, compartilharArquivo, gerarImagemRegistro } from './compartilhar';

interface Props {
  colecao: Colecao;
  registro: Registro;
  aoAbrir?: () => void;
  aoAtualizar?: (r: Registro) => void;
  aoApagar?: (id: string) => void;
  /** Alavanca travada: esconde o "Abrir registro" (edição) e mostra um aviso. */
  edicaoBloqueada?: boolean;
}

function keysDe(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((k): k is string => typeof k === 'string') : [];
}

function GradeFotos({
  keys,
  aoAbrirVisor,
}: {
  keys: string[];
  aoAbrirVisor: (indice: number) => void;
}): JSX.Element {
  if (keys.length === 0) {
    return <span className="preview-valor preview-valor--vazio">—</span>;
  }
  return (
    <div className="preview-imagens">
      {keys.map((k, i) => (
        <button
          key={k}
          type="button"
          className="preview-imagens__botao"
          onClick={() => aoAbrirVisor(i)}
          aria-label={`Ver foto ${i + 1} de ${keys.length}`}
        >
          <img
            className="preview-imagens__foto"
            src={urlMini(k)}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </button>
      ))}
    </div>
  );
}

function formatarSubTexto(sub: SubCampo, valor: unknown): string {
  if (sub.tipo === 'imagem') return '';
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

function ValorCampo({
  campo,
  registro,
  aoAbrirVisor,
}: {
  campo: Campo;
  registro: Registro;
  aoAbrirVisor: (keys: string[], indice: number) => void;
}): JSX.Element {
  const valor = registro.valores[campo.id];

  if (campo.tipo === 'imagem') {
    const keys = keysDoCampo(registro, campo.id);
    return <GradeFotos keys={keys} aoAbrirVisor={(i) => aoAbrirVisor(keys, i)} />;
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
            <span className="preview-secao__num">#{i + 1}</span>
            <div className="preview-secao__celulas">
              {subs.map((s) => {
                // Sempre lista TODOS os subcampos (aviamentos, etc.) — vazio vira "—".
                if (s.tipo === 'imagem') {
                  const keys = keysDe(linha[s.id]);
                  return (
                    <div key={s.id} className="preview-secao__celula preview-secao__celula--foto">
                      <span className="preview-secao__subnome">{s.nome}</span>
                      <GradeFotos keys={keys} aoAbrirVisor={(idx) => aoAbrirVisor(keys, idx)} />
                    </div>
                  );
                }
                const txt = formatarSubTexto(s, linha[s.id]);
                return (
                  <div key={s.id} className="preview-secao__celula">
                    <span className="preview-secao__subnome">{s.nome}</span>
                    <span className={`preview-valor${txt === '' ? ' preview-valor--vazio' : ''}`}>
                      {txt === '' ? '—' : txt}
                    </span>
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
  aoApagar,
  edicaoBloqueada = false,
}: Props): JSX.Element {
  const { estado } = useAuth();
  const usuario = estado.fase === 'logado' ? estado.usuario : null;
  // Qualquer usuário logado pode enviar o registro para a lixeira (soft-delete).
  const podeApagar = aoApagar !== undefined && usuario !== null;

  const [local, setLocal] = useState(registro);
  // Corpo VIGENTE deste registro (próprio, se independente; senão o da coleção).
  const campos = camposDoRegistro(colecao, local);
  const alvo = alvoTitulo(campos);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ keys: string[]; indice: number } | null>(null);
  const [confirmandoApagar, setConfirmandoApagar] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erroApagar, setErroApagar] = useState<string | null>(null);
  // Modo compartilhar: escolhe quais campos entram e envia (imagem montada) pro WhatsApp.
  // Fluxo em 2 etapas (iPhone-safe): "Preparar" monta a imagem; "Enviar" chama o
  // compartilhamento no toque (gesto fresco), senão o iOS não abre o menu.
  const [modoShare, setModoShare] = useState(false);
  const [selShare, setSelShare] = useState<Set<string>>(new Set());
  const [preparandoShare, setPreparandoShare] = useState(false);
  const [enviandoShare, setEnviandoShare] = useState(false);
  const [imgShare, setImgShare] = useState<File | null>(null);
  const [gerandoLink, setGerandoLink] = useState(false);
  const [avisoShare, setAvisoShare] = useState<string | null>(null);

  useEffect(() => {
    setLocal(registro);
  }, [registro]);

  function entrarShare(): void {
    // Comeca sem nada marcado: o usuario escolhe manualmente o que compartilhar.
    setSelShare(new Set());
    setImgShare(null);
    setAvisoShare(null);
    setModoShare(true);
  }

  function alternarShare(id: string): void {
    setImgShare(null); // seleção mudou: a imagem preparada ficou desatualizada.
    setSelShare((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function marcarTodasShare(): void {
    setImgShare(null);
    const todas = new Set<string>();
    for (const c of campos) if (campoTemConteudo(c, local)) todas.add(c.id);
    setSelShare(todas);
  }

  function limparShare(): void {
    setImgShare(null);
    setSelShare(new Set());
  }

  function sairShare(): void {
    setModoShare(false);
    setImgShare(null);
    setAvisoShare(null);
  }

  // Fase 1: monta a imagem (pode demorar com muitas fotos). NÃO compartilha aqui.
  async function prepararShare(): Promise<void> {
    if (preparandoShare || enviandoShare) return;
    if (selShare.size === 0) {
      setAvisoShare('Selecione ao menos um campo para compartilhar.');
      return;
    }
    setPreparandoShare(true);
    setAvisoShare(null);
    setImgShare(null);
    try {
      const f = await gerarImagemRegistro(tituloAtual, campos, local, selShare);
      if (f === null) {
        setAvisoShare('Não consegui montar a imagem. Tente com menos blocos/fotos.');
        return;
      }
      setImgShare(f);
    } finally {
      setPreparandoShare(false);
    }
  }

  // Alternativa: link público (rápido, qualidade máxima). Gera o token dos blocos
  // selecionados e compartilha a URL; se o share não abrir, copia para a área de
  // transferência (e, em último caso, mostra o link para copiar na mão).
  async function enviarLink(): Promise<void> {
    if (gerandoLink) return;
    if (selShare.size === 0) {
      setAvisoShare('Selecione ao menos um campo para compartilhar.');
      return;
    }
    setGerandoLink(true);
    setAvisoShare(null);
    try {
      const { codigo } = await api.criarLinkRegistro(registro.id, [...selShare]);
      const url = `${window.location.origin}/r/${codigo}`;
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: tituloAtual, text: tituloAtual, url });
          sairShare();
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return; // usuário cancelou
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setAvisoShare('Link copiado! Cole no WhatsApp.');
      } catch {
        setAvisoShare(`Link: ${url}`);
      }
    } catch {
      setAvisoShare('Não foi possível gerar o link. Tente novamente.');
    } finally {
      setGerandoLink(false);
    }
  }

  // Fase 2: chamada DIRETO no toque, com a imagem já pronta (iPhone-safe).
  async function enviarShare(): Promise<void> {
    if (imgShare === null || enviandoShare) return;
    setEnviandoShare(true);
    const r = await compartilharArquivo(tituloAtual, imgShare);
    setEnviandoShare(false);
    if (r === 'ok') {
      sairShare();
    } else if (r === 'cancelado') {
      // usuário fechou o menu; mantém a imagem pronta para tentar de novo.
    } else if (r === 'so-texto') {
      setAvisoShare('Este navegador não anexa imagem. Abra pelo celular (Safari/Chrome).');
    } else if (r === 'sem-suporte') {
      setAvisoShare('Compartilhamento não suportado aqui. Abra o app pelo celular (Safari/Chrome).');
    } else {
      setAvisoShare('Não foi possível compartilhar. Tente novamente.');
    }
  }

  function iniciarEdicao(): void {
    if (alvo === undefined) return;
    setEditando(true);
    setRascunho(lerAlvoTitulo(local, alvo));
    setErroNome(null);
  }

  function cancelarEdicao(): void {
    setEditando(false);
    setErroNome(null);
  }

  async function salvarNome(): Promise<void> {
    if (alvo === undefined || !editando || salvando) return;
    const atual = lerAlvoTitulo(local, alvo);
    const novo = rascunho.trim();
    if (novo === atual.trim()) {
      setEditando(false);
      return;
    }
    setSalvando(true);
    setErroNome(null);
    try {
      const atualizado = await api.editarRegistro(local.id, patchAlvoTitulo(local, alvo, novo));
      setLocal(atualizado);
      aoAtualizar?.(atualizado);
      setEditando(false);
    } catch (e) {
      setErroNome(e instanceof ErroApi ? e.message : 'não foi possível salvar o nome');
    } finally {
      setSalvando(false);
    }
  }

  function aoTeclar(e: ReactKeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void salvarNome();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelarEdicao();
    }
  }

  async function apagarRegistro(): Promise<void> {
    if (!podeApagar || apagando || aoApagar === undefined) return;
    setApagando(true);
    setErroApagar(null);
    try {
      await api.apagarRegistro(local.id);
      aoApagar(local.id);
    } catch (e) {
      setErroApagar(e instanceof ErroApi ? e.message : 'não foi possível apagar');
      setApagando(false);
    }
  }

  const tituloAtual = tituloDoRegistro(campos, local);

  return (
    <article className="preview-registro preview-registro--completo">
      <div className="preview-registro__cabecalho">
        <div className="preview-registro__cabecalho-linha">
          {editando ? (
            <div className="preview-registro__renomear-box">
              <input
                className="campo__controle preview-registro__nome-input"
                value={rascunho}
                autoFocus
                aria-label="Nome do registro"
                placeholder="Nome do registro"
                disabled={salvando}
                onChange={(e) => setRascunho(e.target.value)}
                onKeyDown={aoTeclar}
              />
              <div className="preview-registro__renomear-acoes">
                <button
                  type="button"
                  className="lista-item__salvar"
                  disabled={salvando}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void salvarNome()}
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
              {erroNome !== null && <p className="aviso-erro">{erroNome}</p>}
            </div>
          ) : alvo !== undefined ? (
            <button
              type="button"
              className="preview-registro__titulo-btn"
              onClick={iniciarEdicao}
              title="Clique para renomear"
            >
              <h3 className="preview-registro__titulo">{tituloAtual}</h3>
            </button>
          ) : (
            <h3 className="preview-registro__titulo">{tituloAtual}</h3>
          )}
        </div>
        {!editando && !confirmandoApagar && !modoShare && (
          <div className="preview-registro__acoes">
            {alvo !== undefined && (
              <Botao variante="padrao" onClick={iniciarEdicao}>
                <Pencil size={16} aria-hidden />
                <span className="preview-registro__btn-txt">Renomear</span>
              </Botao>
            )}
            <Botao
              variante="padrao"
              onClick={entrarShare}
              aria-label={`Compartilhar registro ${tituloAtual}`}
            >
              <Share2 size={16} aria-hidden />
              <span className="preview-registro__btn-txt">Compartilhar</span>
            </Botao>
            {aoAbrir !== undefined && !edicaoBloqueada && (
              <Botao
                variante="primario"
                onClick={aoAbrir}
                aria-label={`Abrir registro ${tituloAtual}`}
              >
                <ExternalLink size={16} aria-hidden />
                <span className="preview-registro__btn-txt preview-registro__btn-txt--curto">
                  Abrir
                </span>
                <span className="preview-registro__btn-txt preview-registro__btn-txt--longo">
                  Abrir registro
                </span>
              </Botao>
            )}
            {aoAbrir !== undefined && edicaoBloqueada && (
              <span className="preview-registro__travado" title="Libere a edição na barra para abrir este registro">
                <Lock size={14} aria-hidden />
                Edição travada
              </span>
            )}
            {podeApagar && (
              <button
                type="button"
                className="btn btn--icone preview-registro__lixeira"
                aria-label={`Apagar registro ${tituloAtual}`}
                title="Enviar para lixeira"
                onClick={() => {
                  setConfirmandoApagar(true);
                  setErroApagar(null);
                }}
              >
                <Trash2 size={18} aria-hidden />
              </button>
            )}
          </div>
        )}
        {confirmandoApagar && (
          <div className="preview-registro__confirma-apagar">
            <span className="preview-registro__confirma-txt">
              Mover para a lixeira? Dados e fotos ficam salvos até apagar definitivo.
            </span>
            <div className="preview-registro__confirma-acoes">
              <Botao
                variante="perigo"
                disabled={apagando}
                onClick={() => void apagarRegistro()}
              >
                {apagando ? 'Apagando…' : 'Lixeira'}
              </Botao>
              <Botao
                variante="fantasma"
                disabled={apagando}
                onClick={() => setConfirmandoApagar(false)}
              >
                Cancelar
              </Botao>
            </div>
            {erroApagar !== null && <p className="aviso-erro">{erroApagar}</p>}
          </div>
        )}
      </div>

      {modoShare && (
        <div className="preview-share-topo">
          <div className="preview-share-topo__info">
            <LinkIcon size={16} aria-hidden />
            <span>Marque as áreas e toque em “Compartilhar link”. O link abre só esses blocos, com as fotos em alta resolução.</span>
          </div>
          <div className="preview-share-topo__acoes">
            <span className="preview-share-topo__contador">{selShare.size} selecionado(s)</span>
            <button
              type="button"
              className="preview-share-topo__btn"
              onClick={marcarTodasShare}
            >
              Marcar todas
            </button>
            <button
              type="button"
              className="preview-share-topo__btn"
              disabled={selShare.size === 0}
              onClick={limparShare}
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      <div className="preview-campos">
        {campos.map((campo) => {
          const marcado = selShare.has(campo.id);
          const cabecalho = (
            <>
              {campo.config.titulo !== undefined && campo.config.titulo !== '' && (
                <span className="preview-campo__titulo-bloco">{campo.config.titulo}</span>
              )}
              <span className="preview-campo__nome">{campo.nome}</span>
            </>
          );
          const valor = (
            <ValorCampo
              campo={campo}
              registro={local}
              aoAbrirVisor={(keys, indice) => setVisor({ keys, indice })}
            />
          );
          if (!modoShare) {
            return (
              <div key={campo.id} className="preview-campo">
                {cabecalho}
                {valor}
              </div>
            );
          }
          return (
            <div
              key={campo.id}
              className={`preview-campo preview-campo--sel${marcado ? ' preview-campo--on' : ''}`}
            >
              <label className="preview-campo__check">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternarShare(campo.id)}
                />
                <span className="preview-campo__cabecalho">{cabecalho}</span>
              </label>
              {valor}
            </div>
          );
        })}
      </div>

      {modoShare && (
        <div className="preview-share-bar">
          {avisoShare !== null && <p className="preview-share-bar__aviso">{avisoShare}</p>}
          {imgShare !== null && (
            <p className="preview-share-bar__ok">Imagem pronta! Toque em “Enviar imagem”.</p>
          )}
          <div className="preview-share-bar__acoes">
            <Botao
              variante="primario"
              disabled={gerandoLink || selShare.size === 0}
              onClick={() => void enviarLink()}
            >
              <LinkIcon size={16} aria-hidden />
              {gerandoLink ? 'Gerando link…' : 'Compartilhar link'}
            </Botao>
            {imgShare === null ? (
              <Botao
                variante="fantasma"
                disabled={preparandoShare || selShare.size === 0}
                onClick={() => void prepararShare()}
              >
                <ImageIcon size={16} aria-hidden />
                {preparandoShare ? 'Montando imagem…' : 'Enviar como imagem'}
              </Botao>
            ) : (
              <Botao
                variante="padrao"
                disabled={enviandoShare}
                onClick={() => void enviarShare()}
              >
                <Share2 size={16} aria-hidden />
                {enviandoShare ? 'Abrindo…' : 'Enviar imagem'}
              </Botao>
            )}
            <Botao
              variante="fantasma"
              disabled={preparandoShare || enviandoShare || gerandoLink}
              onClick={sairShare}
            >
              Cancelar
            </Botao>
          </div>
        </div>
      )}

      {modoShare && selShare.size > 0 && (
        <button
          type="button"
          className="preview-share-fab preview-share-fab--pronto"
          disabled={gerandoLink}
          onClick={() => void enviarLink()}
          aria-label={`Compartilhar link de ${selShare.size} bloco(s)`}
        >
          <LinkIcon size={20} aria-hidden />
          <span className="preview-share-fab__txt">
            {gerandoLink ? 'Gerando…' : `Link (${selShare.size})`}
          </span>
        </button>
      )}

      {visor !== null && (
        <Visor
          keys={visor.keys}
          indiceInicial={visor.indice}
          aoFechar={() => setVisor(null)}
        />
      )}
    </article>
  );
}
