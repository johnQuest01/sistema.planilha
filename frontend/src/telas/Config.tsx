import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound, Lock, Shuffle } from 'lucide-react';
import { api, ErroApi, type ColecaoResumo } from '../api/cliente';
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
            Para o Jurandir (<code>jurandirsilvadesena123@gmail.com</code>): gere e salve um
            código, envie a ele e peça para criar a conta com exatamente esse e-mail. Ele e
            você já entram na Oficina sem digitar a senha da planilha.
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
            demais usuários precisam digitar essa senha uma vez. Você (
            <code>brunoacre07@gmail.com</code>) e{' '}
            <code>jurandirsilvadesena123@gmail.com</code> têm acesso automático.
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
        </div>
      </div>
    </div>
  );
}
