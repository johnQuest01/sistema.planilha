import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import { IconeTipo, ROTULO_TIPO } from '../ui/IconeTipo';
import { Botao } from '../ui/Botao';
import { CampoValor } from '../preencher/CampoValor';
import type { Campo, Colecao } from '../../../shared/tipos';
import { FormBloco, type DadosBloco } from './FormBloco';
import './colecao.css';

function subtitulo(campo: Campo): string {
  switch (campo.tipo) {
    case 'numero':
      return campo.config.sufixo !== undefined && campo.config.sufixo !== ''
        ? `Número · ${campo.config.sufixo}`
        : 'Número';
    case 'selecao': {
      const n = campo.config.opcoes?.length ?? 0;
      return `Seleção · ${n} ${n === 1 ? 'opção' : 'opções'}`;
    }
    case 'imagem': {
      const n = campo.config.maxFotos ?? 1;
      return `Imagem · até ${n} ${n === 1 ? 'foto' : 'fotos'}`;
    }
    case 'secao': {
      const n = campo.config.subcampos?.length ?? 0;
      return `Seção · ${n} ${n === 1 ? 'campo' : 'campos'}`;
    }
    default:
      return ROTULO_TIPO[campo.tipo];
  }
}

export function Criar({
  colecao,
  aoMudarCampos,
  recarregar,
}: {
  colecao: Colecao;
  aoMudarCampos: (fn: (campos: Campo[]) => Campo[]) => void;
  recarregar: () => void;
}): JSX.Element {
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [erroGlobal, setErroGlobal] = useState<string | null>(null);
  // Destaque do bloco recém-movido (~600ms) e alvo de foco que SEGUE o bloco (teclado).
  const [movido, setMovido] = useState<{ id: string; n: number } | null>(null);
  const [foco, setFoco] = useState<{ id: string; dir: 'cima' | 'baixo'; n: number } | null>(null);
  const campos = colecao.campos;

  // Espelho da ordem atual, lido pelo envio coalescido no momento em que o timer dispara.
  const camposRef = useRef<Campo[]>(campos);
  useEffect(() => {
    camposRef.current = campos;
  }, [campos]);

  // Coalescência do reordenar: N toques viram UM PATCH ~400ms depois do último.
  const timerRef = useRef<number | null>(null);
  const enviandoRef = useRef(false);
  // Botões das setas, por `${id}:${direcao}`, pra devolver o foco ao bloco movido.
  const botoesRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  // Destaque some sozinho.
  useEffect(() => {
    if (movido === null) return undefined;
    const t = window.setTimeout(() => setMovido(null), 600);
    return () => clearTimeout(t);
  }, [movido]);

  // Foco segue o bloco, não a posição. Se o botão da direção ficou desabilitado
  // (o bloco chegou na ponta), foca o botão oposto do mesmo bloco pra não encalhar.
  useEffect(() => {
    if (foco === null) return;
    const primaria = botoesRef.current.get(`${foco.id}:${foco.dir}`);
    if (primaria !== undefined && !primaria.disabled) {
      primaria.focus();
      return;
    }
    const oposta = foco.dir === 'cima' ? 'baixo' : 'cima';
    botoesRef.current.get(`${foco.id}:${oposta}`)?.focus();
  }, [foco]);

  function registrarBotao(id: string, dir: 'cima' | 'baixo') {
    const chave = `${id}:${dir}`;
    return (el: HTMLButtonElement | null): void => {
      if (el === null) botoesRef.current.delete(chave);
      else botoesRef.current.set(chave, el);
    };
  }

  function agendarEnvioOrdem(): void {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void enviarOrdem();
    }, 400);
  }

  async function enviarOrdem(): Promise<void> {
    timerRef.current = null;
    const ids = camposRef.current.map((c) => c.id);
    // Não persiste enquanto houver bloco otimista sem id real, nem em paralelo.
    if (ids.some((id) => id.startsWith('tmp_')) || enviandoRef.current) {
      agendarEnvioOrdem();
      return;
    }
    enviandoRef.current = true;
    try {
      // Manda a ordem final completa; o estado otimista já é a verdade na tela.
      await api.reordenarCampos(colecao.id, ids);
    } catch (e) {
      setErroGlobal(e instanceof ErroApi ? e.message : 'não foi possível salvar a ordem');
      recarregar(); // ressincroniza só no erro
    } finally {
      enviandoRef.current = false;
    }
  }

  function mover(campo: Campo, direcao: 'cima' | 'baixo'): void {
    setErroGlobal(null);
    // Reordena na hora (primeiro toque); a rede é só persistência, coalescida.
    // A posição é calculada sobre o estado mais recente (cs), então toques rápidos
    // em sequência não brigam com closures defasadas.
    aoMudarCampos((cs) => {
      const idx = cs.findIndex((c) => c.id === campo.id);
      const alvo = direcao === 'cima' ? idx - 1 : idx + 1;
      if (idx < 0 || alvo < 0 || alvo >= cs.length) return cs;
      const copia = [...cs];
      const [item] = copia.splice(idx, 1);
      if (item === undefined) return cs;
      copia.splice(alvo, 0, item);
      return copia;
    });
    const nonce = Date.now();
    setMovido({ id: campo.id, n: nonce });
    setFoco({ id: campo.id, dir: direcao, n: nonce });
    agendarEnvioOrdem();
  }

  async function adicionar(d: DadosBloco): Promise<void> {
    setErroGlobal(null);
    const tmpId = `tmp_${crypto.randomUUID()}`;
    const ordemBase =
      campos.length === 0 ? 0 : Math.max(...campos.map((c) => c.ordem)) + 100;
    const tmp: Campo = {
      id: tmpId,
      colecaoId: colecao.id,
      nome: d.nome,
      tipo: d.tipo,
      ordem: ordemBase,
      config: d.config,
    };
    // Aparece na lista na hora; o POST corre atrás e troca o id temporário pelo real.
    aoMudarCampos((cs) => [...cs, tmp]);
    void (async () => {
      try {
        const criado = await api.criarCampo(colecao.id, d);
        aoMudarCampos((cs) => cs.map((c) => (c.id === tmpId ? criado : c)));
      } catch (e) {
        aoMudarCampos((cs) => cs.filter((c) => c.id !== tmpId));
        setErroGlobal(e instanceof ErroApi ? e.message : 'não foi possível adicionar o bloco');
      }
    })();
  }

  async function apagar(id: string): Promise<void> {
    setErroGlobal(null);
    setConfirmando(null);
    const snapshot = camposRef.current;
    aoMudarCampos((cs) => cs.filter((c) => c.id !== id));
    try {
      await api.apagarCampo(id);
    } catch (e) {
      aoMudarCampos(() => snapshot);
      setErroGlobal(e instanceof ErroApi ? e.message : 'não foi possível apagar o bloco');
    }
  }

  // Duplica o bloco com o mesmo tipo e config (inclui imagem: copia maxFotos; e seção:
  // copia os subcampos). Vai pro fim da lista; o dono reordena com as setas se quiser.
  // Mesmo padrão otimista do adicionar: aparece na hora, o POST corre atrás.
  async function duplicar(campo: Campo): Promise<void> {
    setErroGlobal(null);
    const nomeCopia = `${campo.nome} (cópia)`.slice(0, 60);
    const dados = { nome: nomeCopia, tipo: campo.tipo, config: campo.config };
    const tmpId = `tmp_${crypto.randomUUID()}`;
    const ordemBase = campos.length === 0 ? 0 : Math.max(...campos.map((c) => c.ordem)) + 100;
    const tmp: Campo = { ...campo, id: tmpId, nome: nomeCopia, ordem: ordemBase };
    aoMudarCampos((cs) => [...cs, tmp]);
    void (async () => {
      try {
        const criado = await api.criarCampo(colecao.id, dados);
        aoMudarCampos((cs) => cs.map((c) => (c.id === tmpId ? criado : c)));
      } catch (e) {
        aoMudarCampos((cs) => cs.filter((c) => c.id !== tmpId));
        setErroGlobal(e instanceof ErroApi ? e.message : 'não foi possível duplicar o bloco');
      }
    })();
  }

  return (
    <div className="criar">
      <section className="painel">
        <h2 className="painel__titulo">Blocos da planilha</h2>

        {erroGlobal !== null && <p className="aviso-erro">{erroGlobal}</p>}

        <div className="blocos">
          {campos.map((campo, i) => {
            if (editando === campo.id) {
              return (
                <div key={campo.id} className="bloco bloco__editar">
                  <FormBloco
                    inicial={{ nome: campo.nome, tipo: campo.tipo, config: campo.config }}
                    textoAcao="Salvar"
                    encadear={false}
                    autoFoco
                    aoSalvar={async (d) => {
                      const atualizado = await api.editarCampo(campo.id, d);
                      aoMudarCampos((cs) => cs.map((c) => (c.id === campo.id ? atualizado : c)));
                      setEditando(null);
                    }}
                    aoCancelar={() => setEditando(null)}
                  />
                </div>
              );
            }
            if (confirmando === campo.id) {
              return (
                <div key={campo.id} className="confirma-inline">
                  <span className="confirma-inline__texto">Apagar “{campo.nome}”?</span>
                  <Botao variante="perigo" onClick={() => void apagar(campo.id)}>
                    Apagar
                  </Botao>
                  <Botao variante="fantasma" onClick={() => setConfirmando(null)}>
                    Cancelar
                  </Botao>
                </div>
              );
            }
            return (
              <div key={campo.id} className={`bloco${movido?.id === campo.id ? ' bloco--movido' : ''}`}>
                {campo.config.titulo !== undefined && campo.config.titulo !== '' && (
                  <div className="bloco__titulo-topo">{campo.config.titulo}</div>
                )}
                <div className="bloco__mover">
                  <button
                    ref={registrarBotao(campo.id, 'cima')}
                    type="button"
                    className="btn btn--icone seta"
                    aria-label={`Subir ${campo.nome}`}
                    disabled={i === 0}
                    onClick={() => mover(campo, 'cima')}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    ref={registrarBotao(campo.id, 'baixo')}
                    type="button"
                    className="btn btn--icone seta"
                    aria-label={`Descer ${campo.nome}`}
                    disabled={i === campos.length - 1}
                    onClick={() => mover(campo, 'baixo')}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
                <span className="bloco__icone">
                  <IconeTipo tipo={campo.tipo} />
                </span>
                <div className="bloco__corpo">
                  <div className="bloco__nome">{campo.nome}</div>
                  <div className="etiqueta bloco__sub">{subtitulo(campo)}</div>
                </div>
                <div className="bloco__acoes">
                  <button
                    type="button"
                    className="btn btn--icone"
                    aria-label={`Duplicar ${campo.nome}`}
                    onClick={() => void duplicar(campo)}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--icone"
                    aria-label={`Editar ${campo.nome}`}
                    onClick={() => setEditando(campo.id)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--icone"
                    aria-label={`Apagar ${campo.nome}`}
                    onClick={() => setConfirmando(campo.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <FormBloco
          inicial={{ nome: '', tipo: 'texto', config: {} }}
          textoAcao="Adicionar bloco"
          encadear
          aoSalvar={adicionar}
        />
      </section>

      <section className="painel">
        <h2 className="painel__titulo">O que a outra pessoa vai ver</h2>
        {campos.length === 0 ? (
          <p className="previa--vazia">Adicione blocos para ver a ficha aqui.</p>
        ) : (
          <div className="previa">
            {campos.map((campo) => (
              <div key={campo.id} className="previa__item">
                {campo.config.titulo !== undefined && campo.config.titulo !== '' && (
                  <h3 className="bloco-titulo">{campo.config.titulo}</h3>
                )}
                <label className="campo">
                  <span className="campo__rotulo">
                    {campo.nome}
                    {campo.config.obrigatorio === true ? ' *' : ''}
                  </span>
                {campo.tipo === 'imagem' ? (
                  <span className="previa__mat">
                    <Plus size={20} />
                  </span>
                ) : campo.tipo === 'secao' ? (
                  (campo.config.subcampos ?? []).length === 0 ? (
                    <span className="etiqueta">Seção sem campos</span>
                  ) : (
                    <div className="previa-secao">
                      {(campo.config.subcampos ?? []).map((s) => (
                        <label key={s.id} className="campo previa-secao__campo">
                          <span className="campo__rotulo">{s.nome}</span>
                          {s.tipo === 'imagem' ? (
                            <span className="previa__mat">
                              <Plus size={20} />
                            </span>
                          ) : (
                            <CampoValor
                              campo={{
                                id: s.id,
                                colecaoId: campo.colecaoId,
                                nome: s.nome,
                                tipo: s.tipo,
                                ordem: 0,
                                config: s.config,
                              }}
                              valor={undefined}
                              aoMudar={() => undefined}
                              desabilitado
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  )
                ) : (
                  <CampoValor campo={campo} valor={undefined} aoMudar={() => undefined} desabilitado />
                )}
                </label>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
