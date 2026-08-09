import { useRef, useState } from 'react';
import { Copy, CopyPlus, PlusCircle, Save, SlidersHorizontal } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import type { Campo, Integracao, Registro } from '../../../shared/tipos';
import { FolhaInferior } from '../ui/FolhaInferior';
import { Botao } from '../ui/Botao';
import { alvoTitulo, camposDoRegistro, tituloDoRegistro } from '../preencher/derivarResumo';
import { CorpoRegistroEditor } from '../preencher/CorpoRegistroEditor';
import { ParteEditor, type ParteEditorHandle } from './ParteEditor';
import { camposDaParte, chaveReferencia, type ParteIntegrada, type RegistroIntegrado } from './merge';

// Título do registro unido a partir das referências reais das partes (sem repetir).
// Nunca mostra a chave interna (`sep:`/`solto:`), que virava "Ref. sep:<uuid>".
function tituloUnificado(chave: string, partes: ParteIntegrada[]): string {
  const refs: string[] = [];
  const vistos = new Set<string>();
  for (const p of partes) {
    if (p.registro === null) continue;
    const t = tituloDoRegistro(camposDaParte(p), p.registro).trim();
    if (t === '' || t === 'Sem nome') continue;
    for (const bruta of t.split(' | ')) {
      const ref = bruta.trim();
      if (ref === '' || vistos.has(ref.toLowerCase())) continue;
      vistos.add(ref.toLowerCase());
      refs.push(ref);
    }
  }
  if (refs.length > 0) return refs.join(' | ');
  return chave === '' ? 'Novo registro unificado' : 'Sem referência';
}

interface Props {
  integracao: Integracao;
  chave: string;
  partes: ParteIntegrada[];
  aoFechar: () => void;
  aoAtualizarParte: (indice: number, registro: Registro) => void;
  /** Abre um novo grupo unido em branco (novo registro unificado). */
  aoNovoUnificado: () => void;
  /** Substitui o grupo aberto por outro (usado após duplicar). */
  aoAbrirGrupo: (grupo: RegistroIntegrado) => void;
}

// Editor UNIFICADO: os blocos de todas as planilhas do grupo, no mesmo corpo, na
// ordem escolhida. Cada campo é salvo no SEU registro (uma planilha), então nada
// no banco é misturado. Autosalva com debounce (edita um a um) e tem "Salvar tudo"
// (altera todos de uma vez). Planilha sem registro para a referência ganha um
// botão para criar o registro já com a referência preenchida. Também dá para criar
// um novo registro unificado em branco, duplicar o registro unido inteiro e editar
// os blocos de cada parte — a mesma lógica da planilha normal.
export function FichaIntegrada({
  integracao,
  chave,
  partes,
  aoFechar,
  aoAtualizarParte,
  aoNovoUnificado,
  aoAbrirGrupo,
}: Props): JSX.Element {
  const refs = useRef<(ParteEditorHandle | null)[]>([]);
  const [salvandoCount, setSalvandoCount] = useState(0);
  const [criandoIdx, setCriandoIdx] = useState<number | null>(null);
  const [derivando, setDerivando] = useState<null | 'branco' | 'copia'>(null);
  const [blocosIdx, setBlocosIdx] = useState<number | null>(null);
  const [salvandoBlocos, setSalvandoBlocos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function marcarSalvando(delta: number): void {
    setSalvandoCount((n) => Math.max(0, n + delta));
  }

  async function salvarTudo(): Promise<void> {
    await Promise.all(refs.current.map((r) => r?.flush() ?? Promise.resolve()));
  }

  function fechar(): void {
    void salvarTudo().finally(aoFechar);
  }

  // Valores VIGENTES de uma parte (inclui o que ainda não foi salvo no editor aberto).
  function valoresVigentes(indice: number, parte: ParteIntegrada): Record<string, unknown> {
    const doEditor = refs.current[indice]?.valores();
    if (doEditor !== undefined) return doEditor;
    return parte.registro?.valores ?? {};
  }

  // Cria o registro faltante nesta planilha, já com a referência preenchida (quando
  // há uma), para o preenchimento ficar tudo num lugar só.
  async function criarParte(indice: number): Promise<void> {
    const parte = partes[indice];
    if (parte === undefined || parte.registro !== null || criandoIdx !== null) return;
    const alvo = alvoTitulo(parte.colecao.campos);
    setCriandoIdx(indice);
    setErro(null);
    try {
      const valoresIniciais: Record<string, unknown> =
        chave !== '' && alvo !== undefined && alvo.subcampoId === undefined
          ? { [alvo.campoId]: chave }
          : {};
      const novo = await api.criarRegistro(parte.colecao.id, valoresIniciais);
      aoAtualizarParte(indice, novo);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível criar o registro');
    } finally {
      setCriandoIdx(null);
    }
  }

  // Novo registro unificado em branco: salva o que estiver aberto e abre um grupo novo.
  async function novoEmBranco(): Promise<void> {
    setDerivando('branco');
    setErro(null);
    try {
      await salvarTudo();
      aoNovoUnificado();
    } finally {
      setDerivando(null);
    }
  }

  // Duplica o registro UNIDO inteiro: cria uma cópia em cada planilha que tem
  // registro, com os mesmos valores (e o mesmo corpo próprio, se houver), e abre a
  // cópia já unida.
  async function duplicarUnido(): Promise<void> {
    setDerivando('copia');
    setErro(null);
    try {
      await salvarTudo();
      const novas: ParteIntegrada[] = [];
      for (let i = 0; i < partes.length; i += 1) {
        const parte = partes[i];
        if (parte === undefined) continue;
        if (parte.registro === null) {
          novas.push({ colecao: parte.colecao, registro: null });
          continue;
        }
        const campos = Array.isArray(parte.registro.campos)
          ? camposDoRegistro(parte.colecao, parte.registro)
          : undefined;
        const copia = await api.criarRegistro(
          parte.colecao.id,
          { ...valoresVigentes(i, parte) },
          campos,
        );
        novas.push({ colecao: parte.colecao, registro: copia });
      }
      const primeira = novas.find((p) => p.registro !== null);
      const novaChave =
        primeira?.registro != null
          ? chaveReferencia(camposDaParte(primeira), primeira.registro) ?? chave
          : chave;
      aoAbrirGrupo({ chave: novaChave, partes: novas });
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível duplicar');
    } finally {
      setDerivando(null);
    }
  }

  // Persiste o novo corpo (blocos) SÓ do registro desta parte. O servidor poda os
  // valores que não cabem mais e devolve o registro já ajustado.
  async function salvarBlocos(indice: number, novos: Campo[]): Promise<void> {
    const parte = partes[indice];
    if (parte?.registro == null) return;
    setSalvandoBlocos(true);
    setErro(null);
    try {
      await refs.current[indice]?.flush();
      const atualizado = await api.salvarCorpoRegistro(parte.registro.id, novos);
      // Re-sincroniza o editor da parte com os valores JÁ podados pelo servidor;
      // sem isto, o próximo autosave reenviava valores velhos e a edição de
      // blocos "voltava" (bug de não salvar em integradas).
      refs.current[indice]?.sincronizar(atualizado.valores);
      aoAtualizarParte(indice, atualizado);
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? `Não foi possível salvar os blocos de ${parte.colecao.nome}: ${e.message}`
          : `Não foi possível salvar os blocos de ${parte.colecao.nome} (falha de conexão). Tente novamente.`,
      );
    } finally {
      setSalvandoBlocos(false);
    }
  }

  const salvando = salvandoCount > 0;
  const ocupado = derivando !== null;
  const titulo = tituloUnificado(chave, partes);

  return (
    <FolhaInferior
      titulo={titulo}
      subtitulo={`${integracao.nome} — preenchimento unido`}
      onFechar={fechar}
      acaoTopo={
        <span className={`integ-salvo${salvando ? '' : ' integ-salvo--ok'}`}>
          {salvando ? 'Salvando…' : 'Tudo salvo'}
        </span>
      }
    >
      <div className="ficha">
        <div className="ficha__bloco ficha__acoes-topo">
          <Botao variante="primario" onClick={() => void salvarTudo()} disabled={salvando || ocupado}>
            <Save size={16} />
            Salvar tudo
          </Botao>
          <Botao variante="padrao" onClick={() => void novoEmBranco()} disabled={ocupado}>
            <CopyPlus size={16} />
            {derivando === 'branco' ? 'Abrindo…' : 'Novo em branco'}
          </Botao>
          <Botao variante="padrao" onClick={() => void duplicarUnido()} disabled={ocupado}>
            <Copy size={16} />
            {derivando === 'copia' ? 'Duplicando…' : 'Duplicar unificado'}
          </Botao>
        </div>

        {erro !== null && <p className="aviso-erro">{erro}</p>}

        {partes.map((parte, indice) => (
          <div key={parte.colecao.id}>
            <div
              className={`integ-parte-rotulo${parte.registro === null ? ' integ-parte-rotulo--ausente' : ''}`}
            >
              <span>
                {parte.colecao.nome}
                {parte.registro === null && ' · sem registro para esta referência'}
              </span>
            </div>

            {parte.registro !== null && (
              <div className="ficha__bloco ficha__acoes-topo">
                <Botao
                  variante={blocosIdx === indice ? 'primario' : 'padrao'}
                  onClick={() => setBlocosIdx((v) => (v === indice ? null : indice))}
                  aria-pressed={blocosIdx === indice}
                >
                  <SlidersHorizontal size={16} />
                  {blocosIdx === indice
                    ? 'Concluir blocos'
                    : `Editar blocos de ${parte.colecao.nome}`}
                </Botao>
              </div>
            )}

            {parte.registro !== null && blocosIdx === indice && (
              <div className="ficha__bloco">
                <CorpoRegistroEditor
                  colecaoId={parte.colecao.id}
                  campos={camposDaParte(parte)}
                  ocupado={salvandoBlocos}
                  aoAplicar={(novos) => void salvarBlocos(indice, novos)}
                />
              </div>
            )}

            {parte.registro === null ? (
              <div className="ficha__bloco">
                <Botao
                  variante="padrao"
                  onClick={() => void criarParte(indice)}
                  disabled={criandoIdx !== null}
                >
                  <PlusCircle size={16} />
                  {criandoIdx === indice
                    ? 'Criando…'
                    : chave === ''
                      ? 'Criar registro aqui'
                      : `Criar registro (ref. ${chave})`}
                </Botao>
              </div>
            ) : (
              <ParteEditor
                ref={(el) => {
                  refs.current[indice] = el;
                }}
                colecao={parte.colecao}
                registro={parte.registro}
                aoAtualizar={(r) => aoAtualizarParte(indice, r)}
                aoSalvando={(s) => marcarSalvando(s ? 1 : -1)}
                aoErro={setErro}
              />
            )}
          </div>
        ))}
      </div>
    </FolhaInferior>
  );
}
