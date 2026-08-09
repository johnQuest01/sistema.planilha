import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ImageOff, PencilLine, Plus, Search, Trash2 } from 'lucide-react';
import { api, cursorDeRegistro, ErroApi } from '../api/cliente';
import { exportarIntegracao, type ProgressoExport } from '../backup/exportarColecao';
import { assinarRealtime } from '../api/realtime';
import { chaveIntegrado, gravarCache, lerCache } from '../api/cache';
import { useAuth } from '../contexto/Auth';
import type { Colecao, Integracao, Registro } from '../../../shared/tipos';
import { Botao } from '../ui/Botao';
import { Segmentado } from '../ui/Segmentado';
import { Carregando } from '../ui/Carregando';
import { FolhaInferior } from '../ui/FolhaInferior';
import { TopoApp } from './TopoApp';
import { camposDoRegistro, capaDoRegistro, tituloDoRegistro } from '../preencher/derivarResumo';
import { valoresVaziosDe } from '../preencher/valoresVazios';
import {
  chaveReferencia,
  camposDaParte,
  codigoInicial,
  type RegistroIntegrado,
} from '../integracao/merge';
import { FichaIntegrada } from '../integracao/FichaIntegrada';
import { Miniatura } from '../preencher/Miniatura';
import { RegistroPreview } from '../preencher/RegistroPreview';
import { useFecharAoVoltar } from '../ui/useVoltar';
import './telas.css';
import './integracao.css';
import '../preencher/preencher.css';

const DEBOUNCE_MS = 300;
const PAGINA = 20;

// Agrupa registros de várias coleções pela referência (código inicial). Cada grupo
// tem uma parte por coleção, na ordem do grupo (null quando não há registro pra ela).
// Registros SEM referência detectável não somem: viram grupos "soltos" (só eles),
// para aparecerem no modo "Geral" (tudo das planilhas).
function agruparPorReferencia(
  cols: Colecao[],
  porColecao: Registro[][],
): { grupos: RegistroIntegrado[]; soltos: RegistroIntegrado[] } {
  // Por chave, guardamos uma LISTA de registros POR planilha (não um só). Assim,
  // quando a mesma planilha tem 2+ registros com o mesmo código (ex.: dois "4506"
  // no Caderno = produtos diferentes), NENHUM some — cada um vira um cartão.
  const mapa = new Map<string, Registro[][]>();
  const soltos: RegistroIntegrado[] = [];
  cols.forEach((c, idx) => {
    for (const r of porColecao[idx] ?? []) {
      const chave = chaveReferencia(camposDoRegistro(c, r), r);
      if (chave === null) {
        soltos.push({
          chave: `solto:${c.id}:${r.id}`,
          partes: cols.map((cc, i) => ({ colecao: cc, registro: i === idx ? r : null })),
        });
        continue;
      }
      let listas = mapa.get(chave);
      if (listas === undefined) {
        listas = cols.map(() => []);
        mapa.set(chave, listas);
      }
      listas[idx]?.push(r);
    }
  });
  // "Zip": para cada chave, emite max(qtd por planilha) cartões, casando por posição
  // (Caderno[i] com Modelagem[i]); sobras ficam com a outra parte null. Todo
  // registro aparece exatamente uma vez.
  const grupos: RegistroIntegrado[] = [];
  for (const [chave, listas] of mapa) {
    const max = Math.max(...listas.map((l) => l.length));
    for (let i = 0; i < max; i += 1) {
      grupos.push({
        chave,
        partes: cols.map((cc, ci) => ({ colecao: cc, registro: listas[ci]?.[i] ?? null })),
      });
    }
  }
  return { grupos, soltos };
}

// Quantas planilhas do grupo têm registro (2+ = unido de verdade).
function partesPresentes(grupo: RegistroIntegrado): number {
  return grupo.partes.filter((p) => p.registro !== null).length;
}

// Título do grupo unido: junta as referências das partes SEM repetir a mesma. Como
// Caderno e Modelagem compartilham o código (ex.: "4871"), a referência aparece uma
// vez só (mantém a primeira/mais completa), não "4871 bory | 4871 curto".
function tituloDoGrupo(grupo: RegistroIntegrado): string {
  const vistos = new Set<string>();
  const refs: string[] = [];
  for (const p of grupo.partes) {
    if (p.registro === null) continue;
    const t = tituloDoRegistro(camposDaParte(p), p.registro).trim();
    if (t === '' || t === 'Sem nome') continue;
    for (const bruta of t.split(' | ')) {
      const ref = bruta.trim();
      if (ref === '') continue;
      const cod = codigoInicial(ref);
      const dedupe = cod !== '' ? cod : ref.toLowerCase();
      if (vistos.has(dedupe)) continue;
      vistos.add(dedupe);
      refs.push(ref);
    }
  }
  if (refs.length === 0) {
    if (grupo.chave === '') return 'Novo registro';
    // Chaves internas (`solto:`/`sep:` = id de coleção:registro) nunca viram título:
    // antes escapava como "Ref. sep:<uuid>:<uuid>" (os "caracteres estranhos").
    if (grupo.chave.startsWith('solto:') || grupo.chave.startsWith('sep:')) return 'Sem referência';
    return `Ref. ${grupo.chave}`;
  }
  return refs.join(' | ');
}

function capaDoGrupo(grupo: RegistroIntegrado): string | null {
  for (const p of grupo.partes) {
    if (p.registro === null) continue;
    const capa = capaDoRegistro(camposDaParte(p), p.registro);
    if (capa !== null) return capa;
  }
  return null;
}

// Snapshot da planilha unificada guardado em cache (SWR) para reabrir instantâneo.
interface IntegradoSnap {
  integracao: Integracao;
  colecoes: Colecao[];
  regs: Registro[][];
}

export function Integrado(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { estado } = useAuth();
  // Qualquer usuário logado pode enviar registros para a lixeira (soft-delete),
  // igual às planilhas normais (RegistroPreview).
  const podeApagar = estado.fase === 'logado';
  // Semeia com o último snapshot conhecido para pintar na hora (sem skeleton).
  const snapInicial = id !== undefined ? lerCache<IntegradoSnap>(chaveIntegrado(id)) : null;
  const [integracao, setIntegracao] = useState<Integracao | null>(snapInicial?.integracao ?? null);
  const [colecoes, setColecoes] = useState<Colecao[] | null>(snapInicial?.colecoes ?? null);
  const [inacessiveis, setInacessiveis] = useState<number>(0);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  // Registros CRUS por planilha (mesma ordem de `colecoes`). Os grupos unidos são
  // derivados disso — assim, quando um registro chega/atualiza pelo realtime, o
  // casamento é recalculado AO VIVO.
  const [regs, setRegs] = useState<Registro[][] | null>(snapInicial?.regs ?? null);
  const [filtro, setFiltro] = useState<'unidos' | 'todos' | 'geral'>('unidos');
  const [termo, setTermo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<RegistroIntegrado[] | null>(null);

  const [previa, setPrevia] = useState<RegistroIntegrado | null>(null);
  const [editando, setEditando] = useState<RegistroIntegrado | null>(null);
  const [criandoNovo, setCriandoNovo] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [progExport, setProgExport] = useState<ProgressoExport | null>(null);
  // Ao abrir a edição pelo "Preencher" da prévia, rola direto até esta planilha.
  const [focoEditor, setFocoEditor] = useState<number | undefined>(undefined);

  // Botão VOLTAR (nativo/gesto) fecha a prévia ou o editor unido em vez de sair da
  // planilha unificada. Um booleano só: a troca prévia→editar não mexe no histórico.
  useFecharAoVoltar(previa !== null || editando !== null, () => {
    setPrevia(null);
    setEditando(null);
  });

  // Carrega a integração, as coleções membro e TODOS os registros — tudo em um
  // fluxo SWR: pinta o cache na hora (se houver) e revalida em segundo plano, para
  // reabrir a Oficina sem espera. Coleções com senha/bloqueadas são puladas.
  useEffect(() => {
    if (id === undefined) return;
    let vivo = true;
    // Re-semeia do cache ao trocar de integração (evita mostrar dados da anterior).
    const cache = lerCache<IntegradoSnap>(chaveIntegrado(id));
    setIntegracao(cache?.integracao ?? null);
    setColecoes(cache?.colecoes ?? null);
    setRegs(cache?.regs ?? null);
    setInacessiveis(0);
    setErroCarga(null);
    void (async () => {
      try {
        const integ = await api.obterIntegracao(id);
        if (!vivo) return;
        setIntegracao(integ);
        const resultados = await Promise.allSettled(
          integ.colecaoIds.map((cid) => api.obterColecao(cid)),
        );
        if (!vivo) return;
        const ok: Colecao[] = [];
        let semAcesso = 0;
        for (const r of resultados) {
          if (r.status === 'fulfilled' && !r.value.bloqueada) ok.push(r.value);
          else semAcesso += 1;
        }
        setColecoes(ok);
        setInacessiveis(semAcesso);
        // Registros de todas as planilhas (paginando por cursor). Se falhar, mantém
        // o que já estava (stale) em vez de derrubar a tela.
        try {
          const porColecao = await Promise.all(ok.map((c) => carregarTodosDe(c.id)));
          if (!vivo) return;
          setRegs(porColecao);
          gravarCache<IntegradoSnap>(chaveIntegrado(id), {
            integracao: integ,
            colecoes: ok,
            regs: porColecao,
          });
        } catch {
          if (!vivo) return;
          setRegs((prev) => prev ?? ok.map(() => []));
        }
      } catch (e) {
        if (!vivo) return;
        setErroCarga(e instanceof ErroApi ? e.message : 'falha ao carregar a integração');
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const primaria = colecoes?.[0] ?? null;

  // Uma página com RETRY: sem isso, um único erro de rede (o banco costuma ficar
  // longe → blips/timeouts) fazia o .catch devolver [] e a paginação PARAVA ali,
  // truncando SILENCIOSAMENTE o resto da coleção — o total unido aparecia menor do
  // que o real. Agora tenta de novo antes de desistir (e, se falhar de vez, propaga
  // para o chamador tratar, em vez de mostrar um número errado sem avisar).
  async function listarPaginaComRetry(colecaoId: string, cursor: number | string | undefined): Promise<Registro[]> {
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      try {
        return await api.listarRegistros(colecaoId, cursor);
      } catch (e) {
        ultimoErro = e;
        await new Promise((r) => setTimeout(r, 300 * (tentativa + 1)));
      }
    }
    throw ultimoErro;
  }

  // Carrega TODOS os registros de uma coleção (paginando por cursor até o fim).
  // Guarda contra loop: se o cursor não avança (ex.: backend sem `ordem`), para —
  // sem isso, uma coleção com 20+ registros dispararia centenas de requests.
  async function carregarTodosDe(colecaoId: string): Promise<Registro[]> {
    const acc: Registro[] = [];
    let cursor: number | string | undefined;
    for (let i = 0; i < 500; i += 1) {
      const pagina = await listarPaginaComRetry(colecaoId, cursor);
      acc.push(...pagina);
      if (pagina.length < PAGINA) break;
      const ultimo = pagina[pagina.length - 1];
      if (ultimo === undefined) break;
      const proximo = cursorDeRegistro(ultimo);
      if (proximo === cursor) break; // cursor não avançou: evita loop/rate limit
      cursor = proximo;
    }
    return acc;
  }

  // Deriva os grupos unidos (e os soltos) dos registros crus. Recalcula sozinho
  // sempre que `regs` muda — inclusive por eventos do realtime.
  // `separados` = TODOS os registros, um cartão por registro (sem unir): é o que o
  // modo "Geral" mostra, para a contagem bater com o total real das planilhas
  // (ex.: 131 + 26 = 157), em vez de contar cartões unidos.
  const { todos, separados } = useMemo<{
    todos: RegistroIntegrado[] | null;
    separados: RegistroIntegrado[];
  }>(() => {
    if (regs === null || colecoes === null) return { todos: null, separados: [] };
    const r = agruparPorReferencia(colecoes, regs);
    r.grupos.sort((a, b) => partesPresentes(b) - partesPresentes(a));
    const sep: RegistroIntegrado[] = [];
    colecoes.forEach((c, idx) => {
      for (const reg of regs[idx] ?? []) {
        sep.push({
          chave: `sep:${c.id}:${reg.id}`,
          partes: colecoes.map((cc, i) => ({ colecao: cc, registro: i === idx ? reg : null })),
        });
      }
    });
    return { todos: r.grupos, separados: sep };
  }, [regs, colecoes]);

  // Upsert/remoção de um registro na planilha certa (por índice). Idempotente por id,
  // então o eco da própria ação não duplica.
  function aplicarNaLista(indice: number, acao: 'upsert' | 'remover', registro: Registro): void {
    setRegs((atual) => {
      if (atual === null) return atual;
      const copia = atual.slice();
      const lista = copia[indice] ?? [];
      if (acao === 'remover') {
        copia[indice] = lista.filter((x) => x.id !== registro.id);
      } else {
        copia[indice] = lista.some((x) => x.id === registro.id)
          ? lista.map((x) => (x.id === registro.id ? registro : x))
          : [registro, ...lista];
      }
      return copia;
    });
  }

  // AO VIVO: aplica o que qualquer pessoa (ou outra aba) cria/edita/apaga nas
  // planilhas do grupo — preenchendo separado OU pela ficha unida. Os grupos são
  // recalculados pelo memo, então o casamento em "Unidos" aparece na hora.
  useEffect(() => {
    const cols = colecoes;
    if (cols === null || cols.length === 0) return;
    const indicePorColecao = new Map(cols.map((c, i) => [c.id, i]));
    const cancelar = assinarRealtime((msg) => {
      if (msg.tipo !== 'registro') return;
      const idx = indicePorColecao.get(msg.colecaoId);
      if (idx === undefined) return;
      if (msg.acao === 'apagado') {
        aplicarNaLista(idx, 'remover', { id: msg.registroId } as Registro);
        return;
      }
      aplicarNaLista(idx, 'upsert', msg.registro as Registro);
    });
    return cancelar;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colecoes]);

  // Monta os grupos unidos por referência a partir de um termo de busca: procura em
  // TODAS as planilhas do grupo e junta os registros cuja referência (código) bate.
  async function montarGrupos(consulta: string): Promise<RegistroIntegrado[]> {
    const cols = colecoes ?? [];
    if (cols.length === 0) return [];
    const porColecao = await Promise.all(
      cols.map((c) => api.buscarRegistros(c.id, consulta).catch(() => [] as Registro[])),
    );
    const { grupos, soltos: sem } = agruparPorReferencia(cols, porColecao);
    // Na busca mostramos os que casaram e também os soltos que bateram no termo.
    return [...grupos, ...sem];
  }

  // Busca com debounce.
  useEffect(() => {
    const consulta = termo.trim();
    if (consulta === '') {
      setResultados(null);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const t = setTimeout(() => {
      let vivo = true;
      void montarGrupos(consulta)
        .then((gs) => {
          if (!vivo) return;
          setResultados(gs);
          // "Já vem aberto": achou exatamente 1 -> abre a prévia completa direto.
          if (gs.length === 1 && gs[0] !== undefined) setPrevia(gs[0]);
        })
        .finally(() => {
          if (vivo) setBuscando(false);
        });
      return () => {
        vivo = false;
      };
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, colecoes]);

  // Atualiza uma parte (após edição/criação): reflete na prévia e no editor abertos
  // (resposta imediata) e na lista crua (o memo recalcula os grupos). O eco do
  // realtime é idempotente, então não duplica.
  function atualizarParte(indice: number, registro: Registro): void {
    const aplica = (g: RegistroIntegrado | null): RegistroIntegrado | null => {
      if (g === null) return g;
      const partes = g.partes.map((p, i) => (i === indice ? { ...p, registro } : p));
      return { ...g, partes };
    };
    setEditando(aplica);
    setPrevia(aplica);
    aplicarNaLista(indice, 'upsert', registro);
  }

  // Novo registro unificado EM BRANCO: cria um registro vazio na planilha do topo e
  // abre a ficha unida; as demais planilhas ganham "Criar registro aqui". Assim o
  // preenchimento começa em branco, tudo num lugar só.
  async function novoUnificado(): Promise<void> {
    const cols = colecoes ?? [];
    const prim = cols[0];
    if (prim === undefined || criandoNovo) return;
    setCriandoNovo(true);
    try {
      // Herda a ESTRUTURA (blocos) do registro mais recente da planilha do topo, em
      // branco — assim o novo unificado nasce com o corpo recente (não um modelo antigo).
      const base = regs?.[0]?.[0];
      const corpo = base !== undefined ? camposDoRegistro(prim, base) : prim.campos;
      const proprio =
        base !== undefined && Array.isArray(base.campos) && base.campos.length > 0 ? corpo : undefined;
      const novo = await api.criarRegistro(prim.id, valoresVaziosDe(corpo), proprio);
      const grupo: RegistroIntegrado = {
        chave: '',
        partes: cols.map((c, i) => ({ colecao: c, registro: i === 0 ? novo : null })),
      };
      aplicarNaLista(0, 'upsert', novo);
      setEditando(grupo);
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : 'não foi possível criar o registro');
    } finally {
      setCriandoNovo(false);
    }
  }

  // Baixa um backup da planilha UNIDA inteira (todas as membros + a união), num único
  // .zip que o botão "Importar de arquivo" (na tela inicial) recria igualzinho.
  async function baixarBackup(): Promise<void> {
    const cols = colecoes ?? [];
    if (integracao === null || cols.length === 0 || exportando) return;
    setExportando(true);
    try {
      await exportarIntegracao(integracao.nome, cols, setProgExport);
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : 'não foi possível baixar o backup');
    } finally {
      setExportando(false);
      setProgExport(null);
    }
  }

  function textoExport(p: ProgressoExport | null): string {
    if (p === null) return 'Baixando…';
    if (p.fase === 'carregando') return 'Lendo os registros…';
    if (p.fase === 'imagens') {
      const onde = p.planilha !== undefined ? ` ${p.planilha}` : '';
      return `Baixando imagens${onde}… ${p.feito}/${p.total}`;
    }
    if (p.fase === 'compactando') return 'Compactando o .zip…';
    return 'Pronto!';
  }

  // Apaga o registro unificado: envia para a lixeira TODAS as partes presentes do
  // grupo (ex.: Modelagem + Caderno do Hugo de uma mesma referência). A remoção na
  // lista crua faz os grupos recalcularem; o eco do realtime é idempotente.
  async function apagarGrupo(grupo: RegistroIntegrado): Promise<void> {
    const alvos: { indice: number; reg: Registro }[] = [];
    grupo.partes.forEach((p, i) => {
      if (p.registro !== null) alvos.push({ indice: i, reg: p.registro });
    });
    for (const { indice, reg } of alvos) {
      await api.apagarRegistro(reg.id);
      aplicarNaLista(indice, 'remover', reg);
    }
  }

  // Apagar a partir da PRÉVIA (folha inferior): fecha a folha ao concluir.
  async function apagarNaPrevia(grupo: RegistroIntegrado): Promise<void> {
    await apagarGrupo(grupo);
    setPrevia(null);
  }

  if (erroCarga !== null) {
    return (
      <div className="pagina">
        <TopoApp />
        <div className="faixa">
          <p className="aviso-erro">{erroCarga}</p>
          <Link to="/integracoes" className="link-texto">
            ← Voltar às integrações
          </Link>
        </div>
      </div>
    );
  }

  if (integracao === null || colecoes === null) return <Carregando />;

  const unidosLista = todos === null ? [] : todos.filter((g) => partesPresentes(g) >= 2);
  // "Geral" = cada registro separado (sem unir) → conta o total real de registros.
  const geralLista = separados;
  const listaTodos =
    todos === null
      ? null
      : filtro === 'unidos'
        ? unidosLista
        : filtro === 'todos'
          ? todos
          : geralLista;

  return (
    <div className="pagina pagina--app">
      <TopoApp />
      <div className="faixa faixa--app">
        <div className="inicio-cabeca">
          <h1 className="inicio-cabeca__titulo">{integracao.nome}</h1>
          <Botao variante="primario" onClick={() => void novoUnificado()} disabled={criandoNovo || primaria === null}>
            <Plus size={16} /> {criandoNovo ? 'Criando…' : 'Novo registro unificado'}
          </Botao>
          {podeApagar && (
            <Botao
              variante="padrao"
              onClick={() => void baixarBackup()}
              disabled={exportando || (colecoes?.length ?? 0) === 0}
            >
              <Download size={16} /> {exportando ? textoExport(progExport) : 'Baixar backup'}
            </Botao>
          )}
          <Link to="/integracoes" className="btn">
            <ArrowLeft size={16} /> Integrações
          </Link>
        </div>

        <div className="integ-topo-busca">
          <div className="integ-fonte">
            {colecoes.map((c) => (
              <span key={c.id} className="integ-fonte">
                <span className="integ-fonte__ponto" />
                {c.nome}
              </span>
            ))}
          </div>
          {inacessiveis > 0 && (
            <p className="aviso-erro">
              {inacessiveis} planilha(s) do grupo estão bloqueadas por senha e ficaram de fora.
            </p>
          )}
          <div style={{ position: 'relative' }}>
            <Search
              size={18}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}
              aria-hidden
            />
            <input
              className="campo__controle"
              style={{ paddingLeft: 38 }}
              placeholder="Buscar por referência (ex.: 4871)…"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              inputMode="search"
            />
          </div>
        </div>

        {resultados !== null ? (
          <div className="rolagem">
            {buscando ? (
              <p className="integ-dica">Buscando…</p>
            ) : resultados.length === 0 ? (
              <p className="integ-vazio">Nenhum registro com esses dados nas planilhas do grupo.</p>
            ) : (
              // Resultados como cards COMPACTOS: toque abre a PRÉVIA COMPLETA (grande),
              // de onde dá para preencher/alterar todas as planilhas.
              <ListaGrupos
                titulo={`${resultados.length} resultado(s) para “${termo.trim()}” — toque para ver a prévia completa`}
                grupos={resultados}
                aoAbrir={setPrevia}
              />
            )}
          </div>
        ) : listaTodos === null ? (
          <Carregando />
        ) : (
          <>
            <div className="integ-filtro">
              <Segmentado
                rotuloAria="Filtrar registros da planilha unida"
                valor={filtro}
                onMudar={setFiltro}
                opcoes={[
                  { valor: 'unidos', rotulo: `Unidos (${unidosLista.length})` },
                  { valor: 'todos', rotulo: `Todos (${todos?.length ?? 0})` },
                  { valor: 'geral', rotulo: `Geral (${geralLista.length})` },
                ]}
              />
            </div>
            <div className="rolagem">
              {listaTodos.length === 0 ? (
                <p className="integ-vazio">
                  {filtro === 'unidos'
                    ? 'Nenhuma referência bateu entre as planilhas ainda.'
                    : 'Nenhum registro nas planilhas do grupo.'}
                </p>
              ) : (
                <ListaGrupos
                  titulo={
                    filtro === 'unidos'
                      ? `${listaTodos.length} referência(s) unida(s) — toque para ver as informações juntas`
                      : filtro === 'todos'
                        ? `${listaTodos.length} referência(s) no total`
                        : `${listaTodos.length} registro(s) no geral (${colecoes.map((c) => c.nome).join(' + ')})`
                  }
                  grupos={listaTodos}
                  aoAbrir={setPrevia}
                />
              )}
            </div>
          </>
        )}
      </div>

      {previa !== null && (
        <FolhaInferior
          alta
          titulo={tituloDoGrupo(previa)}
          subtitulo={`${integracao.nome} — ${partesPresentes(previa)}/${previa.partes.length} planilhas unidas`}
          onFechar={() => setPrevia(null)}
          acaoTopo={
            <Botao
              variante="primario"
              className="btn--compacto"
              onClick={() => {
                setFocoEditor(undefined);
                setEditando(previa);
                setPrevia(null);
              }}
            >
              <PencilLine size={16} /> Preencher
            </Botao>
          }
        >
          {podeApagar && (
            <div className="integ-previa-apagar">
              <AcaoApagarIntegrado grupo={previa} podeApagar={podeApagar} aoApagar={apagarNaPrevia} />
            </div>
          )}
          <PreviaCorpo
            grupo={previa}
            aoAtualizarRegistro={(r) => {
              const i = previa.partes.findIndex((p) => p.colecao.id === r.colecaoId);
              if (i >= 0) atualizarParte(i, r);
            }}
            aoPreencher={(foco) => {
              setFocoEditor(foco);
              setEditando(previa);
              setPrevia(null);
            }}
          />
        </FolhaInferior>
      )}

      {editando !== null && (
        <FichaIntegrada
          integracao={integracao}
          chave={editando.chave}
          partes={editando.partes}
          aoFechar={() => {
            setEditando(null);
            setFocoEditor(undefined);
          }}
          aoAtualizarParte={atualizarParte}
          aoNovoUnificado={() => void novoUnificado()}
          aoAbrirGrupo={setEditando}
          focoInicial={focoEditor}
        />
      )}
    </div>
  );
}

function ListaGrupos({
  titulo,
  grupos,
  aoAbrir,
}: {
  titulo: string;
  grupos: RegistroIntegrado[];
  aoAbrir: (g: RegistroIntegrado) => void;
}): JSX.Element {
  return (
    <>
      <p className="integ-dica">{titulo}</p>
      <div className="lista integ-lista-registros">
        {grupos.map((g, i) => (
          // O "zip" pode emitir grupos com a mesma chave (mesma ref, planilhas com
          // vários registros); o índice evita key React duplicada (cards embaralhando).
          <CartaoRegistro key={`${g.chave}:${i}`} grupo={g} aoAbrir={() => aoAbrir(g)} />
        ))}
      </div>
    </>
  );
}

/** Card de registro no padrão dos blocos das planilhas (Modelagem/Caderno):
 *  miniatura à esquerda, título da(s) referência(s) e a linha "X/N planilhas". */
function CartaoRegistro({
  grupo,
  aoAbrir,
}: {
  grupo: RegistroIntegrado;
  aoAbrir: () => void;
}): JSX.Element {
  const capa = capaDoGrupo(grupo);
  const titulo = tituloDoGrupo(grupo);
  const presentesArr = grupo.partes.filter((p) => p.registro !== null);
  const presentes = presentesArr.length;
  // Cartão com uma parte só (ex.: modo "Geral" separado): mostra a planilha de
  // origem em vez de "1/N planilhas".
  const meta =
    presentes === 1 && presentesArr[0] !== undefined
      ? presentesArr[0].colecao.nome
      : `${presentes}/${grupo.partes.length} planilhas`;
  return (
    <button type="button" className="lista-item integ-lista-item" onClick={aoAbrir}>
      <span className="lista-item__capa-btn" aria-hidden="true">
        {capa !== null ? (
          <Miniatura fotoKey={capa} tamanho={56} />
        ) : (
          <span
            className="capa capa--vazia"
            style={{
              width: 56,
              height: 56,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 8,
            }}
          >
            <ImageOff size={20} />
          </span>
        )}
      </span>
      <div className="lista-item__corpo">
        <span className="lista-item__titulo">{titulo}</span>
        <span className="lista-item__resumo">{meta}</span>
      </div>
    </button>
  );
}

/** Corpo da prévia unida: cada parte vira um cartão (planilha + registro). Usa o
 *  RegistroPreview padrão — assim traz o COMPARTILHAR (link/imagem) e o renomear
 *  que já existem nas outras planilhas. Reutilizado na folha inferior e na busca. */
function PreviaCorpo({
  grupo,
  aoAtualizarRegistro,
  aoPreencher,
}: {
  grupo: RegistroIntegrado;
  aoAtualizarRegistro?: (r: Registro) => void;
  // Abre a edição (Oficina) para preencher; `foco` = índice da planilha escolhida.
  aoPreencher?: (foco?: number) => void;
}): JSX.Element {
  // Navegação entre as planilhas do grupo: como a prévia unida fica grande, detecta
  // quais partes estão à vista e mostra, no rodapé rolável, chips só das que NÃO estão,
  // para pular direto até elas (a atual some da lista).
  const previaRef = useRef<HTMLDivElement>(null);
  const parteRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [visiveis, setVisiveis] = useState<Set<number>>(new Set());
  // Última planilha para onde o usuário pulou pelos chips — o "Preencher" abre nela.
  const [alvo, setAlvo] = useState<number | null>(null);
  // Partes atualmente em modo COMPARTILHAR — enquanto houver alguma, some a nav
  // flutuante (senão ela cobre a barra/FAB de compartilhar e trava a seleção).
  const [compartilhando, setCompartilhando] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Na prévia (folha) a raiz é .folha__corpo; na BUSCA (inline) é .rolagem.
    const root = previaRef.current?.closest('.folha__corpo, .rolagem') ?? null;
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
      { root, threshold: 0.2 },
    );
    for (const el of parteRefs.current) if (el !== null) obs.observe(el);
    return () => obs.disconnect();
  }, [grupo.partes.length]);

  function irPara(indice: number): void {
    parteRefs.current[indice]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const naoVisiveis = grupo.partes.map((_, i) => i).filter((i) => !visiveis.has(i));

  return (
    <div className="integ-previa" ref={previaRef}>
      {grupo.partes.map((parte, i) => (
        <div
          key={parte.colecao.id}
          ref={(el) => {
            parteRefs.current[i] = el;
          }}
          data-idx={i}
        >
          {parte.registro !== null ? (
            <article className="integ-previa-parte">
              <RegistroPreview
                colecao={parte.colecao}
                registro={parte.registro}
                fonte={parte.colecao.nome}
                aoAtualizar={aoAtualizarRegistro}
                aoAbrir={
                  aoPreencher !== undefined
                    ? () => {
                        setAlvo(i);
                        aoPreencher(i);
                      }
                    : undefined
                }
                aoModoShare={(ativo) =>
                  setCompartilhando((prev) => {
                    const n = new Set(prev);
                    if (ativo) n.add(parte.colecao.id);
                    else n.delete(parte.colecao.id);
                    return n;
                  })
                }
              />
            </article>
          ) : (
            <article className="integ-previa-parte integ-previa-parte--ausente">
              <div className="integ-previa-parte__cabecalho">
                <span className="integ-previa-parte__fonte">{parte.colecao.nome}</span>
                <span className="integ-previa-parte__vazio">Sem registro para esta referência</span>
              </div>
            </article>
          )}
        </div>
      ))}

      {compartilhando.size === 0 &&
        grupo.partes.length > 1 &&
        (naoVisiveis.length > 0 || aoPreencher !== undefined) && (
        <div className="integ-nav-previa" aria-label="Ir para planilha / preencher">
          {naoVisiveis.length > 0 && (
            <div className="integ-nav-previa__planilhas">
              {naoVisiveis.map((i) => (
                <button
                  key={grupo.partes[i]?.colecao.id ?? i}
                  type="button"
                  className="integ-nav-previa__chip"
                  onClick={() => {
                    irPara(i);
                    setAlvo(i);
                  }}
                >
                  {grupo.partes[i]?.colecao.nome ?? 'Planilha'}
                </button>
              ))}
            </div>
          )}
          {aoPreencher !== undefined && (
            <button
              type="button"
              className="integ-nav-previa__preencher"
              onClick={() => aoPreencher(alvo ?? undefined)}
            >
              <PencilLine size={18} aria-hidden />
              {alvo !== null
                ? `Preencher ${grupo.partes[alvo]?.colecao.nome ?? ''}`.trim()
                : 'Preencher'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Botão de lixeira que expande para confirmação. Apaga o registro em TODAS as
 *  planilhas do grupo (Modelagem + Caderno do Hugo). */
function AcaoApagarIntegrado({
  grupo,
  podeApagar,
  aoApagar,
}: {
  grupo: RegistroIntegrado;
  podeApagar: boolean;
  aoApagar: (g: RegistroIntegrado) => Promise<void>;
}): JSX.Element | null {
  const [confirmando, setConfirmando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!podeApagar) return null;

  async function confirmar(): Promise<void> {
    setApagando(true);
    setErro(null);
    try {
      await aoApagar(grupo);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível apagar');
      setApagando(false);
    }
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        className="btn btn--icone integ-apagar-btn"
        title="Enviar para a lixeira (em todas as planilhas)"
        aria-label="Apagar registro"
        onClick={() => {
          setConfirmando(true);
          setErro(null);
        }}
      >
        <Trash2 size={18} aria-hidden />
      </button>
    );
  }

  return (
    <div className="integ-apagar-confirma">
      <span className="integ-apagar-confirma__txt">
        Mover para a lixeira em todas as planilhas? Dados e fotos ficam salvos até apagar definitivo.
      </span>
      <div className="integ-apagar-confirma__acoes">
        <Botao variante="perigo" disabled={apagando} onClick={() => void confirmar()}>
          {apagando ? 'Apagando…' : 'Lixeira'}
        </Botao>
        <Botao variante="fantasma" disabled={apagando} onClick={() => setConfirmando(false)}>
          Cancelar
        </Botao>
      </div>
      {erro !== null && <p className="aviso-erro">{erro}</p>}
    </div>
  );
}
