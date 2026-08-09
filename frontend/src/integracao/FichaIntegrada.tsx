import { useEffect, useRef, useState } from 'react';
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

// Referência REAL para preencher/mostrar ao criar a parte faltante. NUNCA usa a chave
// interna (`sep:`/`solto:`), que aparecia como "ref. sep:<uuid>:<uuid>"; nesse caso,
// deriva a referência do registro que já existe no grupo.
function refParaPreencher(chave: string, partes: ParteIntegrada[]): string {
  if (chave !== '' && !chave.startsWith('sep:') && !chave.startsWith('solto:')) return chave;
  for (const p of partes) {
    if (p.registro === null) continue;
    const t = tituloDoRegistro(camposDaParte(p), p.registro).trim();
    if (t !== '' && t !== 'Sem nome') return t.split(' | ')[0]?.trim() ?? '';
  }
  return '';
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
  /** Ao abrir vindo do "Preencher" da prévia, rola direto até esta planilha (índice). */
  focoInicial?: number;
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
  focoInicial,
}: Props): JSX.Element {
  const refs = useRef<(ParteEditorHandle | null)[]>([]);
  const [salvandoCount, setSalvandoCount] = useState(0);
  const [criandoIdx, setCriandoIdx] = useState<number | null>(null);
  const [derivando, setDerivando] = useState<null | 'branco' | 'copia'>(null);
  const [blocosIdx, setBlocosIdx] = useState<number | null>(null);
  const [salvandoBlocos, setSalvandoBlocos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Navegação entre as planilhas do grupo: detecta quais partes estão visíveis (na
  // área de rolagem da folha) e mostra, no rodapé, botões só das que NÃO estão à
  // vista, para pular direto até elas.
  const fichaRef = useRef<HTMLDivElement>(null);
  const parteRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [visiveis, setVisiveis] = useState<Set<number>>(new Set());

  useEffect(() => {
    const root = fichaRef.current?.closest('.folha__corpo') ?? null;
    const obs = new IntersectionObserver(
      (entries) => {
        setVisiveis((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const idx = Number((e.target as HTMLElement).dataset.idx);
            if (Number.isNaN(idx)) continue;
            if (e.isIntersecting) next.add(idx);
            else next.delete(idx);
          }
          return next;
        });
      },
      { root, threshold: 0.25 },
    );
    for (const el of parteRefs.current) if (el !== null) obs.observe(el);
    return () => obs.disconnect();
  }, [partes.length]);

  function irPara(indice: number): void {
    parteRefs.current[indice]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Ao abrir pelo "Preencher" da prévia (com uma planilha escolhida), rola direto até
  // ela para preencher sem procurar. Espera um tique para as partes montarem.
  useEffect(() => {
    if (focoInicial === undefined) return;
    const t = setTimeout(() => irPara(focoInicial), 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoInicial]);

  // Abrir para PREENCHER já cria o registro das planilhas do grupo que ainda não têm
  // um para esta referência — assim TODAS aparecem prontas para preencher/alterar, sem
  // precisar clicar em "criar registro". A referência é pré-preenchida quando existe.
  const autoCriarFeito = useRef(false);
  useEffect(() => {
    if (autoCriarFeito.current) return;
    autoCriarFeito.current = true;
    const faltantes = partes
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.registro === null);
    if (faltantes.length === 0) return;
    let vivo = true;
    void (async () => {
      const refCriar = refParaPreencher(chave, partes);
      for (const { p, i } of faltantes) {
        const alvo = alvoTitulo(p.colecao.campos);
        const valoresIniciais: Record<string, unknown> =
          refCriar !== '' && alvo !== undefined && alvo.subcampoId === undefined
            ? { [alvo.campoId]: refCriar }
            : {};
        try {
          const novo = await api.criarRegistro(p.colecao.id, valoresIniciais);
          if (!vivo) return;
          aoAtualizarParte(i, novo);
        } catch {
          /* se falhar, o botão "Criar registro aqui" continua como alternativa */
        }
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const refCriar = refParaPreencher(chave, partes);
      const valoresIniciais: Record<string, unknown> =
        refCriar !== '' && alvo !== undefined && alvo.subcampoId === undefined
          ? { [alvo.campoId]: refCriar }
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
  const refCriar = refParaPreencher(chave, partes);

  // Chips de navegação: só das planilhas do grupo que NÃO estão à vista (para pular
  // direto até elas). Some quando todas estão visíveis.
  const naoVisiveis =
    partes.length > 1 ? partes.map((_, i) => i).filter((i) => !visiveis.has(i)) : [];
  const navRodape =
    naoVisiveis.length > 0 ? (
      <div className="integ-nav" aria-label="Ir para planilha">
        <span className="integ-nav__rotulo">Ir para</span>
        {naoVisiveis.map((i) => {
          const p = partes[i];
          if (p === undefined) return null;
          return (
            <button
              key={p.colecao.id}
              type="button"
              className="integ-nav__chip"
              onClick={() => irPara(i)}
            >
              {p.colecao.nome}
            </button>
          );
        })}
      </div>
    ) : undefined;

  return (
    <FolhaInferior
      alta
      titulo={titulo}
      subtitulo={`${integracao.nome} — preenchimento unido`}
      onFechar={fechar}
      rodape={navRodape}
      acaoTopo={
        <span className={`integ-salvo${salvando ? '' : ' integ-salvo--ok'}`}>
          {salvando ? 'Salvando…' : 'Tudo salvo'}
        </span>
      }
    >
      <div className="ficha" ref={fichaRef}>
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
          <div
            key={parte.colecao.id}
            className="integ-parte"
            data-idx={indice}
            ref={(el) => {
              parteRefs.current[indice] = el;
            }}
          >
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
                    : refCriar === ''
                      ? 'Criar registro aqui'
                      : `Criar registro (ref. ${refCriar})`}
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
