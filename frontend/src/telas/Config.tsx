import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound, Lock, Shuffle, Users } from 'lucide-react';
import { api, ErroApi, type ColecaoResumo, type UsuarioResumo } from '../api/cliente';
import { useAuth } from '../contexto/Auth';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import { TopoApp } from './TopoApp';
import './telas.css';

// Gera um código no formato MOST-XXXX-XXXX (sem caracteres ambíguos).
function gerarCodigo(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += alfabeto[b % alfabeto.length];
  return `MOST-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

/** Senha de login legível o bastante pra entregar de boca/WhatsApp (mín. 8). */
function gerarSenhaLogin(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += alfabeto[b % alfabeto.length];
  return s;
}

export function Config(): JSX.Element {
  const { estado } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [salvo, setSalvo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [planilhas, setPlanilhas] = useState<ColecaoResumo[] | null>(null);
  const [senhasPlanilha, setSenhasPlanilha] = useState<Record<string, string>>({});
  const [senhaPlanilhaSalva, setSenhaPlanilhaSalva] = useState<{
    nome: string;
    senha: string;
  } | null>(null);
  const [erroSenhaPlanilha, setErroSenhaPlanilha] = useState<string | null>(null);
  const [salvandoPlanilhaId, setSalvandoPlanilhaId] = useState<string | null>(null);

  const [usuarios, setUsuarios] = useState<UsuarioResumo[] | null>(null);
  const [senhasDraft, setSenhasDraft] = useState<Record<string, string>>({});
  const [senhaEntregue, setSenhaEntregue] = useState<{ email: string; senha: string } | null>(
    null,
  );
  const [erroUsuarios, setErroUsuarios] = useState<string | null>(null);
  const [salvandoUsuarioId, setSalvandoUsuarioId] = useState<string | null>(null);

  const podeGerirSenhas =
    estado.fase === 'logado' && estado.usuario.podeGerirSenhas === true;

  useEffect(() => {
    if (!podeGerirSenhas) return;
    let vivo = true;
    void api
      .listarColecoes()
      .then((cs) => {
        if (vivo) setPlanilhas(cs);
      })
      .catch(() => {
        if (vivo) setPlanilhas([]);
      });
    return () => {
      vivo = false;
    };
  }, [podeGerirSenhas]);

  useEffect(() => {
    if (!podeGerirSenhas) return;
    let vivo = true;
    void api
      .listarUsuarios()
      .then((lista) => {
        if (vivo) setUsuarios(lista);
      })
      .catch((e) => {
        if (vivo) {
          setUsuarios([]);
          setErroUsuarios(e instanceof ErroApi ? e.message : 'não foi possível listar usuários');
        }
      });
    return () => {
      vivo = false;
    };
  }, [podeGerirSenhas]);

  // Só o dono usa esta tela. Membro que digitar /config volta pro início.
  if (estado.fase === 'logado' && estado.usuario.papel !== 'dono') {
    return <Navigate to="/" replace />;
  }

  async function salvar(): Promise<void> {
    const limpo = codigo.trim();
    if (limpo.length < 4) {
      setErro('o código precisa ter ao menos 4 caracteres');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await api.definirCodigoConvite(limpo);
      setSalvo(limpo);
      setCodigo('');
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarSenhaPlanilha(planilha: ColecaoResumo): Promise<void> {
    const limpo = (senhasPlanilha[planilha.id] ?? '').trim();
    if (limpo.length < 4) {
      setErroSenhaPlanilha('a senha precisa ter ao menos 4 caracteres');
      return;
    }
    setSalvandoPlanilhaId(planilha.id);
    setErroSenhaPlanilha(null);
    try {
      await api.definirSenhaColecao(planilha.id, limpo);
      setSenhaPlanilhaSalva({ nome: planilha.nome, senha: limpo });
      setSenhasPlanilha((prev) => {
        const next = { ...prev };
        delete next[planilha.id];
        return next;
      });
      setPlanilhas((lista) =>
        (lista ?? []).map((c) =>
          c.id === planilha.id ? { ...c, protegida: true, bloqueada: false } : c,
        ),
      );
    } catch (e) {
      setErroSenhaPlanilha(
        e instanceof ErroApi ? e.message : 'não foi possível salvar a senha',
      );
    } finally {
      setSalvandoPlanilhaId(null);
    }
  }

  async function tirarSenhaPlanilha(planilha: ColecaoResumo): Promise<void> {
    setSalvandoPlanilhaId(planilha.id);
    setErroSenhaPlanilha(null);
    try {
      await api.removerSenhaColecao(planilha.id);
      setSenhaPlanilhaSalva(null);
      setPlanilhas((lista) =>
        (lista ?? []).map((c) =>
          c.id === planilha.id ? { ...c, protegida: false, bloqueada: false } : c,
        ),
      );
    } catch (e) {
      setErroSenhaPlanilha(
        e instanceof ErroApi ? e.message : 'não foi possível remover a senha',
      );
    } finally {
      setSalvandoPlanilhaId(null);
    }
  }

  async function salvarSenhaUsuario(usuario: UsuarioResumo): Promise<void> {
    const limpo = (senhasDraft[usuario.id] ?? '').trim();
    if (limpo.length < 8) {
      setErroUsuarios('a senha de login precisa ter ao menos 8 caracteres');
      return;
    }
    setSalvandoUsuarioId(usuario.id);
    setErroUsuarios(null);
    try {
      await api.definirSenhaUsuario(usuario.id, limpo);
      setSenhaEntregue({ email: usuario.email, senha: limpo });
      setSenhasDraft((prev) => {
        const next = { ...prev };
        delete next[usuario.id];
        return next;
      });
    } catch (e) {
      setErroUsuarios(e instanceof ErroApi ? e.message : 'não foi possível salvar a senha');
    } finally {
      setSalvandoUsuarioId(null);
    }
  }

  return (
    <div className="pagina">
      <TopoApp />
      <div className="faixa">
        <div className="config">
          <h1 className="config__titulo">
            <KeyRound size={20} />
            Código de convite
          </h1>
          <p className="config__ajuda">
            Quem for criar conta precisa digitar este código. Por segurança, o código atual
            não é exibido — defina um novo abaixo quando quiser trocá-lo.
          </p>
          <p className="config__ajuda">
            Depois que a pessoa criar a conta, use a seção <strong>Senhas dos usuários</strong>{' '}
            abaixo para gerar a senha de login e entregar a ela.
          </p>

          {salvo !== null && (
            <div className="config__salvo">
              <span className="config__salvo-rotulo">Novo código salvo:</span>
              <code className="config__salvo-codigo">{salvo}</code>
              <button
                type="button"
                className="link-texto"
                onClick={() => void navigator.clipboard?.writeText(salvo)}
              >
                copiar
              </button>
            </div>
          )}

          <div className="config__forma">
            <Campo
              rotulo="Novo código"
              placeholder="ex.: MOST-AB12-CD34"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
            <div className="config__acoes">
              <Botao variante="fantasma" onClick={() => setCodigo(gerarCodigo())}>
                <Shuffle size={16} />
                Gerar aleatório
              </Botao>
              <Botao
                variante="primario"
                onClick={() => void salvar()}
                disabled={salvando || codigo.trim().length < 4}
              >
                Salvar código
              </Botao>
            </div>
            {erro !== null && <p className="aviso-erro">{erro}</p>}
          </div>

          {podeGerirSenhas && (
            <>
              <hr className="config__sep" />

              <h2 className="config__titulo">
                <Lock size={20} />
                Senhas das planilhas
              </h2>
              <p className="config__ajuda">
                Só você (<code>brunoacre07@gmail.com</code>) pode colocar ou tirar senha de
                qualquer planilha, na hora que quiser. Quem não tem acesso automático precisa
                digitar a senha uma vez para abrir.
              </p>

              {senhaPlanilhaSalva !== null && (
                <div className="config__salvo">
                  <span className="config__salvo-rotulo">
                    Senha de <strong>{senhaPlanilhaSalva.nome}</strong>:
                  </span>
                  <code className="config__salvo-codigo">{senhaPlanilhaSalva.senha}</code>
                  <button
                    type="button"
                    className="link-texto"
                    onClick={() =>
                      void navigator.clipboard?.writeText(senhaPlanilhaSalva.senha)
                    }
                  >
                    copiar
                  </button>
                </div>
              )}

              {planilhas === null && <p className="config__ajuda">Carregando planilhas…</p>}
              {planilhas !== null && planilhas.length === 0 && (
                <p className="config__ajuda">Nenhuma planilha criada ainda.</p>
              )}
              {planilhas !== null && planilhas.length > 0 && (
                <ul className="config__usuarios">
                  {planilhas.map((p) => {
                    const draft = senhasPlanilha[p.id] ?? '';
                    const salvandoEsta = salvandoPlanilhaId === p.id;
                    return (
                      <li key={p.id} className="config__usuario">
                        <div className="config__usuario-info">
                          <strong>{p.nome}</strong>
                          <span className="config__usuario-papel">
                            {p.protegida ? 'com senha' : 'sem senha'}
                          </span>
                        </div>
                        <Campo
                          rotulo={p.protegida ? 'Nova senha' : 'Definir senha'}
                          placeholder="mínimo 4 caracteres"
                          value={draft}
                          onChange={(e) =>
                            setSenhasPlanilha((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                        />
                        <div className="config__acoes">
                          <Botao
                            variante="fantasma"
                            onClick={() =>
                              setSenhasPlanilha((prev) => ({
                                ...prev,
                                [p.id]: gerarCodigo(),
                              }))
                            }
                          >
                            <Shuffle size={16} />
                            Gerar
                          </Botao>
                          <Botao
                            variante="primario"
                            onClick={() => void salvarSenhaPlanilha(p)}
                            disabled={salvandoEsta || draft.trim().length < 4}
                          >
                            Salvar senha
                          </Botao>
                          {p.protegida && (
                            <Botao
                              variante="fantasma"
                              onClick={() => void tirarSenhaPlanilha(p)}
                              disabled={salvandoEsta}
                            >
                              Tirar senha
                            </Botao>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {erroSenhaPlanilha !== null && (
                <p className="aviso-erro">{erroSenhaPlanilha}</p>
              )}

              <hr className="config__sep" />

              <h2 className="config__titulo">
                <Users size={20} />
                Senhas dos usuários
              </h2>
              <p className="config__ajuda">
                Só você (<code>brunoacre07@gmail.com</code>) pode gerar ou trocar a senha de
                login de qualquer conta — inclusive Jurandir. Gere, salve e entregue a senha
                para a pessoa entrar no app.
              </p>

              {senhaEntregue !== null && (
                <div className="config__salvo">
                  <span className="config__salvo-rotulo">
                    Senha de <code>{senhaEntregue.email}</code>:
                  </span>
                  <code className="config__salvo-codigo">{senhaEntregue.senha}</code>
                  <button
                    type="button"
                    className="link-texto"
                    onClick={() => void navigator.clipboard?.writeText(senhaEntregue.senha)}
                  >
                    copiar
                  </button>
                </div>
              )}

              {usuarios === null && <p className="config__ajuda">Carregando usuários…</p>}
              {usuarios !== null && usuarios.length === 0 && (
                <p className="config__ajuda">Nenhum usuário cadastrado ainda.</p>
              )}
              {usuarios !== null && usuarios.length > 0 && (
                <ul className="config__usuarios">
                  {usuarios.map((u) => {
                    const draft = senhasDraft[u.id] ?? '';
                    const salvandoEste = salvandoUsuarioId === u.id;
                    return (
                      <li key={u.id} className="config__usuario">
                        <div className="config__usuario-info">
                          <strong>{u.nome}</strong>
                          <code>{u.email}</code>
                          <span className="config__usuario-papel">{u.papel}</span>
                        </div>
                        <Campo
                          rotulo="Nova senha de login"
                          placeholder="mínimo 8 caracteres"
                          value={draft}
                          onChange={(e) =>
                            setSenhasDraft((prev) => ({ ...prev, [u.id]: e.target.value }))
                          }
                        />
                        <div className="config__acoes">
                          <Botao
                            variante="fantasma"
                            onClick={() =>
                              setSenhasDraft((prev) => ({
                                ...prev,
                                [u.id]: gerarSenhaLogin(),
                              }))
                            }
                          >
                            <Shuffle size={16} />
                            Gerar
                          </Botao>
                          <Botao
                            variante="primario"
                            onClick={() => void salvarSenhaUsuario(u)}
                            disabled={salvandoEste || draft.trim().length < 8}
                          >
                            Salvar senha
                          </Botao>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {erroUsuarios !== null && <p className="aviso-erro">{erroUsuarios}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
