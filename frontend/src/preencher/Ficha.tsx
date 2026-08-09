import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Trash2, CopyPlus, Copy, SlidersHorizontal } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Colecao, Registro } from '../../../shared/tipos';
import { useAuth } from '../contexto/Auth';
import { FolhaInferior } from '../ui/FolhaInferior';
import { Botao } from '../ui/Botao';
import { CampoValor } from './CampoValor';
import { SecaoEditor, linhasDe } from './SecaoEditor';
import { Grade } from '../imagens/Grade';
import { camposDoRegistro, keysDoCampo, tituloDoRegistro } from './derivarResumo';
import { valoresVaziosDe } from './valoresVazios';
import { CorpoRegistroEditor } from './CorpoRegistroEditor';
import { BotaoImportarFotos } from '../importar/BotaoImportarFotos';
import './preencher.css';

const fmtPreenchido = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface Props {
  colecao: Colecao;
  registro: Registro;
  aoFechar: () => void;
  aoAtualizar: (r: Registro) => void;
  aoApagar: (id: string) => void;
  /** Cria um novo registro a partir deste (mesma estrutura em branco ou duplicado). */
  aoCriarDerivado: (base: { campos?: Campo[]; valores: Record<string, unknown> }) => Promise<void>;
}

const DEBOUNCE_MS = 400;

export function Ficha({ colecao, registro, aoFechar, aoAtualizar, aoApagar, aoCriarDerivado }: Props): JSX.Element {
  const { estado } = useAuth();
  const usuario = estado.fase === 'logado' ? estado.usuario : null;
  // Qualquer usuário logado pode enviar o registro para a lixeira (soft-delete, dá para
  // restaurar). O backend também libera para qualquer usuário da conta.
  const podeApagar = usuario !== null;

  const [valores, setValores] = useState<Record<string, unknown>>(registro.valores);
  const valoresRef = useRef<Record<string, unknown>>(registro.valores);
  const sujosRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [criando, setCriando] = useState<null | 'branco' | 'copia'>(null);
  const [editandoBlocos, setEditandoBlocos] = useState(false);
  const [salvandoCorpo, setSalvandoCorpo] = useState(false);
  const [erroCorpo, setErroCorpo] = useState<string | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const fichaRef = useRef<HTMLDivElement>(null);

  // Corpo VIGENTE deste registro (o próprio, se independente; senão o da coleção).
  const corpo = camposDoRegistro(colecao, registro);
  // Se o registro já tem corpo próprio, os derivados herdam esse corpo; senão
  // herdam o corpo COMPARTILHADO da coleção (campos = undefined).
  const corpoParaDerivar = Array.isArray(registro.campos) ? corpo : undefined;

  useEffect(() => {
    setValores(registro.valores);
    valoresRef.current = registro.valores;
    sujosRef.current.clear();
    setConfirmando(false);
    setEditandoBlocos(false);
    setErroCorpo(null);
    setErroSalvar(null);
  }, [registro.id]);

  // Enter (e a seta "próximo" do teclado do iPhone) avança para o próximo campo, para
  // preencher rápido. Em <textarea> (parágrafo) o Enter continua criando nova linha.
  function aoTeclar(e: ReactKeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'Enter') return;
    const alvo = e.target as HTMLElement;
    if (alvo.tagName !== 'INPUT') return;
    const tipo = (alvo as HTMLInputElement).type;
    if (tipo === 'checkbox' || tipo === 'button' || tipo === 'submit') return;
    const cont = fichaRef.current;
    if (cont === null) return;
    const focaveis = Array.from(
      cont.querySelectorAll<HTMLElement>('input, select, textarea'),
    ).filter(
      (el) =>
        !(el as HTMLInputElement).disabled && el.tabIndex !== -1 && el.offsetParent !== null,
    );
    const idx = focaveis.indexOf(alvo);
    if (idx === -1) return;
    e.preventDefault();
    const prox = focaveis[idx + 1];
    if (prox !== undefined) prox.focus();
    else (alvo as HTMLInputElement).blur();
  }

  // aoAtualizar muda de identidade a cada render do pai. Guardamos numa ref para
  // o flush não se recriar (e o efeito de desmontagem não ficar reprocessando).
  const aoAtualizarRef = useRef(aoAtualizar);
  useEffect(() => {
    aoAtualizarRef.current = aoAtualizar;
  }, [aoAtualizar]);

  // Salva os campos "sujos" num único PATCH (o backend faz merge).
  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ids = [...sujosRef.current];
    if (ids.length === 0) return;
    sujosRef.current.clear();
    const parcial: Record<string, unknown> = {};
    for (const id of ids) parcial[id] = valoresRef.current[id];
    try {
      const atualizado = await api.editarRegistro(registro.id, parcial);
      // NÃO sobrescrevemos `valores`/`valoresRef` com a resposta: se o usuário digitou
      // durante o request, a resposta está defasada e apagaria/reescreveria o que ele
      // acabou de digitar. O estado local é a fonte da verdade; refletimos no pai com
      // os valores locais mais recentes (que já incluem o que foi digitado em voo).
      aoAtualizarRef.current({ ...atualizado, valores: valoresRef.current });
      setErroSalvar(null);
    } catch (e) {
      // devolve os ids à fila pra tentar de novo no próximo flush E avisa (antes
      // o erro sumia e o usuário achava que tinha salvado).
      for (const id of ids) sujosRef.current.add(id);
      setErroSalvar(
        e instanceof ErroApi
          ? `Não foi possível salvar: ${e.message}`
          : 'Não foi possível salvar (falha de conexão). Vamos tentar de novo.',
      );
    }
  }, [registro.id]);

  // Flush garantido ao desmontar (fechar por Esc, clique fora, X ou navegação).
  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  function marcar(id: string, v: unknown): void {
    const novo = { ...valoresRef.current, [id]: v };
    valoresRef.current = novo;
    setValores(novo);
    sujosRef.current.add(id);
  }

  function agendarFlush(): void {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }

  function fechar(): void {
    void flush();
    aoFechar();
  }

  async function novoEmBranco(): Promise<void> {
    setCriando('branco');
    await flush();
    await aoCriarDerivado({ campos: corpoParaDerivar, valores: valoresVaziosDe(corpo) });
    setCriando(null);
  }

  async function duplicarRegistro(): Promise<void> {
    setCriando('copia');
    await flush();
    // Duplica com os dados atuais (inclui as mesmas fotos, por referência).
    await aoCriarDerivado({ campos: corpoParaDerivar, valores: { ...valoresRef.current } });
    setCriando(null);
  }

  // Persiste o novo corpo (blocos) SÓ deste registro. O servidor poda os valores
  // que não cabem mais no corpo e devolve o registro já ajustado.
  async function salvarCorpo(novos: Campo[]): Promise<void> {
    setErroCorpo(null);
    setSalvandoCorpo(true);
    try {
      await flush();
      const atualizado = await api.salvarCorpoRegistro(registro.id, novos);
      valoresRef.current = atualizado.valores;
      setValores(atualizado.valores);
      sujosRef.current.clear();
      aoAtualizarRef.current(atualizado);
    } catch (e) {
      // Mostra o motivo REAL (ex.: "erro 400: validação", "erro 503", ou falha de
      // rede) para não esconder o que aconteceu — antes só dizia "não foi possível".
      setErroCorpo(
        e instanceof ErroApi
          ? `Não foi possível salvar os blocos: ${e.message}`
          : 'Não foi possível salvar os blocos (falha de conexão). Tente novamente.',
      );
    } finally {
      setSalvandoCorpo(false);
    }
  }

  // Reflete o registro depois de importar fotos (valores já atualizados no servidor).
  function aoImportarFotos(atualizados: Registro[]): void {
    const r = atualizados[0];
    if (r === undefined) return;
    valoresRef.current = r.valores;
    setValores(r.valores);
    sujosRef.current.clear();
    aoAtualizarRef.current(r);
  }

  const registroLocal: Registro = { ...registro, valores };

  return (
    <FolhaInferior
      titulo={tituloDoRegistro(corpo, registroLocal)}
      subtitulo={
        <>
          {colecao.nome}
          <br />
          {fmtPreenchido.format(new Date(registro.atualizadoEm))}
        </>
      }
      onFechar={fechar}
    >
      <div className="ficha" ref={fichaRef} onKeyDown={aoTeclar}>
        <div className="ficha__bloco ficha__acoes-topo">
          <Botao variante="padrao" onClick={() => void novoEmBranco()} disabled={criando !== null}>
            <CopyPlus size={16} />
            {criando === 'branco' ? 'Criando…' : 'Novo em branco (mesma estrutura)'}
          </Botao>
          <Botao variante="padrao" onClick={() => void duplicarRegistro()} disabled={criando !== null}>
            <Copy size={16} />
            {criando === 'copia' ? 'Duplicando…' : 'Duplicar registro'}
          </Botao>
          <Botao
            variante={editandoBlocos ? 'primario' : 'fantasma'}
            onClick={() => setEditandoBlocos((v) => !v)}
            aria-pressed={editandoBlocos}
          >
            <SlidersHorizontal size={16} />
            {editandoBlocos ? 'Concluir blocos' : 'Editar blocos'}
          </Botao>
          <BotaoImportarFotos
            colecao={colecao}
            registro={registroLocal}
            aoAntes={flush}
            aoConcluir={aoImportarFotos}
          />
        </div>

        {erroSalvar !== null && <p className="aviso-erro">{erroSalvar}</p>}

        {editandoBlocos && (
          <div className="ficha__bloco">
            {erroCorpo !== null && <p className="aviso-erro">{erroCorpo}</p>}
            <CorpoRegistroEditor
              colecaoId={colecao.id}
              campos={corpo}
              ocupado={salvandoCorpo}
              aoAplicar={(novos) => void salvarCorpo(novos)}
            />
          </div>
        )}

        {corpo.map((campo) => (
          <div key={campo.id} className="ficha__bloco">
            {campo.config.titulo !== undefined && campo.config.titulo !== '' && (
              <h3 className="bloco-titulo">{campo.config.titulo}</h3>
            )}
            <span className="ficha__rotulo">
              {campo.nome}
              {campo.config.obrigatorio === true ? ' *' : ''}
            </span>
            {campo.tipo === 'imagem' ? (
              <Grade
                registroId={registro.id}
                campo={campo}
                keys={keysDoCampo(registroLocal, campo.id)}
                aoMudar={(keys) => {
                  marcar(campo.id, keys);
                  void flush();
                }}
              />
            ) : campo.tipo === 'secao' ? (
              <SecaoEditor
                campo={campo}
                registroId={registro.id}
                linhas={linhasDe(valores[campo.id])}
                aoMudar={(linhas) => {
                  marcar(campo.id, linhas);
                  agendarFlush();
                }}
              />
            ) : (
              <CampoValor
                campo={campo}
                valor={valores[campo.id]}
                aoMudar={(v) => {
                  marcar(campo.id, v);
                  agendarFlush();
                }}
                aoSairFoco={() => void flush()}
              />
            )}
          </div>
        ))}

        {podeApagar && (
          <div className="ficha__bloco">
            {confirmando ? (
              <div className="confirma-inline">
                <span className="confirma-inline__texto">
                  Mover para a lixeira? Dados e fotos ficam salvos até apagar definitivo.
                </span>
                <Botao
                  variante="perigo"
                  onClick={() => {
                    void api.apagarRegistro(registro.id).then(() => aoApagar(registro.id));
                  }}
                >
                  Mover para lixeira
                </Botao>
                <Botao variante="fantasma" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Botao>
              </div>
            ) : (
              <Botao variante="perigo" onClick={() => setConfirmando(true)}>
                <Trash2 size={16} />
                Enviar para lixeira
              </Botao>
            )}
          </div>
        )}
      </div>
    </FolhaInferior>
  );
}
