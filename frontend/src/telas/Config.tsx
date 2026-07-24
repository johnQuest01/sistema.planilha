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

  const [oficina, setOficina] = useState<ColecaoResumo | null | undefined>(undefined);
  const [senhaOficina, setSenhaOficina] = useState('');
  const [senhaSalva, setSenhaSalva] = useState<string | null>(null);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [salvandoSenha, setSalvandoSenha] = useState(false);

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
    if (estado.fase !== 'logado' || estado.usuario.papel !== 'dono') return;
    let vivo = true;
    void api
      .listarColecoes()
      .then((cs) => {
        if (!vivo) return;
        const achada =
          cs.find((c) => c.nome.trim().toLowerCase() === 'oficina') ?? null;
        setOficina(achada);
      })
      .catch(() => {
        if (vivo) setOficina(null);
      });
    return () => {
      vivo = false;
    };
  }, [estado]);

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

  async function salvarSenhaOficina(): Promise<void> {
    if (oficina === null || oficina === undefined) return;
    const limpo = senhaOficina.trim();
    if (limpo.length < 4) {
      setErroSenha('a senha precisa ter ao menos 4 caracteres');
      return;
    }
    setSalvandoSenha(true);
    setErroSenha(null);
    try {
      await api.definirSenhaColecao(oficina.id, limpo);
      setSenhaSalva(limpo);
      setSenhaOficina('');
      setOficina({ ...oficina, protegida: true, bloqueada: false });
    } catch (e) {
      setErroSenha(e instanceof ErroApi ? e.message : 'não foi possível salvar a senha');
    } finally {
      setSalvandoSenha(false);
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

          <hr className="config__sep" />

          <h2 className="config__titulo">
            <Lock size={20} />
            Senha da Oficina
          </h2>
          <p className="config__ajuda">
            Só a planilha chamada <strong>Oficina</strong> pode ter senha. Depois de definir,
            demais usuários precisam digitar essa senha uma vez. Acesso automático (sem digitar):
            você, Jurandir, Célio, Kauan e Alex.
          </p>

          {oficina === undefined && <p className="config__ajuda">Carregando planilhas…</p>}
          {oficina === null && (
            <p className="aviso-erro">
              Nenhuma planilha chamada “Oficina” encontrada. Crie ou renomeie uma planilha para
              “Oficina” e volte aqui.
            </p>
          )}
          {oficina !== null && oficina !== undefined && (
            <div className="config__forma">
              {senhaSalva !== null && (
                <div className="config__salvo">
                  <span className="config__salvo-rotulo">Senha da Oficina salva:</span>
                  <code className="config__salvo-codigo">{senhaSalva}</code>
                  <button
                    type="button"
                    className="link-texto"
                    onClick={() => void navigator.clipboard?.writeText(senhaSalva)}
                  >
                    copiar
                  </button>
                </div>
              )}
              <Campo
                rotulo={oficina.protegida ? 'Nova senha da Oficina' : 'Definir senha da Oficina'}
                type="password"
                placeholder="mínimo 4 caracteres"
                value={senhaOficina}
                onChange={(e) => setSenhaOficina(e.target.value)}
              />
              <div className="config__acoes">
                <Botao
                  variante="fantasma"
                  onClick={() => setSenhaOficina(gerarCodigo())}
                >
                  <Shuffle size={16} />
                  Gerar aleatória
                </Botao>
                <Botao
                  variante="primario"
                  onClick={() => void salvarSenhaOficina()}
                  disabled={salvandoSenha || senhaOficina.trim().length < 4}
                >
                  Salvar senha
                </Botao>
              </div>
              {erroSenha !== null && <p className="aviso-erro">{erroSenha}</p>}
              {oficina.protegida && senhaSalva === null && (
                <p className="config__ajuda">
                  Já existe senha nesta planilha. Salvar uma nova invalida os desbloqueios
                  anteriores (exceto o acesso automático).
                </p>
              )}
            </div>
          )}

          {podeGerirSenhas && (
            <>
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
